import type { PremiereTranscriptJSON } from '@/core/types';

export function transcriptToPlainText(transcript: PremiereTranscriptJSON): string {
  return transcript.segments
    .map(segment => segment.words.map(w => w.text).join(' '))
    .join('\n');
}
