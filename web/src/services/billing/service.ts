import { apiFetch } from "@/lib/api-client";
import type {
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalRequest,
  PortalResponse,
} from "./types";

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  const res = await apiFetch("/api/billing/status");
  if (!res.ok) throw new Error("Failed to fetch billing status");
  return res.json();
}

export async function createCheckout(data: CheckoutRequest): Promise<CheckoutResponse> {
  const res = await apiFetch("/api/billing/checkout", {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? "Checkout failed");
  return res.json();
}

export async function createPortal(data?: PortalRequest): Promise<PortalResponse> {
  const res = await apiFetch("/api/billing/portal", {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
  if (!res.ok) throw new Error("Failed to open billing portal");
  return res.json();
}
