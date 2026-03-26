"use client";

import { PageHeader } from "@/components/shared/PageHeader";
import { Download } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5001";
const LOOM_URL = "https://www.loom.com/share/4ea3dfba46e8421abf6912aef95d01f4";
const LOOM_EMBED = "https://www.loom.com/embed/4ea3dfba46e8421abf6912aef95d01f4";

export default function PluginPage() {
  return (
    <div>
      <PageHeader
        title="Plugin Premiere Pro"
        description="Télécharge et installe le plugin HTR Edit pour Adobe Premiere Pro."
      />

      <div className="space-y-6">
        {/* Download */}
        <div className="glass-panel rounded-xl border border-[var(--card-border)] p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-[var(--cream)]">
                Télécharger le plugin
              </h2>
              <p className="text-xs text-[var(--gray)] mt-1">
                Fichier .ccx — compatible Premiere Pro 26.0+
              </p>
            </div>
            <a
              href={`${API_URL}/plugin/download`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Download className="h-4 w-4" />
              Télécharger
            </a>
          </div>
        </div>

        {/* Tutorial */}
        <div className="glass-panel rounded-xl border border-[var(--card-border)] p-6">
          <h2 className="text-sm font-medium text-[var(--cream)] mb-4">
            Tutoriel d&apos;installation
          </h2>
          <div className="relative w-full aspect-video rounded-lg overflow-hidden">
            <iframe
              src={LOOM_EMBED}
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
          <a
            href={LOOM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-3 text-xs text-[var(--gray)] hover:text-[var(--cream)] transition-colors"
          >
            Ouvrir dans Loom →
          </a>
        </div>
      </div>
    </div>
  );
}
