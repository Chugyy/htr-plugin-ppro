"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api-client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    try {
      const res = await apiFetch("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Verification failed");
      }
      toast.success("Email vérifié !");
      router.push("/register/plan");
    } catch (err: any) {
      toast.error(err.message || "Code invalide");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await apiFetch("/api/auth/resend-code", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Nouveau code envoyé !");
    } catch {
      toast.error("Erreur lors de l'envoi");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <Card className="card-base border">
        <CardHeader>
          <CardTitle className="text-lg text-[var(--cream)]">Vérification de l&apos;email</CardTitle>
          <p className="text-xs text-[var(--gray)]">
            Un code à 6 chiffres a été envoyé à votre adresse email.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="code" className="text-[var(--cream-dim)]">Code de vérification</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                className="form-input w-full text-center text-xl tracking-[0.3em] font-mono"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
              />
            </div>

            <Button type="submit" disabled={loading || code.length !== 6} variant="liquid-glass" className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Vérifier
            </Button>

            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="text-xs text-center text-[var(--gray)] hover:text-[var(--blue-light)] transition-colors cursor-pointer"
            >
              {resending ? "Envoi en cours..." : "Renvoyer le code"}
            </button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
