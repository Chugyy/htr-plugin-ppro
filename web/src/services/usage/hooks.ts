"use client";

import { useQuery } from "@tanstack/react-query";
import { getCurrentUsage } from "./service";
import { queryKeys } from "@/lib/query-keys";

export function useCurrentUsage(apiKeyId?: number) {
  return useQuery({
    queryKey: queryKeys.usageCurrent(apiKeyId),
    queryFn: () => getCurrentUsage(apiKeyId),
    staleTime: 30 * 1000,
  });
}
