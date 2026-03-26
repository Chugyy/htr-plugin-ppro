import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UsageBar } from "@/components/dashboard/UsageBar";
import { LucideIcon } from "lucide-react";

interface UsageCardProps {
  feature: string;
  used: number;
  limit: number | null;
  icon: LucideIcon;
}

export function UsageCard({ feature, used, limit, icon: Icon }: UsageCardProps) {
  return (
    <Card className="card-base border">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-[7px] bg-[var(--blue-bg-icon)] border border-[var(--blue-border-light)]">
          <Icon className="h-3.5 w-3.5 text-[var(--blue-light)]" />
        </div>
        <CardTitle className="text-sm text-[var(--cream)]">{feature}</CardTitle>
      </CardHeader>
      <CardContent>
        <UsageBar label={feature} used={used} limit={limit} />
      </CardContent>
    </Card>
  );
}
