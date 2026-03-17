import { Badge } from "@/components/ui/badge";

export function HeroMockup() {
  return (
    <div className="mock-wrap">
      <div className="mock-bar">
        <div className="w-[11px] h-[11px] rounded-full bg-[#ff5f57]" />
        <div className="w-[11px] h-[11px] rounded-full bg-[var(--amber)]" />
        <div className="w-[11px] h-[11px] rounded-full bg-[#28c840]" />
        <div className="flex-1 text-center text-[11px] text-white/30 font-medium">
          Adobe Premiere Pro 2025 — Projet_Client_v4.prproj
        </div>
      </div>
      <div className="mock-body">
        {/* Timeline */}
        <div className="m-tl">
          <div className="text-[9px] text-[var(--gray)] tracking-[2px] uppercase mb-4">
            Séquence principale
          </div>

          <Track icon="🎙" label="V1 — VOIX" variant="v">
            <div className="clip flex-[2.4] bg-[var(--primary)]">
              <span>Interview_A1.mp4</span>
            </div>
            <div className="clip flex-[1.4] bg-[#1a3fa0]" />
            <div className="clip flex-[2.8] bg-[var(--primary)]">
              <span>Interview_A2.mp4</span>
            </div>
          </Track>

          <Track icon="🔊" label="A2 — SOUND FX" variant="s">
            <div className="clip flex-[0.9] bg-[#2d5cdb] opacity-60" />
            <div className="clip flex-[0.5] bg-[#2d5cdb] opacity-60" />
            <div className="clip flex-[1.4] bg-[#2d5cdb] opacity-60" />
          </Track>

          <Track icon="🎵" label="A3 — MUSIQUE" variant="m">
            <div className="clip flex-[7] bg-gradient-to-r from-[#0d2080] to-[var(--primary)] opacity-40">
              <span>Background_ambient.mp3</span>
            </div>
          </Track>

          <div className="m-ph" />
        </div>

        {/* Plugin panel */}
        <div className="m-plug">
          <div className="flex items-center gap-1.5">
            <Badge className="font-black text-[8.5px] tracking-[1px] px-1.5 py-0.5 rounded-sm">
              HTR
            </Badge>
            <span className="font-extrabold text-[12.5px] text-[var(--cream)]">
              HTR Edit
            </span>
          </div>

          <div className="m-sec">
            <div className="text-[8.5px] font-bold text-[var(--blue-light)] tracking-[2px] uppercase mb-2">
              ✦ Correction ortho
            </div>
            <div className="text-[9px] text-[var(--cream-dim)] leading-[1.5]">
              &quot;C&apos;est{" "}
              <span className="correction-error">
                vrayment
              </span>{" "}
              →{" "}
              <span className="correction-fix">
                vraiment
              </span>{" "}
              un outil qui va{" "}
              <span className="correction-error">
                vous aidé
              </span>{" "}
              →{" "}
              <span className="correction-fix">
                vous aider
              </span>{" "}
              à{" "}
              <span className="correction-error">
                progrécer
              </span>{" "}
              →{" "}
              <span className="correction-fix">
                progresser
              </span>
              ...&quot;
            </div>
            <div className="flex gap-1 mt-1.5 flex-wrap">
              <Badge
                variant="outline"
                className="text-[7.5px] text-[var(--blue-light)] border-[var(--blue-border-badge)] bg-[var(--blue-bg-badge)] rounded-sm px-1.5 py-0.5"
              >
                3 corrections
              </Badge>
              <Badge
                variant="outline"
                className="text-[7.5px] text-[var(--blue-light)] border-[var(--blue-border-badge)] bg-[var(--blue-bg-badge)] rounded-sm px-1.5 py-0.5"
              >
                Contexte IA ✓
              </Badge>
            </div>
          </div>

          <div className="m-sec">
            <div className="text-[8.5px] font-bold text-[var(--blue-light)] tracking-[2px] uppercase mb-2">
              🎚 Niveaux audio
            </div>
            <AudioLevel label="Voix" width="70%" value="-9dB" />
            <AudioLevel label="SFX" width="42%" value="-18dB" />
            <AudioLevel label="Musique" width="26%" value="-28dB" last />
          </div>

          <div className="flex items-center gap-1.5 text-[9px] text-[var(--green)] font-semibold">
            <span className="w-[5px] h-[5px] rounded-full bg-[var(--green)] shadow-[0_0_7px_var(--green)] animate-pulse-dot" />
            Analyse terminée
          </div>
          <button className="w-full bg-gradient-to-br from-[var(--primary)] to-[#3060e0] text-white border-none rounded-lg py-2.5 font-extrabold text-[10px] tracking-[1px] uppercase cursor-pointer shadow-[0_0_18px_rgba(33,79,207,0.38)] transition-all hover:shadow-[0_0_30px_rgba(33,79,207,0.6)]">
            ▶ Appliquer les corrections
          </button>
        </div>
      </div>
    </div>
  );
}

function Track({
  icon,
  label,
  variant,
  children,
}: {
  icon: string;
  label: string;
  variant: "v" | "s" | "m";
  children: React.ReactNode;
}) {
  const bgMap = {
    v: "bg-[var(--blue-bg-track-v)]",
    s: "bg-[var(--blue-bg-track-s)]",
    m: "bg-[var(--blue-bg-track-m)]",
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className={`w-[18px] h-[18px] rounded text-[8px] flex items-center justify-center shrink-0 ${bgMap[variant]}`}
        >
          {icon}
        </div>
        <div className="text-[9px] text-[var(--gray)] font-semibold tracking-[0.5px]">
          {label}
        </div>
      </div>
      <div className="flex gap-[3px] h-8">{children}</div>
    </div>
  );
}

function AudioLevel({
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
    <div
      className={`flex items-center gap-1.5 ${last ? "" : "mb-1.5"}`}
    >
      <div className="text-[8.5px] text-[var(--gray)] w-[38px] font-semibold">
        {label}
      </div>
      <div className="flex-1 h-[5px] bg-[var(--card-border-muted)] rounded-sm overflow-hidden">
        <div
          className="h-full rounded-sm bg-gradient-to-r from-[var(--primary)] to-[var(--blue-light)]"
          style={{ width }}
        />
      </div>
      <div className="text-[8px] text-[var(--blue-light)] font-bold w-[30px] text-right">
        {value}
      </div>
    </div>
  );
}
