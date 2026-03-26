"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
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
import { useAddSeats } from "@/services/team/hooks";

export function AddSeatsDialog() {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const addSeats = useAddSeats();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity < 1) return;
    addSeats.mutate(
      { quantity },
      {
        onSuccess: () => {
          toast.success("Sièges ajoutés");
          setQuantity(1);
          setOpen(false);
        },
        onError: () => toast.error("Erreur lors de l'ajout de sièges"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" />
          Ajouter des sièges
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[var(--cream)]">Ajouter des sièges</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantity" className="text-[var(--cream-dim)]">Nombre de sièges</Label>
            <Input
              id="quantity"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
              className="form-input w-full"
            />
            <p className="text-xs text-[var(--gray)]">
              La facturation sera proratiée immédiatement.
            </p>
          </div>
          <Button type="submit" disabled={addSeats.isPending}>
            {addSeats.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Confirmer
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
