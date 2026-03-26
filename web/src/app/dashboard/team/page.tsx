"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { MembersTable } from "@/components/team/MembersTable";
import { InviteMemberDialog } from "@/components/team/InviteMemberDialog";
import { AddSeatsDialog } from "@/components/team/AddSeatsDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useTeamMembers } from "@/services/team/hooks";
import { useBillingStatus } from "@/services/billing/hooks";

export default function TeamPage() {
  const router = useRouter();
  const { data: billing, isLoading: billingLoading } = useBillingStatus();
  const { data: members, isLoading: membersLoading } = useTeamMembers();

  useEffect(() => {
    if (!billingLoading && billing && billing.plan !== "agency") {
      router.replace("/dashboard");
    }
  }, [billing, billingLoading, router]);

  if (billingLoading) {
    return <Skeleton className="h-48 rounded-lg" />;
  }

  if (billing?.plan !== "agency") return null;

  const seatCount = billing.seat_count ?? 0;
  const memberCount = members?.length ?? 0;
  const isEmpty = !membersLoading && memberCount === 0;

  return (
    <div>
      <PageHeader
        title="Équipe"
        description={undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {memberCount}/{seatCount} sièges
            </Badge>
            <InviteMemberDialog />
            <AddSeatsDialog />
          </div>
        }
      />

      {membersLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={Users}
          title="Aucun membre invité"
          description="Invitez votre équipe pour partager les limites du plan Agency."
        />
      ) : (
        <MembersTable />
      )}
    </div>
  );
}
