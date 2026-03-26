"use client";

import { useQuery } from "@tanstack/react-query";
import { getPlans } from "./service";
import { queryKeys } from "@/lib/query-keys";

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.plans,
    queryFn: getPlans,
    staleTime: 60 * 60 * 1000, // 1h
  });
}
