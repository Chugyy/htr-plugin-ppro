"use client";

import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/services/auth/hooks";
import { getInitials } from "@/lib/utils";

interface UserMenuProps {
  name: string;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  const router = useRouter();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => router.push("/login"),
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 hover:opacity-80 transition-opacity w-full">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-xs bg-[var(--blue-bg-icon)] border border-[var(--blue-border-light)] text-[var(--blue-light)]">
              {getInitials(name || email)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start group-data-[collapsible=icon]:hidden min-w-0">
            <span className="text-xs font-medium text-[var(--cream)] truncate max-w-[140px]">{name || email}</span>
            <span className="text-[10px] text-[var(--gray)] truncate max-w-[140px]">{email}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 glass-panel--expanded border-[var(--card-border-alt)]">
        <DropdownMenuLabel className="text-xs font-normal text-[var(--gray)]">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-[var(--card-separator)]" />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
