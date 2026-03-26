"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { PeriodToggle } from "@/components/billing/PeriodToggle";
import { PlanCard } from "@/components/billing/PlanCard";
import { usePlans } from "@/services/plans/hooks";
import { useCreateCheckout } from "@/services/billing/hooks";

const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "Pour les éditeurs individuels",
    prices: { monthly: { display: "14" }, annual: { display: "9", displayYearly: "108" } },
    highlighted: false,
    limits: { transcriptions: 15, corrections: 15, derushages: 15, normalizations: 15 },
    features: [
      "15 transcriptions / mois",
      "15 corrections / mois",
      "15 dérushages / mois",
      "15 normalisations / mois",
    ],
    minSeats: null,
    trialDays: 14,
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pour les éditeurs actifs",
    prices: { monthly: { display: "39" }, annual: { display: "27", displayYearly: "324" } },
    highlighted: true,
    limits: { transcriptions: 60, corrections: 60, derushages: 60, normalizations: 60 },
    features: [
      "60 transcriptions / mois",
      "60 corrections / mois",
      "60 dérushages / mois",
      "60 normalisations / mois",
      "Support prioritaire",
    ],
    minSeats: null,
    trialDays: 14,
  },
  {
    id: "agency",
    name: "Agence",
    description: "Pour les équipes",
    prices: { monthly: { display: "29", perSeat: true } },
    highlighted: false,
    limits: { transcriptions: 60, corrections: 60, derushages: 60, normalizations: 60 },
    limitsNote: "par siège",
    features: [
      "60 de chaque / siège / mois",
      "Gestion d'équipe",
      "Support prioritaire",
    ],
    minSeats: 3,
    trialDays: 14,
  },
];

export default function PlanSelectionPage() {
  const [period, setPeriod] = useState<"monthly" | "annual">("monthly");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const { data: plansData } = usePlans();
  const createCheckout = useCreateCheckout();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plans: any[] = plansData?.plans ?? FALLBACK_PLANS;

  const handleSelect = (priceKey: string, planKey: string, quantity?: number) => {
    setLoadingPlan(planKey);
    createCheckout.mutate(
      { priceKey, quantity },
      {
        onSuccess: (data) => {
          window.location.href = data.checkoutUrl;
        },
        onError: () => {
          toast.error("Erreur lors de la création du paiement");
          setLoadingPlan(null);
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-16">
      <h1 className="text-2xl font-bold text-foreground mb-2">Choisis ton plan</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Annulation à tout moment · Sans engagement
      </p>

      <div className="flex justify-center mb-8">
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {plans.map((plan: any) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            period={period}
            isLoading={loadingPlan === plan.id}
            onSelect={(priceKey, quantity) => handleSelect(priceKey, plan.id, quantity)}
          />
        ))}
      </div>
    </div>
  );
}
