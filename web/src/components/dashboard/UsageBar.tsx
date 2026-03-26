import { Progress } from "@/components/ui/progress";

interface UsageBarProps {
  label: string;
  used: number;
  limit: number | null;
}

function getIndicatorColor(pct: number): string {
  if (pct >= 100) return "bg-[var(--red)]";
  if (pct >= 80) return "bg-[var(--amber)]";
  return "bg-[var(--primary)]";
}

export function UsageBar({ label, used, limit }: UsageBarProps) {
  const isUnlimited = limit === null || limit === 0;
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((used / limit!) * 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--gray)]">{label}</span>
        <span className="text-[var(--cream-dim)] font-medium tabular-nums">
          {isUnlimited ? `${used} / ∞` : `${used} / ${limit}`}
        </span>
      </div>
      <Progress
        value={isUnlimited ? 0 : pct}
        className="h-1.5"
        indicatorClassName={getIndicatorColor(pct)}
      />
    </div>
  );
}
