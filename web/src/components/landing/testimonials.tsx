"use client";

import { Card, CardContent } from "@/components/ui/card";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";

const TESTIMONIALS = [
  {
    initials: "TM",
    name: "Thomas M.",
    role: "Monteur freelance — Paris",
    text: "\"Avant je passais 45 min à relire les sous-titres à la main sur chaque livraison. Maintenant c'est 3 minutes. Aucun retour ortho depuis que j'utilise HTR Edit.\"",
  },
  {
    initials: "SB",
    name: "Sarah B.",
    role: "Éditrice vidéo — Lyon",
    text: "\"La partie audio m'a bluffé. J'avais toujours du mal à calibrer musique vs voix. HTR Edit le gère seul, résultat direct broadcast. Mes clients YouTube ont noté la différence.\"",
  },
  {
    initials: "KT",
    name: "Kilian T.",
    role: "Fondateur HTR Agency",
    text: "\"Intégré dans les workflows de toute notre agence. Le standard qualité est uniforme pour les 6 monteurs. Les retours clients ont chuté de plus de 60%.\"",
  },
  {
    initials: "LR",
    name: "Lucas R.",
    role: "Monteur YouTube — Bordeaux",
    text: "\"Je gère 12 chaînes YouTube. Avant, les retours ortho me prenaient une journée par semaine. Avec HTR Edit, c'est réglé en 20 minutes pour toutes les chaînes.\"",
  },
  {
    initials: "MC",
    name: "Marie C.",
    role: "Post-prod manager — Marseille",
    text: "\"On a standardisé les niveaux audio de toute l'équipe en une semaine. Plus de clients qui se plaignent du son trop fort ou trop bas. Game changer.\"",
  },
  {
    initials: "AD",
    name: "Antoine D.",
    role: "Monteur corporate — Nantes",
    text: "\"Les noms propres, les termes techniques du client — Premiere écrivait n'importe quoi. HTR Edit corrige tout en contexte, même les acronymes métier. Mes livrables sont propres du premier coup.\"",
  },
];

export function Testimonials() {
  return (
    <div className="section-wrapper">
      <FadeInView>
        <SectionHeader tag="Ils utilisent HTR Edit">
          Ce que les monteurs
          <br />
          <em>en pensent</em>
        </SectionHeader>
      </FadeInView>

      <div className="mt-10 md:mt-13 overflow-hidden">
      <div className="scroll-container pb-4 md:pb-0 scrollbar-hide">
        {TESTIMONIALS.map((t, i) => (
          <FadeInView key={t.initials} delay={i * 0.1} className="scroll-item !w-[280px] md:!w-auto snap-center">
            <Card className="card-testimonial h-full">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--card-border-alt)] to-transparent" />
              <CardContent className="p-6">
                <div className="text-[var(--blue-light)] text-xs tracking-[2px] mb-3.5">
                  ★★★★★
                </div>
                <p className="text-[12.5px] text-[var(--cream-dim)] leading-[1.68] mb-4 italic">
                  {t.text}
                </p>
                <div className="flex items-center gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[var(--primary)] to-[#3060e0] flex items-center justify-center font-black text-xs text-white shadow-[0_0_12px_rgba(33,79,207,0.32)]">
                    {t.initials}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--cream)]">
                      {t.name}
                    </div>
                    <div className="text-[10.5px] text-[var(--gray)]">
                      {t.role}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </FadeInView>
        ))}
      </div>
      </div>
    </div>
  );
}
