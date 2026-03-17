import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-[var(--card-border-subtle)] py-9 px-[var(--section-px)] md:px-[var(--section-px-md)] flex flex-col md:flex-row justify-between items-center gap-6">
      <div className="flex flex-col md:flex-row items-center gap-3.5 text-xs text-[var(--gray)]">
        <a href="#" className="flex items-center">
          <Image
            src="/hero.svg"
            alt="Hit The Record"
            width={140}
            height={28}
            className="h-[18px] w-auto opacity-60 hover:opacity-100 transition-opacity"
          />
        </a>
        <span className="text-center">&copy; 2025 Hit The Record. Tous droits réservés.</span>
      </div>
      <div className="flex flex-col md:flex-row items-center gap-3 md:gap-6 text-xs">
        <a
          href="#"
          className="text-[var(--gray)] no-underline transition-colors hover:text-[var(--cream)]"
        >
          Mentions légales
        </a>
        <a
          href="/cgv.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--gray)] no-underline transition-colors hover:text-[var(--cream)]"
        >
          CGV
        </a>
        <a
          href="#"
          className="text-[var(--gray)] no-underline transition-colors hover:text-[var(--cream)]"
        >
          Contact
        </a>
      </div>
    </footer>
  );
}
