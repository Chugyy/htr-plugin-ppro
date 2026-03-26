"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listApiKeys, createApiKey, deleteApiKey } from "./service";
import { queryKeys } from "@/lib/query-keys";
import type { ApiKeyCreateRequest } from "./types";

export function useApiKeys() {
  return useQuery({
    queryKey: queryKeys.apiKeys,
    queryFn: listApiKeys,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ApiKeyCreateRequest) => createApiKey(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}

export function useDeleteApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys }),
  });
}
