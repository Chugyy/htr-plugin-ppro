"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

interface PlanCardProps {
  plan: any;
  period: "monthly" | "annual";
  onSelect: (priceKey: string, quantity?: number) => void;
  isLoading?: boolean;
}

function FeatureLine({ text }: { text: string }) {
  return (
    <li className="flex gap-2 items-start text-xs mb-2 leading-snug text-[var(--cream-dim)]">
      <span className="shrink-0 mt-px text-[10px] text-[var(--blue-light)]">✓</span>
      {text}
    </li>
  );
}

export function PlanCard({ plan, period, onSelect, isLoading }: PlanCardProps) {
  const [seats, setSeats] = useState(3);

  // Handle both API format (prices.monthly.display) and fallback format
  const priceData = plan.prices?.[period] ?? plan.prices?.monthly;
  const displayPrice = priceData?.display ?? "—";
  const isPerSeat = priceData?.perSeat || plan.minSeats;
  const isAgency = plan.id === "agency";
  const hasAnnual = !!plan.prices?.annual;
  const limitsNote = plan.limitsNote ? ` ${plan.limitsNote}` : "";

  const priceKey = `${plan.id}_${period}`;

  const cardClass = plan.highlighted
    ? "card-blue-pricing h-full relative overflow-hidden"
    : "card-pricing h-full";

  return (
    <Card className={cardClass}>
      {plan.highlighted && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
      )}
      <CardContent className="p-5 md:p-7 flex flex-col h-full">
        <div className="font-black text-[18px] uppercase text-[var(--cream)] mb-1">{plan.name}</div>
        <div className="text-xs text-[var(--gray)] mb-5 leading-relaxed">{plan.description}</div>

        <div className="flex items-start gap-0.5 mb-0.5">
          <span className="text-base font-bold text-[var(--cream-dim)] mt-1">€</span>
          <span className="font-black text-[42px] text-[var(--cream)] leading-none tabular-nums">{displayPrice}</span>
          <span className="text-xs text-[var(--gray)] self-end mb-1">
            {isPerSeat ? "/siège/mois" : "/mois"}
          </span>
        </div>
        <div className="text-[11px] text-[var(--gray)] mb-5">
          {period === "annual" && hasAnnual ? "Facturé annuellement · -30%" : "Facturation mensuelle"}
          {isPerSeat && " · Min. 3 sièges"}
        </div>

        <Separator className="bg-[var(--card-separator)] mb-5" />

        <ul className="list-none mb-5 flex-1">
          {plan.limits && (
            <>
              <FeatureLine text={`${plan.limits.transcriptions}${limitsNote} transcriptions / mois`} />
              <FeatureLine text={`${plan.limits.corrections}${limitsNote} corrections / mois`} />
              <FeatureLine text={`${plan.limits.derushages}${limitsNote} dérushages / mois`} />
              <FeatureLine text={`${plan.limits.normalizations}${limitsNote} normalisations / mois`} />
            </>
          )}
          {(plan.features ?? [])
            .filter((f: any) => {
              const text = typeof f === "string" ? f : f.text;
              return !/transcription|correction|suppression|normalisation/i.test(text);
            })
            .map((f: any, i: number) => {
              const text = typeof f === "string" ? f : f.text;
              return <FeatureLine key={i} text={text} />;
            })}
        </ul>

        {isAgency && (
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">Nombre de sièges</label>
            <Input
              type="number"
              min={3}
              value={seats}
              onChange={(e) => setSeats(Math.max(3, Number(e.target.value)))}
              className="h-8 text-sm"
            />
          </div>
        )}

        <Button
          variant={plan.highlighted ? "liquid-glass" : "outline"}
          className="w-full rounded-full"
          disabled={isLoading}
          onClick={() => onSelect(priceKey, isAgency ? seats : undefined)}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Commencer
        </Button>
      </CardContent>
    </Card>
  );
}
