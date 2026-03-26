"use client";

import { Key } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiKeysTable } from "./ApiKeysTable";
import { CreateApiKeyDialog } from "./CreateApiKeyDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { useApiKeys } from "@/services/api-key/hooks";

export function ApiKeysSection() {
  const { data: keys, isLoading } = useApiKeys();
  const isEmpty = !isLoading && (!keys || keys.length === 0);

  return (
    <Card className="card-base border">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
        <h2 className="text-xs font-semibold text-[var(--cream)]">Clés API</h2>
        <CreateApiKeyDialog />
      </CardHeader>
      <CardContent className="px-4 pb-3 pt-0">
        {isEmpty ? (
          <EmptyState
            icon={Key}
            title="Aucune clé API"
            description="Créez votre première clé pour utiliser le plugin."
          />
        ) : (
          <ApiKeysTable />
        )}
      </CardContent>
    </Card>
  );
}
