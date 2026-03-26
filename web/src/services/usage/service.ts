import { apiFetch } from "@/lib/api-client";
import type { UsageCurrentResponse } from "./types";

export async function getCurrentUsage(apiKeyId?: number): Promise<UsageCurrentResponse> {
  const params = apiKeyId ? `?api_key_id=${apiKeyId}` : "";
  const res = await apiFetch(`/api/usage/current${params}`);
  if (!res.ok) throw new Error("Failed to fetch usage");
  return res.json();
}
