"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLogin } from "@/services/auth/hooks";

const schema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

type FormData = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    login.mutate(data, {
      onSuccess: () => router.push("/dashboard"),
      onError: () => toast.error("Email ou mot de passe incorrect"),
    });
  };

  return (
    <Card className="card-base border">
      <CardHeader>
        <CardTitle className="text-lg text-[var(--cream)]">Se connecter</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[var(--cream-dim)]">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="vous@exemple.com"
              className="form-input w-full"
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[var(--cream-dim)]">Mot de passe</Label>
              <Link href="/forgot-password" className="text-xs text-[var(--blue-light)] hover:underline">
                Mot de passe oublié ?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              className="form-input w-full"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={login.isPending} variant="liquid-glass" className="w-full">
            {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Se connecter
          </Button>

          <p className="text-xs text-center text-[var(--gray)]">
            Pas de compte ?{" "}
            <Link href="/register" className="text-[var(--blue-light)] hover:underline">
              S&apos;inscrire
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
