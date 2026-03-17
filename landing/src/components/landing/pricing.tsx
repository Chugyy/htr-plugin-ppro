"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useWaitlist } from "./waitlist-modal";

const PRICES = {
  monthly: { starter: 14, pro: 39, agency: 29 },
  yearly: { starter: 9, pro: 27, agency: 20 },
};

const STARTER_FEATURES = [
  { text: "20 corrections orthographiques / mois", on: true },
  { text: "20 normalisations audio / mois", on: true },
  { text: "Support prioritaire", on: false },
];

const PRO_FEATURES = [
  { text: "Corrections orthographiques — illimité", on: true, bold: true },
  { text: "Normalisations audio — illimité", on: true, bold: true },
  { text: "Auto-cut, colorimétrie et futures features incluses", on: true },
  { text: "Support prioritaire", on: true },
];

const AGENCY_FEATURES = [
  "Tout le plan Pro par siège",
  "Intégration personnalisée",
  "Développement de features sur mesure",
  "Account manager dédié",
];

type Period = "monthly" | "yearly";

export function Pricing() {
  const [period, setPeriod] = useState<Period>("monthly");
  const p = PRICES[period];
  const isYearly = period === "yearly";
  const { open } = useWaitlist();

  return (
    <div className="section-wrapper" id="pricing">
      <FadeInView>
        <SectionHeader tag="Tarifs">
          Simple. <em>Transparent.</em>
          <br />
          ROI immédiat.
        </SectionHeader>
      </FadeInView>

      {/* Toggle */}
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
              <span className={`text-[10px] ${isYearly ? "text-white/70" : "text-[var(--blue-light)]"}`}>-30%</span>
            </button>
          </div>
        </div>
      </FadeInView>

      {/* Cards — horizontal scroll on mobile, grid on desktop */}
      <FadeInView delay={0.1}>
        <div className="mt-10 scroll-container scrollbar-hide">
          {[
            { key: "starter", card: (
              <Card className="card-pricing h-full">
                <CardContent className="p-5 md:p-7 flex flex-col h-full">
                  <PlanHeader name="Starter" desc="Tu débutes ou tu montes occasionnellement." price={p.starter} period="/mois" billing={isYearly ? "Facturé annuellement · -30%" : "Facturation mensuelle"} />
                  <Separator className="bg-[var(--card-separator)] mb-3 md:mb-5" />
                  <FeatureList features={STARTER_FEATURES} />
                  <div className="mt-auto">
                    <Button variant="outline" className="w-full rounded-full" onClick={() => open("pricing-starter")}>Démarrer l&apos;essai gratuit</Button>
                  </div>
                </CardContent>
              </Card>
            )},
            { key: "pro", card: (
              <Card className="card-blue-pricing h-full">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
                <CardContent className="p-5 md:p-7 flex flex-col h-full">
                  <PlanHeader name="Pro" desc="Tu livres régulièrement à des clients exigeants. Illimité, sans compromis." price={p.pro} period="/mois" billing={isYearly ? "Facturé annuellement · -30%" : "Facturation mensuelle"} />
                  <Separator className="bg-[var(--card-separator)] mb-3 md:mb-5" />
                  <ul className="list-none mb-4 md:mb-6 flex-1">
                    {PRO_FEATURES.map((f, i) => (
                      <li key={i} className="flex gap-2 items-start text-[11px] md:text-xs text-[var(--cream-dim)] mb-2 md:mb-2.5 leading-[1.4]">
                        <span className="text-[var(--blue-light)] shrink-0 mt-px text-[10.5px]">✓</span>
                        {f.bold ? <strong>{f.text}</strong> : f.text}
                      </li>
                    ))}
                  </ul>
                  <Button variant="liquid-glass" className="w-full rounded-full" onClick={() => open("pricing-pro")}>Démarrer l&apos;essai gratuit</Button>
                </CardContent>
              </Card>
            )},
            { key: "agency", card: (
              <Card className="card-pricing h-full">
                <CardContent className="p-5 md:p-7 flex flex-col h-full">
                  <PlanHeader name="Agence" desc="Tu gères une équipe de monteurs. Standard qualité uniforme." price={p.agency} period="/siège/mois" billing={isYearly ? "À partir de 60€/mois · Min. 3 sièges · -30%" : "À partir de 87€/mois · Min. 3 sièges"} />
                  <Separator className="bg-[var(--card-separator)] mb-3 md:mb-5" />
                  <ul className="list-none mb-4 md:mb-6 flex-1">
                    {AGENCY_FEATURES.map((f, i) => (
                      <li key={i} className="flex gap-2 items-start text-[11px] md:text-xs text-[var(--cream-dim)] mb-2 md:mb-2.5 leading-[1.4]">
                        <span className="text-[var(--blue-light)] shrink-0 mt-px text-[10.5px]">✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto">
                    <Button variant="outline" className="w-full rounded-full" onClick={() => open("pricing-agency")}>Contacter l&apos;équipe</Button>
                  </div>
                </CardContent>
              </Card>
            )},
          ].map(({ key, card }) => (
            <div key={key} className="scroll-item">
              {card}
            </div>
          ))}
        </div>
      </FadeInView>

      <p className="mt-4.5 text-xs text-[var(--gray)] text-center">
        ✓ 14 jours gratuits · Aucune CB requise · Annulation à tout moment
      </p>

    </div>
  );
}

function PlanHeader({ name, desc, price, period, billing }: {
  name: string; desc: string; price: number; period: string; billing: string;
}) {
  return (
    <>
      <div className="font-black text-[18px] md:text-[20px] uppercase text-[var(--cream)] mb-1">{name}</div>
      <div className="text-[11px] md:text-xs text-[var(--gray)] mb-4 md:mb-6 leading-[1.5]">{desc}</div>
      <div className="flex items-start gap-0.5 mb-0.5">
        <span className="text-[16px] md:text-[19px] font-bold text-[var(--cream-dim)] mt-1">€</span>
        <span className="font-black text-[38px] md:text-[48px] text-[var(--cream)] leading-none tabular-nums transition-all">{price}</span>
        <span className="text-[11px] md:text-[12.5px] text-[var(--gray)] self-end mb-1">{period}</span>
      </div>
      <div className="text-[10px] md:text-[11px] text-[var(--gray)] mb-4 md:mb-6">{billing}</div>
    </>
  );
}

function FeatureList({ features }: { features: { text: string; on: boolean }[] }) {
  return (
    <ul className="list-none mb-4 md:mb-6 flex-1">
      {features.map((f, i) => (
        <li key={i} className={`flex gap-2 items-start text-[11px] md:text-xs mb-2 md:mb-2.5 leading-[1.4] ${f.on ? "text-[var(--cream-dim)]" : "text-[var(--gray)]"}`}>
          <span className={`shrink-0 mt-px text-[10.5px] ${f.on ? "text-[var(--blue-light)]" : "text-white/[0.17]"}`}>
            {f.on ? "✓" : "—"}
          </span>
          {f.text}
        </li>
      ))}
    </ul>
  );
}
