import { AnnotationToolbar } from "./AnnotationToolbar";

export function WhiteboardCanvas() {
  return (
    <div className="flex h-full bg-charcoal">
      <div className="relative min-w-0 flex-1 p-6">
        <div className="relative h-full w-full overflow-hidden rounded-panel bg-white">
          {/* Sticky prompt */}
          <div className="absolute left-6 top-6 z-10 max-w-[14rem] rounded-sm border border-charcoal/10 bg-[#F5E6D8] px-3 py-2 text-sm text-charcoal shadow-sm">
            Draw a place you feel comfortable.
          </div>

          {/* Static doodle — not interactive */}
          <svg
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            width="220"
            height="160"
            viewBox="0 0 220 160"
            fill="none"
            aria-hidden
          >
            <circle cx="170" cy="36" r="18" stroke="#88A294" strokeWidth="2.5" />
            <path
              d="M40 120 L40 70 L100 40 L160 70 L160 120 Z"
              stroke="#88A294"
              strokeWidth="2.5"
            />
            <rect
              x="85"
              y="90"
              width="28"
              height="30"
              stroke="#88A294"
              strokeWidth="2.5"
            />
            <path
              d="M50 120 Q70 100 90 120"
              stroke="#88A294"
              strokeWidth="2"
            />
          </svg>

          <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-charcoal/15 bg-cream px-3 py-1.5 text-xs text-charcoal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <circle cx="9" cy="8" r="3" />
              <circle cx="16" cy="9" r="2.5" />
              <path d="M2 20c0-3 3-5 7-5s7 2 7 5" />
              <path d="M14 15c2.5 0 5 1.5 5 4" />
            </svg>
            Shared control on
            <span className="h-2 w-2 rounded-full bg-sage" />
          </div>
        </div>
      </div>
      <AnnotationToolbar />
    </div>
  );
}
