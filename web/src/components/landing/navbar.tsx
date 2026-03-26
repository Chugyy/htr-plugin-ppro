"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#roi", label: "Calculateur ROI" },
  { href: "#pricing", label: "Tarifs" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-3.5 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-[var(--section-max-w)] z-[1000] bg-[var(--nav-bg)] backdrop-blur-[60px] [-webkit-backdrop-filter:blur(60px)] saturate-[180%] border border-[var(--nav-border)] rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.07)_inset]">
      <div className="flex items-center justify-between px-5 h-14">
        <a href="#" className="flex items-center no-underline">
          <Image
            src="/hero.svg"
            alt="Hit The Record"
            width={180}
            height={35}
            className="h-[22px] w-auto"
            priority
          />
        </a>

        <ul className="hidden md:flex gap-7 list-none">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[var(--gray)] no-underline text-[13px] font-medium transition-colors hover:text-[var(--cream)]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/login">Se connecter</Link>
          </Button>
          <Button size="sm" variant="liquid-glass" asChild>
            <Link href="/register">Essayer gratuitement</Link>
          </Button>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden bg-transparent border-none text-[var(--cream)] cursor-pointer p-1"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <div
        className="md:hidden grid transition-[grid-template-rows,opacity] duration-300 ease-in-out"
        style={{ gridTemplateRows: mobileOpen ? "1fr" : "0fr", opacity: mobileOpen ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <div className="px-3.5 pb-3.5 pt-2 flex flex-col gap-1 border-t border-[var(--nav-border-mobile)]">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-[var(--cream-dim)] no-underline text-[13px] font-medium py-2 transition-colors hover:text-[var(--cream)]"
              >
                {link.label}
              </a>
            ))}
            <Button size="sm" variant="ghost" asChild className="w-full mt-1">
              <Link href="/login" onClick={() => setMobileOpen(false)}>Se connecter</Link>
            </Button>
            <Button size="sm" variant="liquid-glass" asChild className="w-full mt-1.5">
              <Link href="/register" onClick={() => setMobileOpen(false)}>Essayer gratuitement</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
