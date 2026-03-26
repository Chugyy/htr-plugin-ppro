"use client";

import { Card, CardContent } from "@/components/ui/card";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { SectionHeader } from "./section-header";
import { Pencil, Music, Sparkles, Scissors, Palette, Subtitles, FolderOpen } from "lucide-react";

const UPCOMING_FEATURES = [
  { icon: Palette, label: "Correction colorimétrique", desc: "Cohérence visuelle automatique sur toute la timeline" },
  { icon: Scissors, label: "Dérushage automatique", desc: "Suppression des silences et temps morts en 1 clic" },
  { icon: FolderOpen, label: "Librairie d'assets", desc: "Éléments de qualité à glisser-déposer" },
  { icon: Subtitles, label: "Sous-titres animés", desc: "Animations, emojis et styles dynamiques" },
];

export function Features() {
  return (
    <div className="section-wrapper" id="features">
      <FadeInView>
        <SectionHeader tag="Ce que ça fait">
          Deux outils qui <em>changent</em> tout
        </SectionHeader>
      </FadeInView>

      <div className="flex flex-col gap-6 mt-10 md:mt-14">
        {/* Feature 1 — Correction ortho (full width) */}
        <FadeInView>
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
              </div>
              <div>
                <div className="text-[9px] font-bold text-[var(--gray)] tracking-[1.5px] uppercase mb-3">
                  Aperçu en direct
                </div>
                <div className="code-block text-xs leading-[1.75] text-[var(--cream-dim)]">
                  <div className="text-[9px] font-bold tracking-[2px] uppercase mb-1.5 text-[var(--red-label)]">
                    Transcription Premiere Pro brute
                  </div>
                  &quot;On a lancé le{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    client client
                  </span>{" "}
                  sur{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    notion
                  </span>{" "}
                  et{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    discorde
                  </span>{" "}
                  pour{" "}
                  <span className="text-[var(--red-text)] border-b-[1.5px] border-dotted border-[var(--red-text)]">
                    gèrer
                  </span>{" "}
                  le projet.&quot;
                  <div className="h-px bg-[var(--card-border-subtle)] my-3" />
                  <div className="text-[9px] font-bold tracking-[2px] uppercase mb-1.5 text-[rgba(91,141,255,0.9)]">
                    ✓ Après HTR Edit — Contextuel IA
                  </div>
                  &quot;On a lancé le{" "}
                  <span className="correction-fix-inline">client</span>{" "}
                  sur{" "}
                  <span className="correction-fix-inline">Notion</span>{" "}
                  et{" "}
                  <span className="correction-fix-inline">Discord</span>{" "}
                  pour{" "}
                  <span className="correction-fix-inline">gérer</span>{" "}
                  le projet.&quot;
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeInView>

        {/* Feature 2 — Audio (full width, text left + bars right) */}
        <FadeInView delay={0.1}>
          <Card className="card-blue">
            <CardContent className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
              <div>
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
              </div>
              <div>
                <div className="text-[9px] font-bold text-[var(--gray)] tracking-[1.5px] uppercase mb-3">
                  Niveaux appliqués
                </div>
                <div className="code-block">
                  <AudioBar label="Voix" width="68%" value="-9dB" />
                  <AudioBar label="SFX" width="42%" value="-18dB" />
                  <AudioBar label="Musique" width="24%" value="-28dB" last />
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeInView>

        {/* Feature 3 — Coming soon (full width grid) */}
        <FadeInView delay={0.2}>
          <Card className="card-base-alt relative overflow-hidden">
            <CardContent className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-center">
              <div>
                <FeatureIcon>
                  <Sparkles className="size-5 text-[var(--blue-light)]" />
                </FeatureIcon>
                <div className="font-extrabold text-[23px] text-[var(--cream)] uppercase leading-tight mb-2">
                  Et ce n&apos;est
                  <br />
                  que le début.
                </div>
                <p className="text-[13px] text-[var(--cream-muted)] leading-[1.65]">
                  HTR Edit évolue en permanence. Voici ce qui arrive dans les prochains mois
                  — inclus dans le plan Pro.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {UPCOMING_FEATURES.map((f, i) => (
                  <div key={i} className="flex gap-3 items-start p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                    <div className="w-9 h-9 rounded-lg bg-[var(--blue-bg-icon)] border border-[var(--blue-border-light)] flex items-center justify-center shrink-0">
                      <f.icon className="size-4 text-[var(--blue-light)]" />
                    </div>
                    <div>
                      <div className="text-[12.5px] font-semibold text-[var(--cream-dim)] mb-0.5">{f.label}</div>
                      <div className="text-[11px] text-[var(--gray)] leading-[1.45]">{f.desc}</div>
                    </div>
                  </div>
                ))}
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

function AudioBar({ label, width, value, last }: { label: string; width: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${last ? "" : "mb-2.5"}`}>
      <div className="text-[9.5px] font-bold text-[var(--gray)] uppercase tracking-[0.8px] w-12 shrink-0">
        {label}
      </div>
      <div className="flex-1 h-1.5 bg-[var(--card-border-muted)] rounded overflow-hidden">
        <div className="h-full rounded bg-gradient-to-r from-[var(--primary)] to-[var(--blue-light)]" style={{ width }} />
      </div>
      <div className="text-[10px] text-[var(--blue-light)] font-bold w-8 text-right">
        {value}
      </div>
    </div>
  );
}
