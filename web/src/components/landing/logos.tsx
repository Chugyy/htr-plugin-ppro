const BRANDS = [
  "Nike",
  "Puma",
  "Squeezie",
  "Mcfly & Carlito",
  "Inoxtag",
  "200+ créateurs",
];

export function Logos() {
  return (
    <div className="w-full py-7 px-12 text-center border-t border-b border-white/[0.04]">
      <div className="text-[9.5px] font-semibold tracking-[2.5px] uppercase text-white/20 mb-5">
        Les monteurs qui travaillent pour
      </div>
      <div className="flex justify-center gap-4 items-center flex-wrap">
        {BRANDS.map((brand) => (
          <div
            key={brand}
            className="font-extrabold text-[13px] text-white/[0.18] tracking-[1px] uppercase px-3.5 py-1.5 border border-white/[0.07] rounded-full transition-all cursor-default hover:text-white/[0.36] hover:border-white/[0.13]"
          >
            {brand}
          </div>
        ))}
      </div>
    </div>
  );
}
