import Link from "next/link";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthLayout } from "@/components/auth/AuthLayout";

export default function BillingCancelPage() {
  return (
    <AuthLayout>
      <Card className="border-border bg-card">
        <CardContent className="pt-8 pb-8 flex flex-col items-center text-center gap-4">
          <XCircle className="h-12 w-12 text-muted-foreground" />
          <p className="font-semibold text-lg">Paiement annulé</p>
          <p className="text-xs text-muted-foreground">
            Aucun montant n&apos;a été prélevé.
          </p>
          <Button asChild className="mt-2">
            <Link href="/register/plan">Réessayer</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
