export interface FeatureUsage {
  used: number;
  limit: number;
}

export interface UsageCurrentResponse {
  plan: string;
  period: string;
  features: {
    transcription: FeatureUsage;
    correction: FeatureUsage;
    derushing: FeatureUsage;
    normalization: FeatureUsage;
    color_correction: FeatureUsage;
  };
}
