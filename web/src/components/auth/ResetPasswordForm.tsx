"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useResetPassword } from "@/services/auth/hooks";

const schema = z
  .object({
    password: z.string().min(8, "8 caractères minimum"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirm"],
  });

type FormData = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const resetPassword = useResetPassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    if (!token) {
      toast.error("Lien invalide");
      return;
    }
    resetPassword.mutate(
      { token, new_password: data.password },
      {
        onSuccess: () => {
          toast.success("Mot de passe mis à jour");
          router.push("/login");
        },
        onError: () => toast.error("Lien expiré ou invalide"),
      }
    );
  };

  return (
    <Card className="card-base border">
      <CardHeader>
        <CardTitle className="text-lg text-[var(--cream)]">Nouveau mot de passe</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-[var(--cream-dim)]">Nouveau mot de passe</Label>
            <Input id="password" type="password" placeholder="••••••••" className="form-input w-full" {...register("password")} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm" className="text-[var(--cream-dim)]">Confirmer</Label>
            <Input id="confirm" type="password" placeholder="••••••••" className="form-input w-full" {...register("confirm")} />
            {errors.confirm && (
              <p className="text-xs text-destructive">{errors.confirm.message}</p>
            )}
          </div>

          <Button type="submit" disabled={resetPassword.isPending} variant="liquid-glass" className="w-full">
            {resetPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Mettre à jour
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
