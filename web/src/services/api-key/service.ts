import { apiFetch } from "@/lib/api-client";
import type { ApiKeyResponse, ApiKeyCreateRequest } from "./types";

export async function listApiKeys(): Promise<ApiKeyResponse[]> {
  const res = await apiFetch("/api/api-keys");
  if (!res.ok) throw new Error("Failed to fetch API keys");
  return res.json();
}

export async function createApiKey(data: ApiKeyCreateRequest): Promise<ApiKeyResponse> {
  const res = await apiFetch("/api/api-keys", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Failed to create key");
  return res.json();
}

export async function deleteApiKey(id: number): Promise<void> {
  const res = await apiFetch(`/api/api-keys/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete key");
}
