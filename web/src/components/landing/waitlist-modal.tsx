"use client";

import { createContext, useContext, useState, useCallback } from "react";
import { X } from "lucide-react";
import Image from "next/image";

// --- Context to open/close modal from anywhere ---
const WaitlistContext = createContext<{ open: (source?: string) => void }>({ open: () => {} });

export function useWaitlist() {
  return useContext(WaitlistContext);
}

export function WaitlistProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [source, setSource] = useState("unknown");
  const open = useCallback((src: string = "unknown") => {
    setSource(src);
    setIsOpen(true);
  }, []);

  return (
    <WaitlistContext.Provider value={{ open }}>
      {children}
      {isOpen && <WaitlistModal source={source} onClose={() => setIsOpen(false)} />}
    </WaitlistContext.Provider>
  );
}

// --- Modal ---
function WaitlistModal({ source, onClose }: { source: string; onClose: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const body = {
      firstName: form.get("firstName") as string,
      lastName: form.get("lastName") as string,
      email: form.get("email") as string,
      source,
    };

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Erreur réseau, réessaie.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="modal-split animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left — branding side (hidden on mobile) */}
        <div className="hidden md:flex relative overflow-hidden flex-col justify-between p-9 bg-[var(--background)]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_18%_0%,rgba(33,79,207,0.08),transparent_48%),radial-gradient(ellipse_at_82%_100%,rgba(33,79,207,0.04),transparent_48%)]" />
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: "url(/pattern.svg)", backgroundSize: "cover", backgroundPosition: "center" }}
          />
          <div className="relative z-1">
            <Image src="/hero.svg" alt="Hit The Record" width={200} height={40} className="h-[26px] w-auto" />
          </div>
          <div className="relative z-1">
            <div className="font-black text-[23px] uppercase leading-[0.93] text-[var(--cream)] text-left">
            <em className="text-[var(--blue-light)] not-italic">Le plugin</em>
              <br />
              qui élimine
              <br />
              les retours.
            </div>
          </div>
        </div>

        {/* Right — form side */}
        <div className="bg-[var(--background)] p-8 relative">
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--gray)] hover:text-[var(--cream)] transition-colors cursor-pointer bg-transparent border-none p-0"
          >
            <X className="size-4" />
          </button>

          {!submitted ? (
            <>
              <div className="font-bold text-xl text-[var(--cream)] mb-2">
                Le plugin n&apos;est pas encore disponible.
              </div>
              <p className="text-[13px] text-[var(--cream-muted)] leading-[1.6] mb-6">
                Rejoins la waitlist pour être prévenu dès la sortie.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input type="text" name="firstName" placeholder="Prénom" required className="form-input" />
                  <input type="text" name="lastName" placeholder="Nom" required className="form-input" />
                </div>
                <input type="email" name="email" placeholder="Email" required className="form-input" />
                {error && <p className="text-[12px] text-[var(--red)] m-0">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="h-10 rounded-xl bg-[var(--primary)] text-white text-sm font-semibold cursor-pointer border-none transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Envoi..." : "Rejoindre la waitlist"}
                </button>
              </form>

              <p className="text-[10px] text-[var(--gray)] mt-4 text-center">
                Pas de spam, promis. Juste un email pour te dire quand il sort.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center py-4">
              <div className="text-2xl mb-3">✓</div>
              <div className="font-bold text-lg text-[var(--cream)] mb-2">
                Tu es sur la liste.
              </div>
              <p className="text-[13px] text-[var(--cream-muted)] leading-[1.6]">
                On te prévient dès que HTR Edit est disponible.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
