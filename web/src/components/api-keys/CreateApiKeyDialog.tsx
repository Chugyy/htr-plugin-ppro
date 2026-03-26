"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "./CopyButton";
import { useCreateApiKey } from "@/services/api-key/hooks";
import type { ApiKeyResponse } from "@/services/api-key/types";

const schema = z.object({ name: z.string().min(1, "Nom requis").max(64) });
type FormData = z.infer<typeof schema>;

export function CreateApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<ApiKeyResponse | null>(null);
  const createKey = useCreateApiKey();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = (data: FormData) => {
    createKey.mutate(data, {
      onSuccess: (key) => {
        setCreated(key);
        reset();
      },
      onError: () => toast.error("Erreur lors de la création de la clé"),
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setCreated(null);
      reset();
    }
    setOpen(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <Button size="sm" variant="liquid-glass" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Créer une clé
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[var(--cream)]">
            {created ? "Clé créée" : "Nouvelle clé API"}
          </DialogTitle>
        </DialogHeader>

        {created ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--gray)]">
              Copiez cette clé maintenant — elle ne sera plus affichée.
            </p>
            <div className="code-block flex items-center gap-2">
              <code className="text-xs flex-1 break-all font-mono text-[var(--cream-dim)]">{created.key}</code>
              <CopyButton text={created.key} />
            </div>
            <Button onClick={() => handleClose(false)} className="w-full">
              Terminé
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name" className="text-[var(--cream-dim)]">Nom de la clé</Label>
              <Input id="name" placeholder="Ex: Plugin Premiere Pro" className="form-input w-full" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <Button type="submit" disabled={createKey.isPending}>
              {createKey.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Générer
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
