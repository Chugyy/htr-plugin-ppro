"use client";

import { useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";

const FAQ_ITEMS = [
  {
    q: "Avec quelle version de Premiere Pro ?",
    a: "HTR Edit est compatible Adobe Premiere Pro 2022 et versions supérieures, sur macOS et Windows. Il s'installe comme panneau d'extension natif.",
  },
  {
    q: "Comment l'IA corrige-t-elle les sous-titres ?",
    a: 'HTR Edit envoie la transcription à un modèle IA qui analyse le contexte global de la vidéo avant de corriger. Il comprend que "Hormozi" est un nom propre, que "déprécier" n\'est pas "dépréciver". Contrairement à un correcteur phonétique classique.',
  },
  {
    q: "Mes vidéos sont-elles envoyées sur vos serveurs ?",
    a: "Non. Seul le texte des sous-titres et les métadonnées de niveaux audio sont transmis. La vidéo elle-même ne quitte jamais votre machine.",
  },
  {
    q: "Puis-je personnaliser les règles audio ?",
    a: "Oui, à partir du plan Pro. Vous définissez vos propres seuils par type de piste, créez des presets par format (YouTube, pub, podcast), et les partagez en plan Agence.",
  },
  {
    q: "Et si l'IA fait une mauvaise correction ?",
    a: "Chaque correction est affichée avant application. Vous validez, rejetez ou modifiez chaque suggestion. Rien n'est appliqué sans votre accord. On itère en permanence avec le retour de nos 100+ élèves.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="section-wrapper" id="faq">
      <FadeInView>
        <SectionHeader tag="FAQ">
          Les questions
          <br />
          qu&apos;on nous <em>pose</em>
        </SectionHeader>
      </FadeInView>

      <div className="w-full md:max-w-[680px] mx-auto mt-8 md:mt-12">
        {FAQ_ITEMS.map((item, i) => (
          <FadeInView key={i} delay={i * 0.05}>
            <div
              className="cursor-pointer"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
            >
              <div className="py-5">
                <div className="flex justify-between items-center text-[14.5px] font-semibold text-[var(--cream-dim)] transition-colors hover:text-[var(--cream)]">
                  {item.q}
                  <span
                    className={`text-[var(--blue-light)] text-[21px] leading-none transition-transform duration-200 ${openIndex === i ? "rotate-45" : ""}`}
                  >
                    +
                  </span>
                </div>
                <FaqAnswer open={openIndex === i}>{item.a}</FaqAnswer>
              </div>
              <Separator className="bg-[var(--card-separator)]" />
            </div>
          </FadeInView>
        ))}
      </div>
    </div>
  );
}

function FaqAnswer({ open, children }: { open: boolean; children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
      style={{
        maxHeight: open ? contentRef.current?.scrollHeight ?? 200 : 0,
        opacity: open ? 1 : 0,
      }}
    >
      <div ref={contentRef} className="text-[13px] text-[var(--gray)] leading-[1.72] pt-3.5">
        {children}
      </div>
    </div>
  );
}
