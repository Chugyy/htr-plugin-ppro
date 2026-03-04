/**
 * Transcription Correction Job
 * Orchestrates: Premiere Pro API → Backend API → Premiere Pro API
 */

import * as premiereProAPI from '../api/premiereProAPI';
import { backendClient } from '../api/backendAPI';
import type { CorrectionResponse } from '@/core/types';
import { transcriptToPlainText } from '@/core/utils';

/**
 * Load existing transcript from active sequence
 * Used by: correctionHooks.onLoadTranscript()
 */
export async function loadExistingTranscript(): Promise<string> {
  console.log("[JOB] loadExistingTranscript() started");

  try {
    // 1. Get active sequence
    const sequence = await premiereProAPI.getActiveSequence();
    const project = await premiereProAPI.getActiveProject();
    const rootItem = await project.getRootItem();

    // 2. Find sequence in project items
    const items = await rootItem.getItems();
    let sequenceClipItem = null;

    for (const item of items) {
      if (item.name === sequence.name) {
        const ppro = window.require("premierepro");
        sequenceClipItem = ppro.ClipProjectItem.cast(item);
        break;
      }
    }

    if (!sequenceClipItem) {
      throw new Error("Could not find sequence clip item");
    }

    // 3. Export transcript from sequence
    const transcriptJSON = await premiereProAPI.exportTranscript(sequenceClipItem);

    if (!transcriptJSON) {
      throw new Error("No transcript found in sequence. Please generate a transcription first.");
    }

    // 4. Convert JSON to plain text for editing
    const transcriptText = transcriptToPlainText(transcriptJSON);

    console.log("[JOB] loadExistingTranscript() completed");
    console.log(`[JOB] Loaded transcript with ${transcriptText.length} characters`);

    return transcriptText;

  } catch (error) {
    console.error("[JOB] loadExistingTranscript() failed:", error);
    throw error;
  }
}

/**
 * Correct transcription using backend grammar checker
 * Used by: correctionHooks.onCorrect()
 *
 * Orchestration:
 * 1. Parse text to PremiereTranscriptJSON (or load existing)
 * 2. Call backend to correct transcription
 * 3. Import corrected transcript to Premiere Pro
 * 4. Return response
 */
export async function correctTranscription(
  transcriptText: string
): Promise<CorrectionResponse> {
  console.log("[JOB] correctTranscription() started");

  try {
    // 1. Load existing transcript JSON from sequence
    const sequence = await premiereProAPI.getActiveSequence();
    const project = await premiereProAPI.getActiveProject();
    const rootItem = await project.getRootItem();

    // Find sequence in project items
    const items = await rootItem.getItems();
    let sequenceClipItem = null;

    for (const item of items) {
      if (item.name === sequence.name) {
        const ppro = window.require("premierepro");
        sequenceClipItem = ppro.ClipProjectItem.cast(item);
        break;
      }
    }

    if (!sequenceClipItem) {
      throw new Error("Could not find sequence clip item");
    }

    const transcriptJSON = await premiereProAPI.exportTranscript(sequenceClipItem);

    if (!transcriptJSON) {
      throw new Error("No transcript found in sequence");
    }

    // 2. Update transcript words with edited text
    // Split text by segments (paragraphs)
    const paragraphs = transcriptText.split('\n').filter(p => p.trim() !== '');

    // Update segments with new text (keep timing intact)
    for (let i = 0; i < Math.min(paragraphs.length, transcriptJSON.segments.length); i++) {
      const paragraph = paragraphs[i];
      const words = paragraph.split(/\s+/);
      const segment = transcriptJSON.segments[i];

      // Update words (distribute timing evenly)
      const wordDuration = segment.duration / words.length;
      segment.words = words.map((word, wordIndex) => ({
        text: word,
        start: segment.start + (wordIndex * wordDuration),
        duration: wordDuration,
        confidence: 1.0,
        eos: wordIndex === words.length - 1,
        tags: [],
        type: "word" as const
      }));
    }

    console.log("[JOB] Updated transcript JSON with edited text");

    // 3. Call backend to correct grammar/spelling
    console.log("[JOB] Calling backend for correction...");
    const response = await backendClient.correctTranscription(transcriptJSON);

    if (!response.correctedJson) {
      throw new Error("Transcription correction failed");
    }

    console.log(`[JOB] Correction completed successfully`);
    console.log(`[JOB] - Errors detected: ${response.errorsDetected.total}`);

    // 4. Import corrected transcript back to Premiere Pro
    console.log("[JOB] Importing corrected transcript to sequence...");
    await premiereProAPI.importTranscript(response.correctedJson, sequenceClipItem);
    console.log("[JOB] Corrected transcript imported successfully");

    console.log("[JOB] correctTranscription() completed");
    return response;

  } catch (error) {
    console.error("[JOB] correctTranscription() failed:", error);
    throw error;
  }
}
