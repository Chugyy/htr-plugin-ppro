export function SectionHeader({
  tag,
  children,
  center = false,
}: {
  tag: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`flex flex-col ${center ? "items-center" : "items-start"}`}>
      <div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[3px] uppercase text-[var(--blue-light)] mb-4">
        <span className="w-5 h-0.5 bg-[var(--blue-light)]" />
        {tag}
      </div>
      <h2
        className={`font-black text-[clamp(28px,4.6vw,62px)] leading-[0.93] uppercase text-[var(--cream)] [&>em]:text-[var(--blue-light)] [&>em]:not-italic ${center ? "text-center" : ""}`}
      >
        {children}
      </h2>
    </div>
  );
}
