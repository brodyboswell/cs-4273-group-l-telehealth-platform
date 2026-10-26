import type { Square } from "chess.js";

export type ChessColor = "w" | "b";
export type ChessPromotion = "q" | "r" | "b" | "n";

export type ChessMove = {
  from: Square;
  to: Square;
  promotion?: ChessPromotion;
};

export type ChessToolInput = {
  type: "play_chess_move";
  move: ChessMove;
  commentary: string;
  gameId: string;
  turnEpoch: number;
  fen: string;
};

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set<ChessPromotion>(["q", "r", "b", "n"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPromotion(value: unknown): value is ChessPromotion {
  return typeof value === "string" && PROMOTIONS.has(value as ChessPromotion);
}

export function parseChessMove(value: unknown): ChessMove {
  if (!isRecord(value)) throw new Error("Expected a chess move.");
  const hasPromotion = value.promotion !== undefined;
  if (
    typeof value.from !== "string" ||
    !SQUARE_PATTERN.test(value.from) ||
    typeof value.to !== "string" ||
    !SQUARE_PATTERN.test(value.to) ||
    (hasPromotion && !isPromotion(value.promotion))
  )
    throw new Error("The chess move is malformed.");
  return {
    from: value.from as Square,
    to: value.to as Square,
    ...(hasPromotion ? { promotion: value.promotion as ChessPromotion } : {}),
  };
}

export function chessMoveId(move: ChessMove): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

export function isChessToolInputForPosition(
  value: unknown,
  position: { gameId: string; turnEpoch: number; fen: string },
): value is ChessToolInput {
  return (
    isRecord(value) &&
    value.type === "play_chess_move" &&
    value.gameId === position.gameId &&
    value.turnEpoch === position.turnEpoch &&
    value.fen === position.fen
  );
}

export function parseChessToolInput(
  value: unknown,
  state: {
    legalMoves: readonly ChessMove[];
    gameId: string;
    turnEpoch: number;
    fen: string;
  },
): ChessToolInput {
  if (!isRecord(value) || Object.keys(value).some((key) => !["move", "commentary"].includes(key)))
    throw new Error("Expected a legal move and brief client commentary.");
  if (typeof value.move !== "string")
    throw new Error("Choose one of the listed legal moves.");
  const move = state.legalMoves.find(
    (candidate) => chessMoveId(candidate) === value.move,
  );
  if (!move)
    throw new Error("The selected move is not legal in the current position.");
  if (
    typeof value.commentary !== "string" ||
    !value.commentary.trim() ||
    value.commentary.length > 500
  )
    throw new Error("Client commentary must be 1–500 characters.");
  return {
    type: "play_chess_move",
    move,
    commentary: value.commentary.trim(),
    gameId: state.gameId,
    turnEpoch: state.turnEpoch,
    fen: state.fen,
  };
}

/** Match all move fields so a promotion must name the exact promoted piece. */
export function isMoveInLegalList(
  candidate: ChessMove,
  legalMoves: ChessMove[],
): boolean {
  return legalMoves.some(
    (move) =>
      move.from === candidate.from &&
      move.to === candidate.to &&
      move.promotion === candidate.promotion,
  );
}
