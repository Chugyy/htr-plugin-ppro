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
                  <PlanHeader name="Agence" desc="Tu gères une équipe de monteurs. Standard qualité uniforme." price={p.agency} period="/siège/mois" billing={isYearly ? "Min. 3 sièges · -30%" : "Min. 3 sièges · Mensuel"} />
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

      {/* Student section */}
      <FadeInView delay={0.1}>
        <Card className="card-student mt-10 pattern-overlay">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--blue-accent-hover)] via-[rgba(255,255,255,0.28)] to-transparent" />
          <div className="absolute w-[380px] h-[380px] bg-[radial-gradient(circle,rgba(33,79,207,0.09),transparent_70%)] top-1/2 right-[-40px] -translate-y-1/2 blur-[40px] pointer-events-none" />
          <CardContent className="p-6 md:p-10 grid grid-cols-1 md:grid-cols-[1fr_290px] gap-8 md:gap-10 items-center text-left">
            <div>
              <Badge className="badge-blue rounded-full text-[9.5px] tracking-[2px] uppercase mb-4">
                🎓 Élèves HTR
              </Badge>
              <div className="font-black text-[24px] md:text-[32px] uppercase text-[var(--cream)] leading-none mb-3">
                Tu es formé chez HTR ?<br />
                L&apos;outil est{" "}
                <em className="text-[var(--blue-light)] not-italic">fait pour toi.</em>
              </div>
              <p className="text-[12.5px] text-[var(--cream-muted)] leading-[1.65] mb-5">
                Accès <strong className="text-[var(--cream-dim)]">Starter inclus dans la formation</strong> + remise permanente de{" "}
                <strong className="text-[var(--cream-dim)]">50% sur le plan Pro à vie</strong>.
              </p>
              <div className="flex flex-col gap-1.5 mb-5">
                {[
                  "Starter gratuit pendant toute la formation",
                  "Plan Pro à 19,50€/mois à vie (au lieu de 39€)",
                  "Bêta des nouvelles fonctions en avant-première",
                  "Ligne directe avec l'équipe produit",
                ].map((perk, i) => (
                  <div key={i} className="flex gap-2 text-xs text-[var(--cream-dim)]">
                    <span className="text-[var(--blue-light)] font-bold shrink-0">✓</span>
                    {perk}
                  </div>
                ))}
              </div>
              <a
                href="#"
                className="group inline-flex items-center gap-1.5 text-[var(--cream-muted)] text-[13px] font-medium no-underline transition-colors hover:text-[var(--cream)]"
              >
                Accéder à mon espace élève <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </a>
            </div>

            {/* Student mockup */}
            <div className="bg-[var(--card-bg-student-wrap)] border border-[var(--card-border-alt)] rounded-2xl overflow-hidden relative z-1">
              <div className="bg-[var(--card-bg-student-top)] px-4 py-3 flex justify-between items-center border-b border-[var(--card-border-subtle)]">
                <div className="flex items-center gap-1.5">
                  <Image src="/hero.svg" alt="Hit The Record" width={120} height={24} className="h-[14px] w-auto" />
                  <span className="text-white/30 text-[10px]">·</span>
                  <span className="font-semibold text-[11px] text-[var(--cream-dim)]">Élève</span>
                </div>
                <div className="flex items-center gap-1 text-[9.5px] text-[var(--green)] font-semibold">
                  <span className="w-1 h-1 rounded-full bg-[var(--green)] shadow-[0_0_6px_var(--green)] animate-pulse-dot" />
                  Actif
                </div>
              </div>
              <div className="p-5">
                <Badge className="text-[9.5px] tracking-[0] badge-blue rounded mb-3">
                  🎓 Plan Étudiant HTR
                </Badge>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="font-black text-[40px] text-[var(--cream)] leading-none">19,50€</span>
                  <span className="text-[11.5px] text-[var(--gray)]">/mois Pro · à vie</span>
                </div>
                <Separator className="bg-[var(--card-separator)] mb-3" />
                <div className="text-[10.5px] text-[var(--gray)] line-through mb-1">Prix public : 39€/mois</div>
                <div className="text-[11.5px] text-[var(--green)] font-bold">✓ Tu économises 234€/an</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </FadeInView>
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
