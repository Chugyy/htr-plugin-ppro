"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";

const BEFORE_ITEMS = [
  "Premiere génère des sous-titres bourrés de fautes — noms propres, argot, termes métier : rien n'est reconnu",
  'La musique couvre la voix, les SFX agressent les oreilles — chaque monteur calibre "à l\'oreille" sans standard',
  "Le client voit les fautes, renvoie des retours. Tu passes 1h à tout reprendre manuellement",
  "Satisfaction en berne, délais explosés, réputation du monteur en jeu",
];

const AFTER_ITEMS = [
  "L'IA comprend le contexte de la vidéo et corrige chaque sous-titre intelligemment — noms, argot, termes techniques",
  "HTR Edit identifie chaque piste et applique les bons niveaux en 1 clic selon des règles audio pro",
  "Tu livres propre dès le 1er envoi. Le client valide, tu passes au projet suivant",
  "Plus de temps pour créer, moins de friction, plus de projets dans le même délai",
];

export function Pain() {
  return (
    <div className="section-wrapper !pt-16 md:!pt-24 !pb-20 md:!pb-28">
      <FadeInView>
        <SectionHeader tag="Le problème">
          Des fautes.
          <br />
          Des retours clients.
          <br />
          <em>Une heure de perdue.</em>
        </SectionHeader>
      </FadeInView>

      <FadeInView delay={0.1} className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10 md:mt-13">
          <Card className="card-red h-full">
            <CardContent className="p-8">
              <Badge
                variant="destructive"
                className="badge-red rounded-full text-[9px] tracking-[2px] uppercase mb-5"
              >
                ✕ Avant HTR Edit
              </Badge>
              <div className="font-extrabold text-[23px] text-[var(--cream)] mb-5 leading-tight">
                La réalité de chaque livraison
              </div>
              {BEFORE_ITEMS.map((text, i) => (
                <div key={i} className="flex gap-3 items-start mb-3.5">
                  <span className="text-xs shrink-0 mt-0.5">❌</span>
                  <span className="text-[13px] text-[var(--cream-dim)] leading-[1.58]">
                    {text}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="card-blue !bg-[var(--blue-bg)] !border-[var(--blue-border-cta)] hover:!border-[rgba(91,141,255,0.3)] relative overflow-hidden h-full">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(33,79,207,0.06),transparent_60%)] pointer-events-none" />
            <CardContent className="p-8 relative z-1">
              <Badge className="badge-blue rounded-full text-[9px] tracking-[2px] uppercase mb-5">
                ✓ Avec HTR Edit
              </Badge>
              <div className="font-extrabold text-[23px] text-[var(--cream)] mb-5 leading-tight">
                La livraison devient une formalité
              </div>
              {AFTER_ITEMS.map((text, i) => (
                <div key={i} className="flex gap-3 items-start mb-3.5">
                  <span className="text-xs shrink-0 mt-0.5">✅</span>
                  <span className="text-[13px] text-[var(--cream-dim)] leading-[1.58]">
                    {text}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
      </FadeInView>
    </div>
  );
}
