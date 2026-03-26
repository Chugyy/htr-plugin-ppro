"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiKeys } from "@/services/api-key/hooks";

interface ApiKeyFilterProps {
  value?: string;
  onChange: (value: string | undefined) => void;
}

export function ApiKeyFilter({ value, onChange }: ApiKeyFilterProps) {
  const { data: keys } = useApiKeys();

  if (!keys || keys.length <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-6">
      <span className="text-xs text-muted-foreground">Filtrer par clé :</span>
      <Select
        value={value ?? "all"}
        onValueChange={(v) => onChange(v === "all" ? undefined : v)}
      >
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les clés</SelectItem>
          {keys.map((key) => (
            <SelectItem key={key.id} value={String(key.id)}>
              {key.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
