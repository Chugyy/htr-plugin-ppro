"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Apply saved theme on mount, revert to dark on unmount (leaving dashboard)
  useEffect(() => {
    const saved = localStorage.getItem("htr-theme");
    if (saved === "light") {
      document.documentElement.classList.add("light");
    }

    return () => {
      document.documentElement.classList.remove("light");
    };
  }, []);

  return <AppShell>{children}</AppShell>;
}
