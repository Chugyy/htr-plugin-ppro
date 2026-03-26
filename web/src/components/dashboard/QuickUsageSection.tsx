"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UsageBar } from "./UsageBar";
import { useCurrentUsage } from "@/services/usage/hooks";

export function QuickUsageSection() {
  const { data, isLoading } = useCurrentUsage();

  return (
    <Card className="card-base border">
      <CardHeader>
        <CardTitle className="text-sm text-[var(--cream)]">Usage rapide</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 rounded" />
          ))
        ) : data ? (
          <>
            <UsageBar label="Transcriptions" used={data.features?.transcription?.used ?? 0} limit={data.features?.transcription?.limit ?? 0} />
            <UsageBar label="Corrections" used={data.features?.correction?.used ?? 0} limit={data.features?.correction?.limit ?? 0} />
            <UsageBar label="Dérushages" used={data.features?.derushing?.used ?? 0} limit={data.features?.derushing?.limit ?? 0} />
            <UsageBar label="Normalisations" used={data.features?.normalization?.used ?? 0} limit={data.features?.normalization?.limit ?? 0} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
