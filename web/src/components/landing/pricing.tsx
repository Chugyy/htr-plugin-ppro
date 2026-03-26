"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";
import { usePlans } from "@/services/plans/hooks";

const FALLBACK_PLANS = [
  {
    id: "starter",
    name: "Starter",
    description: "Pour les éditeurs individuels",
    prices: { monthly: { display: "14" }, annual: { display: "9" } },
    highlighted: false,
    features: [
      "15 transcriptions / mois",
      "15 corrections / mois",
      "15 dérushages / mois",
      "15 normalisations / mois",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Pour les éditeurs actifs",
    prices: { monthly: { display: "39" }, annual: { display: "27" } },
    highlighted: true,
    features: [
      "60 transcriptions / mois",
      "60 corrections / mois",
      "60 dérushages / mois",
      "60 normalisations / mois",
      "Support prioritaire",
    ],
  },
  {
    id: "agency",
    name: "Agence",
    description: "Pour les équipes",
    prices: { monthly: { display: "29", perSeat: true } },
    highlighted: false,
    minSeats: 3,
    features: [
      "60 de chaque / siège / mois",
      "Gestion d'équipe",
      "Support prioritaire",
    ],
  },
];

function LandingFeatureLine({ text }: { text: string }) {
  return (
    <li className="flex gap-2 items-start text-[11px] md:text-xs mb-2 md:mb-2.5 leading-[1.4] text-[var(--cream-dim)]">
      <span className="shrink-0 mt-px text-[10.5px] text-[var(--blue-light)]">✓</span>
      {text}
    </li>
  );
}

type Period = "monthly" | "yearly";

export function Pricing() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { data: plansData } = usePlans();
  const isYearly = period === "yearly";

  const plans: any[] = plansData?.plans ?? FALLBACK_PLANS;

  return (
    <div className="section-wrapper" id="pricing">
      <FadeInView>
        <SectionHeader tag="Tarifs">
          Simple. <em>Transparent.</em>
          <br />
          ROI immédiat.
        </SectionHeader>
      </FadeInView>

      <FadeInView delay={0.1}>
        <div className="flex justify-center mt-8">
          <div className="period-toggle">
            <button
              onClick={() => setPeriod("monthly")}
              className={`period-btn ${!isYearly ? "period-btn--active" : "period-btn--inactive"}`}
            >
              Mensuel
            </button>
            <button
              onClick={() => setPeriod("yearly")}
              className={`period-btn inline-flex items-center gap-1 ${isYearly ? "period-btn--active" : "period-btn--inactive"}`}
            >
              Annuel
              <span className={`text-[10px] ${isYearly ? "text-white/70" : "text-[var(--blue-light)]"}`}>
                -30%
              </span>
            </button>
          </div>
        </div>
      </FadeInView>

      <FadeInView delay={0.1}>
        <div className="mt-10 scroll-container scrollbar-hide">
          {plans.map((plan: any) => {
            const priceData = isYearly && plan.prices?.annual ? plan.prices.annual : plan.prices?.monthly;
            const displayPrice = priceData?.display ?? "—";
            const isPerSeat = priceData?.perSeat || plan.minSeats;
            const href = `/register?plan=${plan.id}&interval=${isYearly ? "annual" : "monthly"}`;
            const cardClass = plan.highlighted ? "card-blue-pricing h-full" : "card-pricing h-full";

            return (
              <div key={plan.id} className="scroll-item">
                <Card className={`${cardClass} relative overflow-hidden`}>
                  {plan.highlighted && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
                  )}
                  <CardContent className="p-5 md:p-7 flex flex-col h-full">
                    <div className="font-black text-[18px] md:text-[20px] uppercase text-[var(--cream)] mb-1">
                      {plan.name}
                    </div>
                    <div className="text-[11px] md:text-xs text-[var(--gray)] mb-4 md:mb-6 leading-[1.5]">
                      {plan.description}
                    </div>

                    <div className="flex items-start gap-0.5 mb-0.5">
                      <span className="text-[16px] md:text-[19px] font-bold text-[var(--cream-dim)] mt-1">€</span>
                      <span className="font-black text-[38px] md:text-[48px] text-[var(--cream)] leading-none tabular-nums transition-all">
                        {displayPrice}
                      </span>
                      <span className="text-[11px] md:text-[12.5px] text-[var(--gray)] self-end mb-1">
                        {isPerSeat ? "/siège/mois" : "/mois"}
                      </span>
                    </div>
                    <div className="text-[10px] md:text-[11px] text-[var(--gray)] mb-4 md:mb-6">
                      {isYearly && plan.prices?.annual ? "Facturé annuellement · -30%" : "Facturation mensuelle"}
                      {isPerSeat && " · Min. 3 sièges"}
                    </div>

                    <Separator className="bg-[var(--card-separator)] mb-3 md:mb-5" />

                    <ul className="list-none mb-4 md:mb-6 flex-1">
                      {plan.limits && (() => {
                        const note = plan.limitsNote ? ` ${plan.limitsNote}` : "";
                        return (
                          <>
                            <LandingFeatureLine text={`${plan.limits.transcriptions}${note} transcriptions / mois`} />
                            <LandingFeatureLine text={`${plan.limits.corrections}${note} corrections / mois`} />
                            <LandingFeatureLine text={`${plan.limits.derushages}${note} dérushages / mois`} />
                            <LandingFeatureLine text={`${plan.limits.normalizations}${note} normalisations / mois`} />
                          </>
                        );
                      })()}
                      {(plan.features ?? [])
                        .filter((f: any) => {
                          const text = typeof f === "string" ? f : f.text;
                          return !/transcription|correction|suppression|normalisation/i.test(text);
                        })
                        .map((f: any, i: number) => {
                          const text = typeof f === "string" ? f : f.text;
                          return <LandingFeatureLine key={i} text={text} />;
                        })}
                    </ul>

                    <Button
                      variant={plan.highlighted ? "liquid-glass" : "outline"}
                      className="w-full rounded-full"
                      asChild
                    >
                      <Link href={href}>Démarrer l&apos;essai gratuit</Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </FadeInView>

      <p className="mt-4.5 text-xs text-[var(--gray)] text-center">
        ✓ 14 jours gratuits · Aucune CB requise · Annulation à tout moment
      </p>
    </div>
  );
}
