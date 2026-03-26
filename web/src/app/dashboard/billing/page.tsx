import { PageHeader } from "@/components/shared/PageHeader";
import { PlanInfoCard } from "@/components/billing/PlanInfoCard";

export default function BillingPage() {
  return (
    <div>
      <PageHeader title="Abonnement" />
      <PlanInfoCard />
    </div>
  );
}
