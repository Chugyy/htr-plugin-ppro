export type PlanName = "free" | "starter" | "pro" | "agency";
export type BillingStatus = "none" | "trialing" | "active" | "past_due" | "canceled" | "canceling";

export interface BillingStatusResponse {
  plan: PlanName;
  subscriptionStatus: BillingStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialDaysRemaining: number | null;
  seatCount: number | null;
  // snake_case fallbacks
  status?: BillingStatus;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at?: string | null;
  payment_failed?: boolean;
  seat_count?: number | null;
}

export interface CheckoutRequest {
  priceKey: string;
  quantity?: number;
}

export interface CheckoutResponse {
  checkoutUrl: string;
}

export interface PortalRequest {
  returnUrl?: string;
}

export interface PortalResponse {
  portalUrl: string;
}
