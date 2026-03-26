import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

export function Student() {
  return (
    <div className="section-wrapper !py-0 !pb-16 md:!pb-24">
      <FadeInView>
        <Card className="card-student pattern-overlay">
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
