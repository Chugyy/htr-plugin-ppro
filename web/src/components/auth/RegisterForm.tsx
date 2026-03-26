"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRegister } from "@/services/auth/hooks";

const schema = z.object({
  name: z.string().min(2, "Nom requis"),
  email: z.string().email("Email invalide"),
  password: z.string().min(8, "8 caractères minimum"),
});

type FormData = z.infer<typeof schema>;

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite_token") ?? undefined;
  const registerMutation = useRegister();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    registerMutation.mutate(
      { ...data, invite_token: inviteToken },
      {
        onSuccess: () => router.push("/register/verify"),
        onError: (err: Error) => {
          const msg = err.message.toLowerCase();
          if (msg.includes("409") || msg.includes("exist")) {
            toast.error("Email déjà utilisé");
          } else {
            toast.error("Erreur lors de l'inscription");
          }
        },
      }
    );
  };

  return (
    <Card className="card-base border">
      <CardHeader>
        <CardTitle className="text-lg text-[var(--cream)]">Créer un compte</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-[var(--cream-dim)]">Nom</Label>
            <Input id="name" placeholder="Jean Dupont" className="form-input w-full" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[var(--cream-dim)]">Email</Label>
            <Input id="email" type="email" placeholder="vous@exemple.com" className="form-input w-full" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-[var(--cream-dim)]">Mot de passe</Label>
            <Input id="password" type="password" placeholder="••••••••" className="form-input w-full" {...register("password")} />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" disabled={registerMutation.isPending} variant="liquid-glass" className="w-full">
            {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Créer mon compte
          </Button>

          <p className="text-xs text-center text-[var(--gray)]">
            Déjà un compte ?{" "}
            <Link href="/login" className="text-[var(--blue-light)] hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
