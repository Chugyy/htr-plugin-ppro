"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { UsageCard } from "./UsageCard";
import { useCurrentUsage } from "@/services/usage/hooks";
import { FileText, Pen, Scissors, Volume2, Palette } from "lucide-react";

interface UsageCardsGridProps {
  apiKeyId?: number;
}

export function UsageCardsGrid({ apiKeyId }: UsageCardsGridProps) {
  const { data, isLoading } = useCurrentUsage(apiKeyId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <UsageCard feature="Transcriptions" used={data.features?.transcription?.used ?? 0} limit={data.features?.transcription?.limit ?? 0} icon={FileText} />
      <UsageCard feature="Corrections" used={data.features?.correction?.used ?? 0} limit={data.features?.correction?.limit ?? 0} icon={Pen} />
      <UsageCard feature="Dérushages" used={data.features?.derushing?.used ?? 0} limit={data.features?.derushing?.limit ?? 0} icon={Scissors} />
      <UsageCard feature="Normalisations" used={data.features?.normalization?.used ?? 0} limit={data.features?.normalization?.limit ?? 0} icon={Volume2} />
      <UsageCard feature="Colorimétrie" used={data.features?.color_correction?.used ?? 0} limit={data.features?.color_correction?.limit ?? 0} icon={Palette} />
    </div>
  );
}
