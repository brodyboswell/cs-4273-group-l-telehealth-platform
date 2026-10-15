import type { ChessMoveAction, ChessMoveRequest } from "./chessTypes";

/** Randomized local stand-in for the future virtual-client move agent. */
export async function requestMockAgentChessMove(
  request: ChessMoveRequest,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 400));

  const move =
    request.legalMoves[
      Math.floor(Math.random() * request.legalMoves.length)
    ];
  if (!move) throw new Error("The virtual client has no legal move available.");

  const response: ChessMoveAction = {
    type: "play_chess_move",
    move,
    message: "Let me think… I’ll try this move.",
  };
  return response;
}
