import { apiFetch } from "@/lib/api-client";
import type { PlansResponse } from "./types";

export async function getPlans(): Promise<PlansResponse> {
  const res = await apiFetch("/api/plans");
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}
