import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import {
  isMoveInLegalList,
  parseChessMoveAction,
  type ChessMove,
} from "../lib/chess/chessTypes";
import { requestMockAgentChessMove } from "../lib/chess/mockAgent";

describe("chess agent action", () => {
  it("chooses a legal move from the requested position and returns a client line", async () => {
    const game = new Chess();
    const legalMoves: ChessMove[] = game.moves({ verbose: true }).map((move) => ({
      from: move.from,
      to: move.to,
      ...(move.promotion
        ? { promotion: move.promotion as ChessMove["promotion"] }
        : {}),
    }));
    const request = {
      fen: game.fen(),
      moveHistory: game.history(),
      agentColor: "b" as const,
      legalMoves,
    };

    const action = parseChessMoveAction(
      await requestMockAgentChessMove(request),
    );

    assert.equal(action.type, "play_chess_move");
    assert.equal(action.message, "Let me think… I’ll try this move.");
    assert.equal(isMoveInLegalList(action.move, legalMoves), true);
  });

  it("parses promotion choices and rejects malformed responses", () => {
    const promotion = parseChessMoveAction({
      type: "play_chess_move",
      move: { from: "e7", to: "e8", promotion: "q" },
      message: "I’ll promote to a queen.",
    });
    assert.deepEqual(promotion.move, {
      from: "e7",
      to: "e8",
      promotion: "q",
    });

    for (const response of [
      null,
      { type: "other", move: { from: "e2", to: "e4" }, message: "Hi" },
      {
        type: "play_chess_move",
        move: { from: "e2", to: "e9" },
        message: "Hi",
      },
      {
        type: "play_chess_move",
        move: { from: "e7", to: "e8", promotion: "k" },
        message: "Hi",
      },
      {
        type: "play_chess_move",
        move: { from: "e2", to: "e4" },
        message: "   ",
      },
    ]) {
      assert.throws(() => parseChessMoveAction(response));
    }
  });

  it("requires an exact legal move, including a promotion choice", () => {
    const legalMoves: ChessMove[] = [
      { from: "e7", to: "e8", promotion: "q" },
      { from: "e7", to: "e8", promotion: "n" },
    ];

    assert.equal(
      isMoveInLegalList({ from: "e7", to: "e8", promotion: "q" }, legalMoves),
      true,
    );
    assert.equal(
      isMoveInLegalList({ from: "e7", to: "e8" }, legalMoves),
      false,
    );
    assert.equal(
      isMoveInLegalList({ from: "e2", to: "e4" }, legalMoves),
      false,
    );
  });

  it("fails clearly when the request contains no legal moves", async () => {
    await assert.rejects(
      requestMockAgentChessMove({
        fen: new Chess().fen(),
        moveHistory: [],
        agentColor: "w",
        legalMoves: [],
      }),
      /no legal move available/i,
    );
  });
});
