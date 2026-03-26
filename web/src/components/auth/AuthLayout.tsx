import Image from "next/image";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 pattern-overlay">
      <div className="mb-8">
        <Image
          src="/hero.svg"
          alt="HTR Edit"
          width={140}
          height={28}
          className="h-7 w-auto"
          priority
        />
      </div>
      <div className="w-full max-w-sm relative z-10">{children}</div>
    </div>
  );
}
