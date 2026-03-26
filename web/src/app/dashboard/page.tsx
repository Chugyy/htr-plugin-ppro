"use client";

import { PageHeader } from "@/components/shared/PageHeader";
import { AlertBanner } from "@/components/dashboard/AlertBanner";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { ApiKeysSection } from "@/components/api-keys/ApiKeysSection";
import { useBillingStatus } from "@/services/billing/hooks";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { data: billing } = useBillingStatus();

  const getAlert = () => {
    if (!billing) return null;

    if (billing.status === "trialing" && billing.trial_ends_at) {
      const days = Math.ceil(
        (new Date(billing.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return {
        type: "trial" as const,
        message: `Il te reste ${days} jour${days > 1 ? "s" : ""} d'essai gratuit.`,
        action: { label: "Choisir un plan", href: "/register/plan" },
      };
    }

    if (billing.payment_failed) {
      return {
        type: "payment_failed" as const,
        message: "Paiement échoué — mets à jour ta carte pour continuer à utiliser le plugin.",
        action: { label: "Mettre à jour", href: "/dashboard/billing" },
      };
    }

    if (billing.status === "canceling" && billing.cancel_at) {
      return {
        type: "cancelling" as const,
        message: `Annulation prévue le ${formatDate(billing.cancel_at)}.`,
        action: { label: "Annuler la résiliation", href: "/dashboard/billing" },
      };
    }

    return null;
  };

  const alert = getAlert();

  return (
    <div>
      <PageHeader title="Tableau de bord" />
      {alert && <AlertBanner type={alert.type} message={alert.message} action={alert.action} />}
      <KpiGrid />
      <ApiKeysSection />
    </div>
  );
}
