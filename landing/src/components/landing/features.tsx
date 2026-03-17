"use client";

import { Card, CardContent } from "@/components/ui/card";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";
import { Pencil, Music, ScanEye } from "lucide-react";

export function Features() {
  return (
    <div className="section-wrapper" id="features">
      <FadeInView>
        <SectionHeader tag="Ce que ça fait">
          Deux outils qui <em>changent</em> tout
        </SectionHeader>
      </FadeInView>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10 md:mt-14">
        {/* Feature 1 — Wide */}
        <FadeInView className="md:col-span-2">
          <Card className="card-blue">
            <CardContent className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
              <div>
                <FeatureIcon>
                  <Pencil className="size-5 text-[var(--blue-light)]" />
                </FeatureIcon>
                <div className="font-extrabold text-[23px] text-[var(--cream)] uppercase leading-tight mb-3">
                  Correction orthographique
                  <br />
                  intelligente par IA
                </div>
                <p className="text-[13px] text-[var(--cream-muted)] leading-[1.65] mb-3.5">
                  Premiere transcrit sans comprendre. HTR Edit relit les
                  sous-titres en{" "}
                  <strong className="text-[var(--cream-dim)] font-semibold">
                    comprenant le sujet de la vidéo
                  </strong>{" "}
                  — il reconnaît les noms propres, le vocabulaire métier,
                  l&apos;argot et le contexte pour proposer la correction juste.
                </p>
                <p className="text-[13px] text-[var(--cream-muted)] leading-[1.65]">
                  <strong className="text-[var(--cream-dim)] font-semibold">
                    Résultat :
                  </strong>{" "}
                  0 faute de transcription en livraison. Fini &quot;vous avez
                  écrit Jérémi avec un i&quot;.
                </p>
              </div>
              <div>
                <div className="text-[9px] font-bold text-[var(--gray)] tracking-[1.5px] uppercase mb-3">
                  Aperçu en direct
                </div>
                <div className="code-block text-xs leading-[1.75] text-[var(--cream-dim)]">
                  <div className="text-[9px] font-bold tracking-[2px] uppercase mb-1.5 text-[var(--red-label)]">
                    Transcription Premiere Pro brute
                  </div>
                  &quot;C&apos;est{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    vrayment
                  </span>{" "}
                  un outil qui va{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    vous aidé
                  </span>{" "}
                  à{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    progrécer
                  </span>{" "}
                  dans votre{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    carrierre
                  </span>
                  ...&quot;
                  <div className="h-px bg-[var(--card-border-subtle)] my-3" />
                  <div className="text-[9px] font-bold tracking-[2px] uppercase mb-1.5 text-[rgba(91,141,255,0.9)]">
                    ✓ Après HTR Edit — Contextuel IA
                  </div>
                  &quot;C&apos;est{" "}
                  <span className="correction-fix-inline">
                    vraiment
                  </span>{" "}
                  un outil qui va{" "}
                  <span className="correction-fix-inline">
                    vous aider
                  </span>{" "}
                  à{" "}
                  <span className="correction-fix-inline">
                    progresser
                  </span>{" "}
                  dans votre{" "}
                  <span className="correction-fix-inline">
                    carrière
                  </span>
                  ...&quot;
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeInView>

        {/* Feature 2 — Audio */}
        <FadeInView delay={0.1}>
          <Card className="card-base-alt relative overflow-hidden h-full">
            <span className="absolute top-4 right-5 font-black text-[68px] text-[var(--primary)] opacity-15 leading-none">
              02
            </span>
            <CardContent className="p-8">
              <FeatureIcon>
                <Music className="size-5 text-[var(--blue-light)]" />
              </FeatureIcon>
              <div className="font-extrabold text-[23px] text-[var(--cream)] uppercase leading-tight mb-3">
                Normalisation audio
                <br />
                automatique
              </div>
              <p className="text-[13px] text-[var(--cream-muted)] leading-[1.65]">
                HTR Edit identifie{" "}
                <strong className="text-[var(--cream-dim)] font-semibold">
                  automatiquement
                </strong>{" "}
                chaque piste et applique les règles pro en 1 clic. Voix entre -6
                et -12 dB, SFX et musique en dessous.
              </p>
              <div className="code-block mt-4">
                <AudioBar label="Voix" width="68%" value="-9dB" />
                <AudioBar label="SFX" width="42%" value="-18dB" />
                <AudioBar label="Musique" width="24%" value="-28dB" last />
              </div>
            </CardContent>
          </Card>
        </FadeInView>

        {/* Feature 3 — Color correction */}
        <FadeInView delay={0.2}>
          <Card className="card-base-alt relative overflow-hidden h-full">
            <span className="absolute top-4 right-5 font-black text-[68px] text-[var(--primary)] opacity-15 leading-none">
              03
            </span>
            <CardContent className="p-8">
              <FeatureIcon>
                <ScanEye className="size-5 text-[var(--blue-light)]" />
              </FeatureIcon>
              <div className="font-extrabold text-[23px] text-[var(--cream)] uppercase leading-tight mb-3">
                Correction
                <br />
                colorimétrique
              </div>
              <p className="text-[13px] text-[var(--cream-muted)] leading-[1.65]">
                Bientôt : analyse automatique des plans et correction
                colorimétrique de base pour garantir une{" "}
                <strong className="text-[var(--cream-dim)] font-semibold">
                  cohérence visuelle
                </strong>{" "}
                sur toute la timeline.
              </p>
              <div className="inline-flex items-center gap-1.5 bg-[var(--card-bg-tag)] border border-[var(--card-border-alt)] rounded-full px-3.5 py-1.5 text-[9.5px] font-semibold text-white/30 tracking-[1.5px] uppercase mt-4">
                🚧 Bientôt disponible
              </div>
            </CardContent>
          </Card>
        </FadeInView>
      </div>
    </div>
  );
}

function FeatureIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="feature-icon">
      {children}
    </div>
  );
}

function AudioBar({
  label,
  width,
  value,
  last,
}: {
  label: string;
  width: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${last ? "" : "mb-2.5"}`}>
      <div className="text-[9.5px] font-bold text-[var(--gray)] uppercase tracking-[0.8px] w-12 shrink-0">
        {label}
      </div>
      <div className="flex-1 h-1.5 bg-[var(--card-border-muted)] rounded overflow-hidden">
        <div
          className="h-full rounded bg-gradient-to-r from-[var(--primary)] to-[var(--blue-light)]"
          style={{ width }}
        />
      </div>
      <div className="text-[10px] text-[var(--blue-light)] font-bold w-8 text-right">
        {value}
      </div>
    </div>
  );
}
