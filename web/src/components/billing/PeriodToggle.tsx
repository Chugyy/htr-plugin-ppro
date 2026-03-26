"use client";

type Period = "monthly" | "annual";

interface PeriodToggleProps {
  value: Period;
  onChange: (v: Period) => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="period-toggle">
      <button
        onClick={() => onChange("monthly")}
        className={`period-btn ${value === "monthly" ? "period-btn--active" : "period-btn--inactive"}`}
      >
        Mensuel
      </button>
      <button
        onClick={() => onChange("annual")}
        className={`period-btn inline-flex items-center gap-1 ${value === "annual" ? "period-btn--active" : "period-btn--inactive"}`}
      >
        Annuel
        <span className={`text-[10px] ${value === "annual" ? "text-white/70" : "text-[var(--blue-light)]"}`}>
          -30%
        </span>
      </button>
    </div>
  );
}
