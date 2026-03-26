import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-[12px] bg-[var(--blue-bg-icon)] border border-[var(--blue-border-light)] flex items-center justify-center mb-4">
        <Icon className="h-5 w-5 text-[var(--blue-light)]" />
      </div>
      <p className="text-sm font-medium text-[var(--cream)]">{title}</p>
      {description && (
        <p className="text-xs text-[var(--gray)] mt-1 max-w-xs">{description}</p>
      )}
      {action && (
        <Button size="sm" className="mt-4" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
