"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useForgotPassword } from "@/services/auth/hooks";

const schema = z.object({ email: z.string().email("Email invalide") });
type FormData = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const forgotPassword = useForgotPassword();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    forgotPassword.mutate(data, { onSuccess: () => setSent(true) });
  };

  if (sent) {
    return (
      <Card className="card-base border">
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-[var(--cream)] font-medium">Email envoyé</p>
          <p className="text-xs text-[var(--gray)] mt-2">
            Un email a été envoyé si ce compte existe.
          </p>
          <Link href="/login" className="text-xs text-[var(--blue-light)] hover:underline mt-4 inline-block">
            Retour à la connexion
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-base border">
      <CardHeader>
        <CardTitle className="text-lg text-[var(--cream)]">Mot de passe oublié</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[var(--cream-dim)]">Email</Label>
            <Input id="email" type="email" placeholder="vous@exemple.com" className="form-input w-full" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <Button type="submit" disabled={forgotPassword.isPending} variant="liquid-glass" className="w-full">
            {forgotPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Envoyer le lien
          </Button>

          <p className="text-xs text-center">
            <Link href="/login" className="text-[var(--blue-light)] hover:underline">
              Retour à la connexion
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
