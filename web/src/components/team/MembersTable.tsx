"use client";

import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useTeamMembers, useRemoveMember } from "@/services/team/hooks";

export function MembersTable() {
  const { data: members, isLoading } = useTeamMembers();
  const removeMember = useRemoveMember();

  const handleRemove = (userId: number) => {
    removeMember.mutate(userId, {
      onSuccess: () => toast.success("Membre retiré"),
      onError: () => toast.error("Erreur lors du retrait"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded" />
        ))}
      </div>
    );
  }

  if (!members?.length) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[var(--card-border)]">
          <TableHead className="text-[var(--gray)]">Nom</TableHead>
          <TableHead className="text-[var(--gray)]">Email</TableHead>
          <TableHead className="text-[var(--gray)]">Rôle</TableHead>
          <TableHead className="text-[var(--gray)]">Usage ce mois</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.user_id} className="border-[var(--card-border)] bg-[var(--card-bg)]">
            <TableCell className="font-medium text-sm text-[var(--cream-dim)]">{member.name}</TableCell>
            <TableCell className="text-xs text-[var(--gray)]">{member.email}</TableCell>
            <TableCell>
              <span className={`${member.role === "owner" ? "badge-blue" : "badge-blue"} text-[10px] font-medium px-2 py-0.5 rounded-full`}>
                {member.role === "owner" ? "Propriétaire" : "Membre"}
              </span>
            </TableCell>
            <TableCell className="text-xs text-[var(--gray)] tabular-nums">
              {member.usage_this_month} ops
            </TableCell>
            <TableCell>
              {member.role !== "owner" && (
                <ConfirmDialog
                  title="Retirer ce membre ?"
                  description="Ce membre perdra l'accès au plugin immédiatement."
                  onConfirm={() => handleRemove(member.user_id)}
                  isLoading={removeMember.isPending}
                  trigger={
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--gray)] hover:text-[var(--red-text)]">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
