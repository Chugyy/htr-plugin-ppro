"use client";

import { useRef, useState } from "react";
import { Separator } from "@/components/ui/separator";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";

const FAQ_ITEMS = [
  {
    q: "Est-ce que ça fonctionne bien sur des vidéos en français, avec de l'argot ou du vocabulaire spécialisé ?",
    a: "C'est exactement pour ça qu'HTR Edit existe. Contrairement à la transcription native de Premiere, notre IA analyse le contexte global de la vidéo avant de corriger. Elle reconnaît les noms propres, le vocabulaire métier (montage, étalonnage, DAW...), l'argot et les expressions courantes. Elle est calibrée sur du contenu francophone. Résultat : fini \"vous avez écrit Jérémi avec un i\" ou \"dépréciver\" au lieu de \"déprécier\".",
  },
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
    a: "Non. Vos vidéos ne quittent jamais votre machine. Seul l'audio est extrait localement pour l'analyse des niveaux, et le texte des sous-titres est envoyé pour la correction. Aucun fichier vidéo n'est transmis.",
  },
  {
    q: "Puis-je personnaliser les règles audio ?",
    a: "Pas encore, mais c'est une feature en développement. On prévoit des compresseurs, de l'EQ, des limitateurs et des modificateurs de voix pour un contrôle total sur le mix audio.",
  },
  {
    q: "Et si l'IA fait une mauvaise correction ?",
    a: "Chaque correction est affichée avant application. Vous validez, rejetez ou modifiez chaque suggestion directement dans l'éditeur de texte de Premiere Pro. Les corrections sont 100% utilisables et peuvent même être exportées. Rien n'est appliqué sans votre accord.",
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
