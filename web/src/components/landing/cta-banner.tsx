"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { ArrowRight } from "lucide-react";

export function CtaBanner() {
  return (
    <FadeInView>
      <div className="ctab pattern-overlay mx-[var(--section-px)] md:mx-[var(--section-px-md)] mb-16 md:mb-24 rounded-[var(--card-radius)] md:rounded-[26px] p-8 md:p-[74px] text-center relative overflow-hidden bg-[var(--blue-bg-cta)] border border-[var(--blue-border-cta)] glass-panel--expanded">
        <div className="absolute w-[560px] h-[560px] bg-[radial-gradient(circle,rgba(33,79,207,0.12),transparent_70%)] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 blur-[55px] pointer-events-none" />
        <h2 className="relative font-black text-[clamp(30px,5.2vw,68px)] uppercase leading-[0.92] text-[var(--cream)] mb-4">
          Rejoins les monteurs
          <br />
          qui livrent{" "}
          <em className="text-[var(--blue-light)] not-italic">
            propre.
          </em>
        </h2>
        <p className="relative text-[15.5px] text-[var(--cream-dim)] max-w-[480px] mx-auto mb-9 leading-[1.65]">
          Première livraison = bonne livraison. Plus de retours, plus de clients
          qui reviennent chercher des poux sur une faute. Juste vous, votre
          timeline, et un fichier validé.
        </p>
        <div className="relative flex flex-col md:flex-row gap-3.5 justify-center items-center">
          <Button size="xl" variant="liquid-glass" asChild>
            <Link href="/register">Essayer 14 jours — Gratuit</Link>
          </Button>
          <a
            href="#roi"
            className="group flex items-center gap-1.5 text-sm text-[var(--cream-muted)] font-medium transition-colors hover:text-[var(--cream)]"
          >
            Voir mon ROI <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </FadeInView>
  );
}
