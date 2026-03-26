"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BarChart3, Users, CreditCard, Download } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useMe } from "@/services/auth/hooks";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Usage", href: "/dashboard/usage", icon: BarChart3 },
  { label: "Équipe", href: "/dashboard/team", icon: Users, agencyOnly: true },
  { label: "Plugin", href: "/dashboard/plugin", icon: Download },
  { label: "Abonnement", href: "/dashboard/billing", icon: CreditCard },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { data: user } = useMe();

  const navItems = NAV_ITEMS.filter(
    (item) => !item.agencyOnly || user?.plan === "agency"
  );

  return (
    <Sidebar collapsible="icon" className="glass-panel border-r border-[var(--card-border)]">
      <SidebarHeader className="px-4 py-5">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <Image
            src="/hero.svg"
            alt="HTR Edit"
            width={120}
            height={24}
            className="h-[22px] w-auto group-data-[collapsible=icon]:hidden"
            priority
          />
          <span className="hidden group-data-[collapsible=icon]:block text-sm font-bold text-primary">H</span>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarMenu>
          {navItems.map(({ label, href, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton
                asChild
                isActive={
                  href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(href)
                }
                tooltip={label}
              >
                <Link href={href}>
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter />
    </Sidebar>
  );
}
