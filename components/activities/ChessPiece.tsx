import type { PieceSymbol } from "chess.js";

const SHAPES: Record<PieceSymbol, React.ReactNode> = {
  p: (
    <>
      <circle cx="24" cy="12" r="6" />
      <path d="M19 18h10l-2 6 5 12H16l5-12Z" />
    </>
  ),
  r: (
    <>
      <path d="M14 8h5v5h3V8h4v5h3V8h5v12H14ZM18 20h12l-2 11 5 5H15l5-5Z" />
    </>
  ),
  n: (
    <>
      <path d="M15 36h20l-3-6V17l-7-9-1-4-5 5-7 12 7 3 6-7-3 13Z" />
      <circle cx="24" cy="13" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  b: (
    <>
      <path d="M24 5c-3 5-10 9-10 15 0 4 4 7 10 7s10-3 10-7c0-6-7-10-10-15Z" />
      <path d="m25 12-5 8M20 27h8l-1 4 6 5H15l6-5Z" />
    </>
  ),
  q: (
    <>
      <path d="m13 13 4 14h14l4-14-7 7-4-10-4 10ZM18 27h12l-2 5 5 4H15l5-4Z" />
      <circle cx="12" cy="11" r="2" />
      <circle cx="24" cy="7" r="2" />
      <circle cx="36" cy="11" r="2" />
    </>
  ),
  k: (
    <>
      <path d="M24 4v10M20 8h8" fill="none" />
      <path d="M18 16h12l3 6-4 5H19l-4-5ZM18 27h12l-2 5 5 4H15l5-4Z" />
    </>
  ),
};

export function ChessPiece({
  type,
  color,
}: {
  type: PieceSymbol;
  color: "w" | "b";
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className="pointer-events-none h-[85%] w-[85%]"
      aria-hidden="true"
      fill={color === "w" ? "#fffaf0" : "#293c35"}
      stroke={color === "w" ? "#43534b" : "#f3eee1"}
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {SHAPES[type]}
      <path d="M13 37h22v5H13Z" />
    </svg>
  );
}
