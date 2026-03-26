import Link from "next/link";
import { AlertTriangle, Info, XCircle } from "lucide-react";

interface AlertBannerProps {
  type: "trial" | "payment_failed" | "cancelling";
  message: string;
  action?: { label: string; href: string };
}

const CONFIG = {
  trial: {
    icon: Info,
    bg: "glass-panel border-[var(--blue-border)]",
    text: "text-[var(--blue-light)]",
  },
  payment_failed: {
    icon: XCircle,
    bg: "glass-panel border-[var(--red-border)]",
    text: "text-[var(--red-text)]",
  },
  cancelling: {
    icon: AlertTriangle,
    bg: "glass-panel border-amber-500/20",
    text: "text-amber-400",
  },
};

export function AlertBanner({ type, message, action }: AlertBannerProps) {
  const { icon: Icon, bg, text } = CONFIG[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border mb-6 ${bg}`}>
      <Icon className={`h-4 w-4 shrink-0 ${text}`} />
      <p className={`text-sm flex-1 ${text}`}>{message}</p>
      {action && (
        <Link href={action.href} className={`text-xs font-semibold underline ${text}`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
