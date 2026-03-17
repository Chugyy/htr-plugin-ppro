"use client";

import { Button } from "@/components/ui/button";
import FadeInView from "@/components/animate-ui/fade-in-view";
import { ArrowRight } from "lucide-react";

import { useWaitlist } from "./waitlist-modal";

const PROOF_STATS = [
  { value: "3×", label: "Moins de retours" },
  { value: "-9dB", label: "Vocal normalisé", split: true },
  { value: "2min", label: "Pour corriger", split: true },
  { value: "100+", label: "Monteurs HTR", split: true },
];

export function Hero() {
  const { open } = useWaitlist();

  return (
    <section className="w-full min-h-screen flex flex-col items-center justify-center text-center px-[var(--section-px)] md:px-10 pt-[110px] md:pt-[130px] pb-14 md:pb-20 relative overflow-hidden pattern-overlay">
      {/* Orbs */}
      <div className="absolute w-[780px] h-[780px] rounded-full pointer-events-none blur-[90px] bg-[radial-gradient(circle,rgba(33,79,207,0.17),transparent_65%)] -top-[280px] -left-[180px]" />
      <div className="absolute w-[560px] h-[560px] rounded-full pointer-events-none blur-[90px] bg-[radial-gradient(circle,rgba(91,141,255,0.1),transparent_65%)] -bottom-[140px] -right-[80px]" />
      <div className="absolute w-[280px] h-[280px] rounded-full pointer-events-none blur-[90px] bg-[radial-gradient(circle,rgba(33,79,207,0.1),transparent_65%)] top-[42%] left-[62%]" />

      <FadeInView delay={0.1}>
        <h1 className="font-black text-[clamp(32px,7vw,86px)] leading-[0.91] uppercase text-[var(--cream)] max-w-[860px]">
          Livrez des vidéos
          <br />
          <em className="text-[var(--blue-light)] not-italic">
            sans fautes.
          </em>
          <br />
          <span className="opacity-[0.13]">Sans retours.</span>
        </h1>
      </FadeInView>

      <FadeInView delay={0.2}>
        <p className="mt-6 text-[16.5px] text-[var(--cream-dim)] max-w-[510px] leading-[1.65]">
          HTR Edit corrige vos sous-titres par IA et normalise vos niveaux audio
          — directement dans Premiere Pro. Zéro retour client. Zéro temps perdu.
        </p>
      </FadeInView>

      <FadeInView delay={0.3} className="flex flex-col md:flex-row gap-3.5 items-center mt-8 md:mt-10">
        <Button size="xl" variant="liquid-glass" onClick={() => open("hero")}>
          Essayer 14 jours — Gratuit
        </Button>
        <a
          href="#roi"
          className="group flex items-center gap-1.5 text-[var(--cream-muted)] text-sm font-medium transition-colors hover:text-[var(--cream)]"
        >
          Calculer mon ROI <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
        </a>
      </FadeInView>

      {/* KPIs — 2x2 grid on mobile, inline on desktop */}
      <FadeInView delay={0.4} className="mt-8 md:mt-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 md:flex md:gap-9 md:items-center">
          {PROOF_STATS.map((stat, i) => (
            <div key={i} className="flex md:gap-9 items-center">
              {stat.split && <div className="hidden md:block w-px h-[34px] bg-white/10" />}
              <div className="text-center md:text-left">
                <div className="font-black text-[26px] md:text-[34px] leading-none text-[var(--cream)]">
                  <em className="text-[var(--blue-light)] not-italic">
                    {stat.value}
                  </em>
                </div>
                <div className="text-[9.5px] md:text-[10.5px] text-[var(--gray)] tracking-[1.5px] uppercase mt-0.5">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </FadeInView>

      <FadeInView delay={0.5} className="mt-10 md:mt-16 w-full max-w-[720px] relative">
        <div className="absolute inset-[-1px] rounded-[var(--card-radius)] bg-gradient-to-br from-[rgba(91,141,255,0.22)] via-transparent to-[rgba(33,79,207,0.09)] z-0 pointer-events-none" />
        <video
          src="/demo.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-[var(--card-radius)] relative z-1"
        />
      </FadeInView>
    </section>
  );
}
