"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { ApiKeyFilter } from "@/components/usage/ApiKeyFilter";
import { UsageCardsGrid } from "@/components/usage/UsageCardsGrid";
import { useBillingStatus } from "@/services/billing/hooks";

export default function UsagePage() {
  const [apiKeyId, setApiKeyId] = useState<string | undefined>(undefined);
  const { data: billing } = useBillingStatus();

  return (
    <div>
      <PageHeader
        title="Utilisation"
        description={`Mois en cours`}
      />

      <ApiKeyFilter
        value={apiKeyId}
        onChange={setApiKeyId}
      />

      <UsageCardsGrid apiKeyId={apiKeyId ? Number(apiKeyId) : undefined} />

      {billing?.plan === "starter" && (
        <div className="mt-8 p-4 rounded-lg bg-primary/5 border border-primary/10 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Tu es sur le plan Starter. Passe au Pro pour un usage illimité.
          </p>
          <Button asChild size="sm">
            <Link href="/register/plan">Upgrade vers Pro</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
