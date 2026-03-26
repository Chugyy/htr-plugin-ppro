"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useMe } from "@/services/auth/hooks";
import { useLogout } from "@/services/auth/hooks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useMe();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => router.push("/login"),
    });
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        <header className="flex h-10 shrink-0 items-center justify-between px-3 border-b border-[var(--card-separator)] bg-[var(--background)] sticky top-0 z-10">
          <SidebarTrigger className="text-[var(--gray)] hover:text-[var(--cream)]" />
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-xs text-[var(--gray)] hidden sm:inline">
                {user.name || user.email}
              </span>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleLogout}
              title="Déconnexion"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
