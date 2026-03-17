"use client";

import { useState, useMemo, useCallback } from "react";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { Info, ArrowRight } from "lucide-react";

const SLIDER_CONFIG = [
  { id: "videos", label: "Vidéos livrées par mois", hint: "Avec sous-titres / transcription", min: 1, max: 100, step: 1, format: (v: number) => `${v}` },
  { id: "rate", label: "Ton taux horaire", hint: "Marché FR freelance : 25–60€/h", min: 15, max: 90, step: 5, format: (v: number) => `${v}€` },
  { id: "rounds", label: "Retours ortho par vidéo", hint: "Standard marché : 2–3 avant validation", min: 1, max: 10, step: 1, format: (v: number) => `${v}` },
  { id: "mins", label: "Temps par aller-retour", hint: "Relecture + corrections + renvoi + attente", min: 15, max: 180, step: 15, format: (v: number) => `${v}min` },
] as const;

function useRoiCalc(videos: number, rate: number, rounds: number, mins: number) {
  return useMemo(() => {
    const affected = videos * 0.65;
    const hours = affected * rounds * (mins / 60);
    const cost = Math.round(hours * rate);
    const roi = Math.max(0, cost - 39);
    const pressure = affected * rounds;
    const churnRisk = Math.min(35, Math.round(pressure * 1.8));
    return { hours: Math.round(hours * 10) / 10, cost, roi, pressure: Math.round(pressure), churnRisk };
  }, [videos, rate, rounds, mins]);
}

export function RoiCalculator() {
  const [values, setValues] = useState({ videos: 8, rate: 35, rounds: 2, mins: 45 });
  const [showHyp, setShowHyp] = useState(false);

  const update = useCallback((id: string, val: number) => {
    setValues((prev) => ({ ...prev, [id]: val }));
  }, []);

  const r = useRoiCalc(values.videos, values.rate, values.rounds, values.mins);

  return (
    <div className="section-wrapper !pt-6 md:!pt-10 !pb-10 md:!pb-20 max-w-[920px] w-full" id="roi">
      <FadeInView>
        <div className="roi-wrap">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_18%_0%,rgba(33,79,207,0.08),transparent_48%),radial-gradient(ellipse_at_82%_100%,rgba(33,79,207,0.04),transparent_48%)]" />

          <div className="relative z-1">
            {/* Header with pattern */}
            <div className="relative text-center px-8 pt-8 pb-8 overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none opacity-[0.04]"
                style={{ backgroundImage: "url(/pattern.svg)", backgroundSize: "cover", backgroundPosition: "center" }}
              />
              <div className="relative z-1">
                <p className="text-[clamp(16px,3.2vw,26px)] font-bold leading-[1.35] text-[var(--cream-dim)] max-w-[560px] mx-auto">
                  Combien te coûtent vraiment tes retours clients ?
                  <br />
                  <span className="text-[var(--gray)] text-[clamp(12px,2vw,16px)] font-medium">Calcule en 10 secondes — et vois ce que tu récupères avec HTR Edit.</span>
                </p>
                <p className="text-[11px] text-[var(--gray)] mt-2.5 max-w-[420px] mx-auto leading-[1.5]">
                  Au bout de <span className="text-[var(--cream-muted)] font-medium">{r.pressure} retours/mois</span>, on estime que{" "}
                  <span className="text-[var(--cream-muted)] font-medium">~{r.churnRisk}%</span> des clients ne reviennent jamais.
                </p>
              </div>
            </div>

            {/* Sliders + Results */}
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start mx-4 md:mx-6 mb-4 md:mb-6 mt-0 p-4 md:p-6 rounded-xl bg-[var(--card-bg-inner)] border border-[var(--card-border-subtle)]">
              {/* Sliders */}
              <div className="flex flex-col gap-5">
                {SLIDER_CONFIG.map((s) => {
                  const val = values[s.id as keyof typeof values];
                  const pct = ((val - s.min) / (s.max - s.min)) * 100;
                  return (
                    <div key={s.id} className="flex flex-col gap-2">
                      <div className="flex justify-between items-baseline">
                        <div>
                          <div className="text-[13px] font-medium text-[var(--cream-dim)]">{s.label}</div>
                          <div className="text-[10px] text-[var(--gray)] mt-px">{s.hint}</div>
                        </div>
                        <div className="font-bold text-xl text-[var(--cream)] leading-none min-w-[60px] text-right tabular-nums">
                          {s.format(val)}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={s.step}
                        value={val}
                        onChange={(e) => update(s.id, Number(e.target.value))}
                        style={{ "--pct": `${pct}%` } as React.CSSProperties}
                      />
                    </div>
                  );
                })}

                <div className="relative">
                  <button
                    onClick={() => setShowHyp(!showHyp)}
                    className="flex items-center gap-1.5 text-[10px] text-[var(--gray)] hover:text-[var(--cream-muted)] transition-colors cursor-pointer bg-transparent border-none p-0"
                  >
                    <Info className="size-3" />
                    Hypothèses du calcul
                  </button>
                  {showHyp && (
                    <div className="absolute bottom-full left-0 mb-2 p-3 bg-[var(--secondary)] border border-[var(--card-border-alt)] rounded-lg shadow-lg max-w-[320px] z-10">
                      <div className="text-[10.5px] text-[var(--gray)] leading-[1.6]">
                        · <strong className="text-[var(--cream-muted)]">65%</strong> des vidéos génèrent ≥1 retour ortho
                        <br />· Abonnement Pro : <strong className="text-[var(--cream-muted)]">39€/mois</strong>
                        <br />· Risque churn après 3+ retours : <strong className="text-[var(--cream-muted)]">~20%</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Results */}
              <div className="flex flex-col gap-2.5 w-full md:w-[220px]">
                <ResultCard label="Temps perdu / mois" value={`${r.hours}h`} variant="danger" />
                <ResultCard label="Coût des retours / mois" value={`${r.cost}€`} variant="danger" />
                <ResultCard label="ROI net avec HTR Edit" value={`+${r.roi}€`} variant="success" />
              </div>
            </div>
          </div>
        </div>

        {/* Link outside the card */}
        <div className="flex justify-center mt-5">
          <a
            href="#pricing"
            className="group flex items-center gap-1.5 text-sm text-[var(--cream-muted)] font-medium transition-colors hover:text-[var(--cream)]"
          >
            Voir les prix <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </FadeInView>
    </div>
  );
}

function ResultCard({ label, value, variant }: { label: string; value: string; variant?: "danger" | "success" }) {
  const styles = {
    danger: "bg-[var(--red-subtle)] border-[var(--red-border)]",
    success: "bg-[rgba(75,222,128,0.04)] border-[rgba(75,222,128,0.18)]",
    default: "bg-[var(--card-bg)] border-[var(--card-border-muted)]",
  };
  const labelStyles = {
    danger: "text-[var(--red-text)]",
    success: "text-[var(--green)]",
    default: "text-[var(--gray)]",
  };
  const s = variant || "default";
  return (
    <div className={`p-3.5 rounded-lg border ${styles[s]}`}>
      <div className={`text-[10px] font-bold tracking-[1.5px] uppercase mb-1.5 ${labelStyles[s]}`}>
        {label}
      </div>
      <div className="font-bold text-[28px] leading-none tabular-nums text-[var(--cream)]">
        {value}
      </div>
    </div>
  );
}
