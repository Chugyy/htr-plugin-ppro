import { KpiCard } from "./KpiCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Calendar, Key, Activity } from "lucide-react";
import { useBillingStatus } from "@/services/billing/hooks";
import { useApiKeys } from "@/services/api-key/hooks";
import { useCurrentUsage } from "@/services/usage/hooks";
import { formatDate } from "@/lib/utils";

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  agency: "Agence",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "Impayé",
  canceled: "Annulé",
  canceling: "Annulation prévue",
};

export function KpiGrid() {
  const billing = useBillingStatus();
  const apiKeys = useApiKeys();
  const usage = useCurrentUsage();

  if (billing.isLoading || apiKeys.isLoading || usage.isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  const b = billing.data;
  const keys = apiKeys.data ?? [];
  const u = usage.data;

  const f = u?.features;
  const totalOps = f
    ? (f.transcription?.used ?? 0) + (f.correction?.used ?? 0) + (f.derushing?.used ?? 0) + (f.normalization?.used ?? 0) + (f.color_correction?.used ?? 0)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <KpiCard
        title="Plan"
        value={b ? PLAN_LABELS[b.plan] ?? b.plan : "—"}
        subtitle={b ? STATUS_LABELS[b.subscriptionStatus ?? b.status] ?? b.subscriptionStatus ?? b.status : undefined}
        icon={CreditCard}
      />
      <KpiCard
        title="Renouvellement"
        value={b?.currentPeriodEnd ? formatDate(b.currentPeriodEnd) : b?.current_period_end ? formatDate(b.current_period_end) : "—"}
        icon={Calendar}
      />
      <KpiCard
        title="Clés API"
        value={keys.length}
        subtitle="actives"
        icon={Key}
      />
      <KpiCard
        title="Opérations ce mois"
        value={totalOps}
        icon={Activity}
      />
    </div>
  );
}
