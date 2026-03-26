"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { UserPlus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteMember } from "@/services/team/hooks";

const schema = z.object({ email: z.string().email("Email invalide") });
type FormData = z.infer<typeof schema>;

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const invite = useInviteMember();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    invite.mutate(data, {
      onSuccess: () => {
        toast.success("Invitation envoyée");
        reset();
        setOpen(false);
      },
      onError: () => toast.error("Erreur lors de l'invitation"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" />
          Inviter un membre
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[var(--cream)]">Inviter un membre</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[var(--cream-dim)]">Email</Label>
            <Input id="email" type="email" placeholder="collegue@exemple.com" className="form-input w-full" {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Envoyer l&apos;invitation
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
