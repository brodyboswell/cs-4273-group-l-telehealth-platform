import type { Square } from "chess.js";

export type ChessColor = "w" | "b";
export type ChessPromotion = "q" | "r" | "b" | "n";

export type ChessMove = {
  from: Square;
  to: Square;
  promotion?: ChessPromotion;
};

export type ChessMoveRequest = {
  fen: string;
  moveHistory: string[];
  agentColor: ChessColor;
  legalMoves: ChessMove[];
};

export type ChessMoveAction = {
  type: "play_chess_move";
  move: ChessMove;
  message: string;
};

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const PROMOTIONS = new Set<ChessPromotion>(["q", "r", "b", "n"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPromotion(value: unknown): value is ChessPromotion {
  return typeof value === "string" && PROMOTIONS.has(value as ChessPromotion);
}

/** Validate the mock/provider boundary before a move reaches the chess board. */
export function parseChessMoveAction(response: unknown): ChessMoveAction {
  if (!isRecord(response) || !isRecord(response.move)) {
    throw new Error("AI Bot returned an invalid chess response");
  }

  const candidateMove = response.move;
  const hasPromotion = candidateMove.promotion !== undefined;
  if (
    response.type !== "play_chess_move" ||
    typeof candidateMove.from !== "string" ||
    !SQUARE_PATTERN.test(candidateMove.from) ||
    typeof candidateMove.to !== "string" ||
    !SQUARE_PATTERN.test(candidateMove.to) ||
    (hasPromotion && !isPromotion(candidateMove.promotion)) ||
    typeof response.message !== "string" ||
    !response.message.trim()
  ) {
    throw new Error("AI Bot returned an invalid chess move");
  }

  return {
    type: "play_chess_move",
    move: {
      from: candidateMove.from as Square,
      to: candidateMove.to as Square,
      ...(hasPromotion ? { promotion: candidateMove.promotion as ChessPromotion } : {}),
    },
    message: response.message.trim(),
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
