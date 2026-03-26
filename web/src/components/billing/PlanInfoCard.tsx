"use client";

import { toast } from "sonner";
import Link from "next/link";
import { Loader2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBillingStatus, useCreatePortal } from "@/services/billing/hooks";
import { formatDate } from "@/lib/utils";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agence",
};

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  active: { label: "Actif", badgeClass: "badge-blue" },
  trialing: { label: "Essai gratuit", badgeClass: "badge-blue" },
  past_due: { label: "Paiement échoué", badgeClass: "badge-red" },
  canceled: { label: "Annulé", badgeClass: "badge-red" },
  canceling: { label: "Annulation prévue", badgeClass: "badge-blue" },
};

export function PlanInfoCard() {
  const { data: billing, isLoading } = useBillingStatus();
  const createPortal = useCreatePortal();

  const handlePortal = () => {
    createPortal.mutate(
      { returnUrl: window.location.href },
      {
        onSuccess: (data) => {
          window.location.href = data.portalUrl;
        },
        onError: () => toast.error("Impossible d'ouvrir le portail de facturation"),
      }
    );
  };

  if (isLoading) {
    return <Skeleton className="h-48 rounded-lg" />;
  }

  if (!billing) return null;

  const status = billing.subscriptionStatus ?? billing.status ?? "none";
  const { label, badgeClass } = STATUS_CONFIG[status] ?? { label: status, badgeClass: "badge-blue" };

  return (
    <Card className="card-base border max-w-lg">
      <CardHeader>
        <CardTitle className="text-sm text-[var(--cream)]">Abonnement actuel</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-[var(--cream)]">{PLAN_LABELS[billing.plan] ?? billing.plan}</span>
          <span className={`${badgeClass} text-xs font-medium px-2.5 py-0.5 rounded-full`}>{label}</span>
        </div>

        {(billing.currentPeriodEnd ?? billing.current_period_end) && (
          <p className="text-xs text-[var(--gray)]">
            Renouvellement le {formatDate(billing.currentPeriodEnd ?? billing.current_period_end)}
          </p>
        )}

        {billing.trialDaysRemaining && status === "trialing" && (
          <p className="text-xs text-[var(--gray)]">
            {billing.trialDaysRemaining} jours d&apos;essai restants
          </p>
        )}

        {billing.cancelAtPeriodEnd && (
          <p className="text-xs text-amber-400">
            Annulation prévue le {formatDate(billing.cancel_at)}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handlePortal}
            disabled={createPortal.isPending}
            size="sm"
            variant="liquid-glass"
          >
            {createPortal.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Gérer mon abonnement
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/register/plan">Changer de plan</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
