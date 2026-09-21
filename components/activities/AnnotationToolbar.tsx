const TOOLS = [
  { id: "pen", label: "Pen", selected: true },
  { id: "text", label: "Text", selected: false },
  { id: "eraser", label: "Eraser", selected: false },
  { id: "undo", label: "Undo", selected: false },
] as const;

const COLORS = ["#293C35", "#88A294", "#C97C63", "#E8C84A", "#B8A0D0"] as const;

function ToolIcon({ id }: { id: string }) {
  if (id === "pen") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M12 19l7-7 3 3-7 7-3-3z" />
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
        <path d="M2 2l7.586 7.586" />
      </svg>
    );
  }
  if (id === "text") {
    return (
      <span className="text-base font-semibold leading-none" aria-hidden>
        T
      </span>
    );
  }
  if (id === "eraser") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M7 21h10M5 13l6-6 8 8-4 4H9l-4-4z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 00-15-6.7L3 13" />
    </svg>
  );
}

/** Visual-only annotation rail — no drawing behavior. */
export function AnnotationToolbar() {
  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-2 border-l border-charcoal/10 bg-white py-4">
      {TOOLS.map((tool) => (
        <div
          key={tool.id}
          className={`flex h-10 w-10 flex-col items-center justify-center rounded-panel ${
            tool.selected
              ? "bg-sage text-white"
              : "text-charcoal"
          }`}
          aria-hidden
        >
          <ToolIcon id={tool.id} />
        </div>
      ))}
      <div className="my-2 h-px w-8 bg-charcoal/15" />
      <div className="flex flex-col items-center gap-2">
        {COLORS.map((color, i) => (
          <div
            key={color}
            className={`h-5 w-5 rounded-full ${
              i === 0 ? "ring-2 ring-charcoal ring-offset-1" : ""
            }`}
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ))}
      </div>
    </aside>
  );
}
