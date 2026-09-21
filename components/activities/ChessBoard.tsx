const FILES = "abcdefgh";
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/** Unicode chess glyphs in starting positions. Row 0 = rank 8. */
const INITIAL: (string | null)[][] = [
  ["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜"],
  ["♟", "♟", "♟", "♟", "♟", "♟", "♟", "♟"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["♙", "♙", "♙", "♙", "♙", "♙", "♙", "♙"],
  ["♖", "♘", "♗", "♕", "♔", "♗", "♘", "♖"],
];

export function ChessBoard() {
  return (
    <div className="flex h-full items-center justify-center gap-10 bg-cream px-10">
      <div className="flex items-start gap-2">
        {/* Rank labels */}
        <div className="flex h-[min(56vh,420px)] w-4 flex-col justify-around py-1 text-xs text-charcoal/50">
          {RANKS.map((r) => (
            <span key={r} className="leading-none">
              {r}
            </span>
          ))}
        </div>

        <div>
          <div
            className="grid overflow-hidden rounded-panel border-2 border-charcoal"
            style={{
              gridTemplateColumns: "repeat(8, 1fr)",
              width: "min(56vh, 420px)",
              height: "min(56vh, 420px)",
            }}
            aria-label="Chessboard — display only"
          >
            {INITIAL.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const isLight = (rowIndex + colIndex) % 2 === 0;
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    className={`flex items-center justify-center text-3xl leading-none select-none ${
                      isLight ? "bg-cream" : "bg-sage"
                    }`}
                  >
                    {piece}
                  </div>
                );
              })
            )}
          </div>
          {/* File labels */}
          <div
            className="mt-1 grid text-center text-xs text-charcoal/50"
            style={{
              gridTemplateColumns: "repeat(8, 1fr)",
              width: "min(56vh, 420px)",
            }}
          >
            {FILES.split("").map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        </div>
      </div>

      <aside className="w-56 shrink-0 rounded-panel border border-charcoal/15 bg-white p-5">
        <h2 className="text-base font-semibold text-charcoal">
          Before each move
        </h2>
        <p className="mt-2 text-sm text-charcoal/70">
          Share one thing about your day.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2 rounded-panel bg-terracotta px-4 py-3 text-sm font-medium text-white">
          <span aria-hidden className="text-lg">
            ♙
          </span>
          Your turn
        </div>
      </aside>
    </div>
  );
}
