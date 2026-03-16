#!/usr/bin/env python3
# app/core/jobs/optimization.py
#
# Parallel audio optimization with chunk-level granularity.
#
# Strategy:
#   1. Flatten all clips from all tracks
#   2. Large clips (> CHUNK_DURATION_SECONDS) are split into sub-segments
#   3. All work-units (clips or chunks) enter a single queue
#   4. A global ffmpeg queue limits concurrency
#   5. Split clips are re-concatenated after all their chunks finish
#   6. Results are re-grouped by track for the response

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Any, Optional

from app.api.models.audio import TrackOptimizationDTO
from app.core.services.audio import get_audio_duration
from app.core.services.audio.optimization import (
    apply_optimization,
    apply_optimization_chunk,
    concat_chunks,
    measure_loudness,
    split_audio,
)
from app.core.jobs.utils import resolve_clip_audio
from app.core.services.queue import get_queue
from app.core.utils.format import sanitize_filename
from config.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal data structures
# ---------------------------------------------------------------------------

@dataclass
class ClipJob:
    """Represents one clip to optimize (possibly split into chunks)."""
    track_index: int
    filter_type: str
    clip_index: int
    clip_name: str
    audio_path: Path
    duration: float
    timeline_start: float
    timeline_end: float
    # Filled after processing
    optimized_path: Optional[Path] = None


@dataclass
class ChunkJob:
    """One FFmpeg work-unit (a whole small clip or a chunk of a large clip)."""
    clip_job: ClipJob
    chunk_path: Path
    chunk_index: int
    measured_params: Optional[Dict[str, float]] = None
    # Filled after processing
    optimized_chunk_path: Optional[Path] = None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def optimize_tracks(tracks: List[TrackOptimizationDTO]) -> Dict[str, Any]:
    """
    Optimize audio tracks with chunk-level parallelism.

    Returns same structure as before (no API change):
    {
        "optimized_tracks": [...],
        "processing_time": float,
        "output_directory": str
    }
    """
    start_time = time.time()
    created_files: List[Path] = []
    ffmpeg_queue = get_queue("ffmpeg")
    loop = asyncio.get_event_loop()

    try:
        # ── 1. Resolve audio files & build ClipJobs ──────────────────────
        clip_jobs: List[ClipJob] = []
        for track in tracks:
            for ci, clip in enumerate(track.clips):
                audio_path = await resolve_clip_audio(clip, created_files)
                duration = clip.source_out_point - clip.source_in_point
                clip_jobs.append(ClipJob(
                    track_index=track.track_index,
                    filter_type=track.filter_type.value,
                    clip_index=ci,
                    clip_name=clip.clip_name,
                    audio_path=audio_path,
                    duration=duration,
                    timeline_start=clip.timeline_start,
                    timeline_end=clip.timeline_end,
                ))

        # ── 2. Identify large clips → measure loudness + split ───────────
        chunk_map: Dict[int, List[ChunkJob]] = {}  # clip_job id → ordered chunks
        all_chunks: List[ChunkJob] = []
        threshold = settings.chunk_duration_seconds

        for idx, cj in enumerate(clip_jobs):
            if cj.duration > threshold:
                # Pass 1: measure loudness (fast, no encode)
                logger.info(f"[OPT] Measuring loudness: {cj.clip_name} ({cj.duration:.1f}s)")
                measured = await loop.run_in_executor(None, measure_loudness, cj.audio_path)

                # Split
                chunks = await loop.run_in_executor(None, split_audio, cj.audio_path, threshold)
                chunk_jobs = [
                    ChunkJob(clip_job=cj, chunk_path=cp, chunk_index=i, measured_params=measured)
                    for i, cp in enumerate(chunks)
                ]
                chunk_map[idx] = chunk_jobs
                all_chunks.extend(chunk_jobs)
                created_files.extend(chunks)
            else:
                # Small clip → single work-unit, no measured_params needed (single-pass loudnorm)
                cj_chunk = ChunkJob(clip_job=cj, chunk_path=cj.audio_path, chunk_index=0)
                chunk_map[idx] = [cj_chunk]
                all_chunks.append(cj_chunk)

        logger.info(f"[OPT] {len(clip_jobs)} clip(s) → {len(all_chunks)} work-unit(s), max_concurrent={settings.max_concurrent_ffmpeg}")

        # ── 3. Process all work-units in parallel (bounded by ffmpeg queue) ─
        async def _process_chunk(wu: ChunkJob) -> None:
            async def _run():
                if wu.measured_params:
                    wu.optimized_chunk_path = await loop.run_in_executor(
                        None, apply_optimization_chunk,
                        wu.chunk_path, wu.clip_job.filter_type, wu.measured_params,
                    )
                else:
                    wu.optimized_chunk_path = await loop.run_in_executor(
                        None, apply_optimization,
                        wu.chunk_path, wu.clip_job.filter_type,
                        wu.clip_job.clip_name, wu.clip_job.clip_index,
                        wu.clip_job.track_index,
                    )
            await ffmpeg_queue.submit(_run)

        await asyncio.gather(*[_process_chunk(wu) for wu in all_chunks])

        # ── 4. Re-concatenate split clips ────────────────────────────────
        output_dir = settings.temp_dir / "htr_optimized"
        output_dir.mkdir(parents=True, exist_ok=True)

        for idx, cj in enumerate(clip_jobs):
            chunks_for_clip = chunk_map[idx]
            if len(chunks_for_clip) == 1 and not chunks_for_clip[0].measured_params:
                # Small clip, already fully optimized in step 3
                cj.optimized_path = chunks_for_clip[0].optimized_chunk_path
            else:
                # Concat optimized chunks → final file
                ordered_opt = [c.optimized_chunk_path for c in sorted(chunks_for_clip, key=lambda c: c.chunk_index)]
                sanitized = sanitize_filename(cj.clip_name).replace(".", "_")
                final_path = output_dir / f"{cj.filter_type}_t{cj.track_index}_{sanitized}_{cj.clip_index}.wav"
                cj.optimized_path = await loop.run_in_executor(None, concat_chunks, ordered_opt, final_path)
                # Mark intermediate optimized chunks for cleanup
                created_files.extend(ordered_opt)

        # ── 5. Build response grouped by track ───────────────────────────
        track_results: Dict[int, Dict[str, Any]] = {}
        for cj in clip_jobs:
            duration = get_audio_duration(cj.optimized_path)
            entry = {
                "clip_name": cj.clip_name,
                "optimized_path": str(cj.optimized_path.resolve()),
                "duration": duration,
                "timeline_start": cj.timeline_start,
                "timeline_end": cj.timeline_end,
            }
            if cj.track_index not in track_results:
                track_results[cj.track_index] = {
                    "track_index": cj.track_index,
                    "filter_type": cj.filter_type,
                    "clips": [],
                }
            track_results[cj.track_index]["clips"].append(entry)

        # Preserve original track order
        ordered_tracks = [track_results[t.track_index] for t in tracks if t.track_index in track_results]

        return {
            "optimized_tracks": ordered_tracks,
            "processing_time": round(time.time() - start_time, 2),
            "output_directory": str(output_dir.resolve()),
        }

    finally:
        # Cleanup intermediate files (NOT final optimized files)
        for fp in created_files:
            try:
                if fp.exists():
                    fp.unlink()
                    logger.debug(f"Cleaned up: {fp}")
            except Exception as e:
                logger.warning(f"Cleanup failed {fp}: {e}")
