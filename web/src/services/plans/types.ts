export interface PlanPriceDetail {
  amount: number;
  currency: string;
  display: string;
  stripePriceId: string;
  interval: string;
  perSeat?: boolean;
  displayYearly?: string;
}

export interface PlanLimits {
  transcriptions: number;
  corrections: number;
  derushages: number;
  normalizations: number;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  prices: Record<string, PlanPriceDetail>;
  limits: PlanLimits;
  limitsNote?: string;
  features: string[];
  highlighted: boolean;
  minSeats: number | null;
  trialDays: number;
}

export interface PlansResponse {
  plans: Plan[];
  trial: {
    limits: PlanLimits;
    days: number;
  };
}
