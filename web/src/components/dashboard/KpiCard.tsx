import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
}

export function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
}: KpiCardProps) {
  return (
    <Card className="card-base border">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-[var(--gray)]">{title}</span>
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--blue-bg-icon)] border border-[var(--blue-border-light)]">
            <Icon className={`h-3 w-3 ${iconColor}`} />
          </div>
        </div>
        <div className="text-xl font-bold text-[var(--cream)]">{value}</div>
        {subtitle && <p className="text-[11px] text-[var(--gray)]">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
