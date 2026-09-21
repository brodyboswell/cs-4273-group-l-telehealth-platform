import { AnnotationToolbar } from "./AnnotationToolbar";

const FEELINGS = [
  { label: "Calm", color: "#88A294" },
  { label: "Happy", color: "#E8C84A" },
  { label: "Excited", color: "#E8A060" },
  { label: "Proud", color: "#B07AC9" },
  { label: "Worried", color: "#7BA3C9", selected: true },
  { label: "Sad", color: "#6B8FB8" },
  { label: "Angry", color: "#D65A4A" },
  { label: "Frustrated", color: "#E89060" },
  { label: "Tired", color: "#9B7AB8" },
  { label: "Lonely", color: "#88A294" },
  { label: "Hopeful", color: "#E8C84A" },
  { label: "Unsure", color: "#E8A060" },
] as const;

function FeelingFace({ color }: { color: string }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r="26" fill={color} stroke="#293C35" strokeWidth="2" />
      <circle cx="20" cy="24" r="2.5" fill="#293C35" />
      <circle cx="36" cy="24" r="2.5" fill="#293C35" />
      <path
        d="M20 36 Q28 42 36 36"
        fill="none"
        stroke="#293C35"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FeelingsCheckIn() {
  return (
    <div className="flex h-full bg-charcoal">
      <div className="flex min-w-0 flex-1 items-center justify-center p-8">
        <div className="w-full max-w-2xl rounded-panel bg-white px-10 py-8 shadow-sm">
          <h1 className="text-2xl font-semibold text-charcoal">
            How are you feeling?
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Select a feeling to talk about.
          </p>
          <div className="mt-8 grid grid-cols-4 gap-x-6 gap-y-8">
            {FEELINGS.map((feeling) => {
              const selected = "selected" in feeling && feeling.selected;
              return (
                <div
                  key={feeling.label}
                  className={`relative flex flex-col items-center gap-2 rounded-panel p-2 ${
                    selected ? "ring-2 ring-sage" : ""
                  }`}
                >
                  {selected && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-xs text-white">
                      ✓
                    </span>
                  )}
                  <FeelingFace color={feeling.color} />
                  <span className="text-sm text-charcoal">{feeling.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <AnnotationToolbar />
    </div>
  );
}
