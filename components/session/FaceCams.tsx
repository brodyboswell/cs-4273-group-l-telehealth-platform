import Image from "next/image";

export function FaceCams({ darkRail = false }: { darkRail?: boolean }) {
  return (
    <aside
      className={`flex w-14 sm:w-28 xl:w-rail shrink-0 flex-col items-center gap-6 overflow-hidden border-r border-charcoal/10 px-1 sm:px-4 pt-5 ${
        darkRail ? "bg-charcoal" : "bg-[#EDEBE4]"
      }`}
    >
      <Cam src="/avatar-you.svg" label="You" darkRail={darkRail} />
      <Cam src="/avatar-alex.svg" label="AI Bot" darkRail={darkRail} />
    </aside>
  );
}

function Cam({
  src,
  label,
  darkRail,
}: {
  src: string;
  label: string;
  darkRail: boolean;
}) {
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative h-10 w-10 sm:h-20 sm:w-20 xl:h-cam xl:w-cam shrink-0 overflow-hidden rounded-full border-2 border-white/70 bg-[#E8E4DA]">
        <Image
          src={src}
          alt={label}
          width={336}
          height={336}
          className="h-full w-full object-cover object-center"
          unoptimized
          priority
        />
      </div>
      <span
        className={`z-10 -mt-2 rounded-full border px-3 py-0.5 text-xs font-semibold ${
          darkRail
            ? "border-transparent bg-sage text-charcoal"
            : "border-charcoal/40 bg-white text-charcoal"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
