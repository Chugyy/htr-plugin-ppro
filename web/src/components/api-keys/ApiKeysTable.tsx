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
import { CopyButton } from "./CopyButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useApiKeys, useDeleteApiKey } from "@/services/api-key/hooks";
import { formatDate } from "@/lib/utils";

export function ApiKeysTable() {
  const { data: keys, isLoading } = useApiKeys();
  const deleteKey = useDeleteApiKey();

  const handleDelete = (id: number) => {
    deleteKey.mutate(id, {
      onSuccess: () => toast.success("Clé supprimée"),
      onError: () => toast.error("Erreur lors de la suppression"),
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

  if (!keys?.length) return null;

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-[var(--card-border)]">
          <TableHead className="text-[var(--cream-muted)] font-semibold">Nom</TableHead>
          <TableHead className="text-[var(--cream-muted)] font-semibold">Clé</TableHead>
          <TableHead className="text-[var(--cream-muted)] font-semibold">Créée le</TableHead>
          <TableHead className="text-[var(--cream-muted)] font-semibold">Dernière utilisation</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {keys.map((key) => (
          <TableRow key={key.id} className="border-[var(--card-border)] bg-[var(--card-bg)] hover:bg-[var(--card-bg-input)] transition-colors">
            <TableCell className="font-medium text-sm text-[var(--cream-dim)]">{key.name}</TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                <code className="text-xs font-mono text-[var(--gray)]">
                  {key.key.slice(0, 8)}••••••••
                </code>
                <CopyButton text={key.key} />
              </div>
            </TableCell>
            <TableCell className="text-xs text-[var(--gray)]">
              {formatDate(key.createdAt)}
            </TableCell>
            <TableCell className="text-xs text-[var(--gray)]">
              {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Jamais"}
            </TableCell>
            <TableCell>
              <ConfirmDialog
                title="Supprimer la clé ?"
                description="Cette action est irréversible. Les appels utilisant cette clé échoueront."
                onConfirm={() => handleDelete(key.id)}
                isLoading={deleteKey.isPending}
                trigger={
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-[var(--gray)] hover:text-[var(--red-text)]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
