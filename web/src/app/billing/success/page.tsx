"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { getBillingStatus } from "@/services/billing/service";

export default function BillingSuccessPage() {
  const [status, setStatus] = useState<"polling" | "active" | "error">("polling");

  useEffect(() => {
    let retries = 0;
    const MAX = 10;

    const poll = async () => {
      try {
        const billing = await getBillingStatus();
        console.log("[billing/success] poll response:", JSON.stringify(billing));
        const s = billing.subscriptionStatus ?? billing.status;
        console.log("[billing/success] resolved status:", s);
        if (s === "active" || s === "trialing") {
          setStatus("active");
          return;
        }
      } catch (err) {
        console.error("[billing/success] poll error:", err);
      }

      retries++;
      if (retries >= MAX) {
        setStatus("error");
        return;
      }
      setTimeout(poll, 2000);
    };

    poll();
  }, []);

  return (
    <AuthLayout>
      <Card className="card-base border">
        <CardContent className="py-6 flex flex-col items-center text-center gap-3">
          {status === "polling" && (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="font-semibold text-[var(--cream)]">Activation en cours...</p>
              <p className="text-xs text-[var(--gray)]">Synchronisation avec Stripe</p>
            </>
          )}

          {status === "active" && (
            <>
              <CheckCircle className="h-10 w-10 text-[var(--green)]" />
              <p className="font-semibold text-[var(--cream)]">Abonnement activé !</p>
              <p className="text-xs text-[var(--gray)]">Ton plugin est prêt à être utilisé.</p>
              <Button asChild variant="liquid-glass" className="mt-2">
                <Link href="/dashboard">Accéder au dashboard</Link>
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <XCircle className="h-10 w-10 text-[var(--amber)]" />
              <p className="font-semibold text-[var(--cream)]">Un problème est survenu</p>
              <p className="text-xs text-[var(--gray)]">
                Si tu as été débité, ton abonnement sera activé sous peu.
              </p>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => setStatus("polling")} variant="outline" size="sm">
                  Réessayer
                </Button>
                <Button asChild variant="liquid-glass" size="sm">
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
