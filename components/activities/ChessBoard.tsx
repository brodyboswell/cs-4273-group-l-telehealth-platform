"use client";

import { useState } from "react";
import { Chess, type Square, type PieceSymbol } from "chess.js";

const FILES = "abcdefgh";
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const GLYPHS = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
const NAMES: Record<PieceSymbol, string> = {
  k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn",
};

export function ChessBoard() {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<Square | null>(null);
  const [message, setMessage] = useState("");
  const moves = selected ? game.moves({ square: selected, verbose: true }) : [];
  const history = game.history();
  const lastMove = game.history({ verbose: true }).at(-1);
  const turn = game.turn() === "w" ? "White" : "Black";
  const status = game.isCheckmate()
    ? `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`
    : game.isStalemate() ? "Draw — stalemate"
    : game.isThreefoldRepetition() ? "Draw — threefold repetition"
    : game.isInsufficientMaterial() ? "Draw — insufficient material"
    : game.isDraw() ? "Draw — fifty-move rule"
    : `${turn} to move${game.isCheck() ? " — check" : ""}`;

  function commitMove(to: Square, piece?: string) {
    if (!selected) return;
    // Replaying preserves repetition history as well as the current position.
    const next = new Chess();
    for (const move of history) next.move(move);
    next.move({ from: selected, to, ...(piece ? { promotion: piece } : {}) });
    setGame(next);
    setSelected(null);
    setPromotion(null);
    setMessage("");
  }

  function selectSquare(square: Square) {
    if (game.isGameOver() || promotion) return;
    const piece = game.get(square);
    if (square === selected) {
      setSelected(null);
      setMessage("");
    } else if (piece?.color === game.turn()) {
      setSelected(square);
      setMessage("");
    } else {
      const move = moves.find((candidate) => candidate.to === square);
      if (move?.promotion) setPromotion(square);
      else if (move) commitMove(square);
      else setMessage(selected ? "Choose a highlighted square for a legal move." : `Select a ${turn.toLowerCase()} piece first.`);
    }
  }

  function undo() {
    const next = new Chess();
    for (const move of history.slice(0, -1)) next.move(move);
    setGame(next);
    setSelected(null);
    setPromotion(null);
    setMessage("");
  }

  return (
    <div className="flex h-full flex-wrap items-center justify-center gap-6 overflow-auto bg-cream p-4 md:gap-10 md:px-10">
      <div className="flex items-start gap-2" style={{ "--board-size": "min(56vh, 420px, 72vw)" } as React.CSSProperties}>
        <div className="flex w-4 flex-col justify-around text-xs text-charcoal/50" style={{ height: "var(--board-size)" }} aria-hidden="true">
          {RANKS.map((rank) => <span key={rank}>{rank}</span>)}
        </div>
        <div>
          <div className="grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] overflow-hidden rounded-panel border-2 border-charcoal" style={{ width: "var(--board-size)", height: "var(--board-size)" }} role="group" aria-label="Chessboard, white at bottom">
            {RANKS.flatMap((rank, row) => FILES.split("").map((file, col) => {
              const square = `${file}${rank}` as Square;
              const piece = game.get(square);
              const legal = moves.some((move) => move.to === square);
              const recent = lastMove?.from === square || lastMove?.to === square;
              return (
                <button key={square} type="button" onClick={() => selectSquare(square)}
                  disabled={!!promotion || game.isGameOver()}
                  aria-pressed={selected === square}
                  aria-label={`${square}, ${piece ? `${piece.color === "w" ? "white" : "black"} ${NAMES[piece.type]}` : "empty"}${legal ? ", legal destination" : ""}`}
                  className={`relative flex min-h-0 min-w-0 items-center justify-center p-0 text-3xl leading-none text-charcoal select-none focus-visible:z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-terracotta ${
                    (row + col) % 2 === 0 ? "bg-cream" : "bg-sage"
                  } ${selected === square ? "ring-4 ring-inset ring-terracotta" : recent ? "ring-2 ring-inset ring-charcoal/30" : ""}`}>
                  {piece && <span aria-hidden="true">{GLYPHS[piece.color][piece.type]}</span>}
                  {legal && <span aria-hidden="true" className={`pointer-events-none absolute ${piece ? "inset-1 rounded-full border-4 border-terracotta" : "h-3 w-3 rounded-full bg-charcoal/40"}`} />}
                </button>
              );
            }))}
          </div>
          <div className="mt-1 grid grid-cols-8 text-center text-xs text-charcoal/50" aria-hidden="true">
            {FILES.split("").map((file) => <span key={file}>{file}</span>)}
          </div>
        </div>
      </div>

      <aside className="w-56 shrink-0 rounded-panel border border-charcoal/15 bg-white p-5">
        <h2 className="text-base font-semibold text-charcoal">Before each move</h2>
        <p className="mt-2 text-sm text-charcoal/70">Share one thing about your day.</p>
        <p className="mt-3 text-xs text-charcoal/70">Two players on this device. Select a piece, then a highlighted square.</p>
        <div role="status" className="mt-4 rounded-panel bg-terracotta px-4 py-3 text-center text-sm font-medium text-white">{status}</div>
        <p aria-live="polite" className="mt-2 text-xs text-charcoal/70">{message}</p>
        {promotion && (
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">Promote pawn to</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["q", "r", "b", "n"] as const).map((piece) => (
                <button key={piece} type="button" onClick={() => commitMove(promotion, piece)} className="rounded border border-charcoal/30 px-2 py-1 text-sm capitalize">{NAMES[piece]}</button>
              ))}
              <button type="button" onClick={() => setPromotion(null)} className="text-sm underline">Cancel</button>
            </div>
          </fieldset>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={undo} disabled={!history.length || !!promotion} className="rounded-panel border border-charcoal/30 px-3 py-2 text-sm disabled:opacity-40">Undo</button>
          <button type="button" onClick={() => { setGame(new Chess()); setSelected(null); setPromotion(null); setMessage(""); }} className="rounded-panel border border-charcoal/30 px-3 py-2 text-sm">New game</button>
        </div>
        <h3 className="mt-4 text-sm font-semibold">Moves</h3>
        <ol className="mt-1 max-h-24 overflow-auto text-xs text-charcoal/70" aria-label="Move history">
          {history.filter((_, index) => index % 2 === 0).map((move, index) => (
            <li key={index}>{index + 1}. {move} {history[index * 2 + 1] ?? ""}</li>
          ))}
        </ol>
        {!history.length && <p className="mt-1 text-xs text-charcoal/50">No moves yet.</p>}
      </aside>
    </div>
  );
}
