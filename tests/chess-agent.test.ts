import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Chess } from "chess.js";
import { ActivityRegistryError } from "../lib/activities/registry";
import { activityRegistry } from "../lib/activities/catalog";
import {
  chessMoveId,
  isChessToolInputForPosition,
  type ChessMove,
} from "../lib/chess/chessTypes";
import {
  remainingThinkTime,
  waitForMinimumThinkTime,
} from "../lib/chat/thinkDelay";
import type { ActivityTool } from "../lib/activities/types";

function snapshotFromMoves(
  moves: ChessMove[],
  learnerColor: "w" | "b" = "w",
  gameId = "chess-game-123",
  turnEpoch = 4,
) {
  const game = new Chess();
  for (const move of moves) game.move(move);
  return {
    activityId: "chess",
    state: {
      gameId,
      turnEpoch,
      fen: game.fen(),
      moveHistory: moves,
      learnerColor,
    },
  };
}

function movesFromSan(sanMoves: string[]): ChessMove[] {
  const game = new Chess();
  for (const san of sanMoves) game.move(san);
  return game.history({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion as ChessMove["promotion"] } : {}),
  }));
}

describe("chess activity state and tools", () => {
  it("reconstructs the board, exposes only legal options, and validates a selected move", () => {
    const snapshot = snapshotFromMoves([{ from: "e2", to: "e4" }]);
    const resolved = activityRegistry.resolve(snapshot);

    assert.equal(resolved.requiredToolName, "play_chess_move");
    assert.deepEqual(resolved.tools.map((tool) => tool.name), ["play_chess_move"]);
    assert.match(resolved.description, /e7e5/);
    const moveOptions =
      resolved.tools[0]?.inputSchema.type === "object"
        ? resolved.tools[0].inputSchema.properties.move
        : undefined;
    assert.ok(moveOptions && moveOptions.type === "string");
    assert.ok(moveOptions.enum?.includes("e7e5"));

    const action = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "e7e5" },
      resolved.state,
    );
    assert.deepEqual(action.input, {
      type: "play_chess_move",
      move: { from: "e7", to: "e5" },
      spokenText: "I move my pawn from e7 to e5.",
      gameId: "chess-game-123",
      turnEpoch: 4,
      fen: resolved.state && (resolved.state as { fen: string }).fen,
    });

    assert.throws(
      () =>
        activityRegistry.validateAction(
          "chess",
          "play_chess_move",
          { move: "e7e4" },
          resolved.state,
        ),
      ActivityRegistryError,
    );
  });

  it("describes the validated move accurately, including a capture", () => {
    const history = movesFromSan(["e4", "f5"]);
    const resolved = activityRegistry.resolve(snapshotFromMoves(history, "b"));

    const push = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "e4e5" },
      resolved.state,
    );
    assert.equal(
      (push.input as { spokenText: string }).spokenText,
      "I move my pawn from e4 to e5.",
    );

    const capture = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "e4f5" },
      resolved.state,
    );
    assert.equal(
      (capture.input as { spokenText: string }).spokenText,
      "I capture the pawn on f5 with my pawn.",
    );
  });

  it("validates a learner move event against the replayed position", () => {
    const move = { from: "e2", to: "e4" } as const;
    const resolved = activityRegistry.resolve(snapshotFromMoves([move]));
    const event = activityRegistry.validateTurnEvent(
      "chess",
      "chess-game-123-4",
      { type: "learner_move", input: { move } },
      resolved.state,
    );
    assert.deepEqual(event, {
      activityId: "chess",
      requestId: "chess-game-123-4",
      actor: "learner",
      type: "move",
      text: "The learner played e2e4. It is your turn to move.",
      input: { move },
    });

    assert.throws(
      () =>
        activityRegistry.validateTurnEvent(
          "chess",
          "chess-game-123-4",
          { type: "learner_move", input: { move: { from: "d2", to: "d4" } } },
          resolved.state,
        ),
      ActivityRegistryError,
    );
  });

  it("requests and validates the client opening move when the learner chooses Black", () => {
    const resolved = activityRegistry.resolve(snapshotFromMoves([], "b"));
    const event = activityRegistry.validateTurnEvent(
      "chess",
      "chess-game-123-4",
      { type: "opening" },
      resolved.state,
    );
    assert.equal(event.actor, "platform");
    assert.equal(event.type, "opening");
    assert.ok(resolved.tools[0]?.mockInput);
    assert.equal(resolved.tools[0]?.mockInput && typeof resolved.tools[0].mockInput, "object");

    assert.deepEqual(
      activityRegistry.resolve(snapshotFromMoves([])).tools,
      [],
    );
  });

  it("derives castling, en passant, and exact promotion options from legal history", () => {
    const castlingMoves = movesFromSan([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Be2",
      "Nf6",
    ]);
    const castling = activityRegistry.resolve(
      snapshotFromMoves(castlingMoves, "b"),
    );
    const castlingOptions = getMoveOptions(castling.tools[0]);
    assert.ok(castlingOptions.includes("e1g1"));
    const castleAction = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "e1g1" },
      castling.state,
    );
    assert.equal(
      (castleAction.input as { spokenText: string }).spokenText,
      "I castle kingside.",
    );

    const enPassantMoves = movesFromSan(["e4", "a6", "e5", "d5"]);
    const enPassant = activityRegistry.resolve(
      snapshotFromMoves(enPassantMoves, "b"),
    );
    assert.ok(getMoveOptions(enPassant.tools[0]).includes("e5d6"));
    const enPassantAction = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "e5d6" },
      enPassant.state,
    );
    assert.equal(
      (enPassantAction.input as { spokenText: string }).spokenText,
      "I capture the pawn on d5 with my pawn.",
    );

    const promotionMoves = movesFromSan([
      "h3",
      "e6",
      "a4",
      "h5",
      "a5",
      "h4",
      "a6",
      "e5",
      "axb7",
      "e4",
    ]);
    const promotion = activityRegistry.resolve(
      snapshotFromMoves(promotionMoves, "b"),
    );
    const promotionOptions = getMoveOptions(promotion.tools[0]);
    for (const piece of ["q", "r", "b", "n"])
      assert.ok(promotionOptions.includes(`b7a8${piece}`));
    assert.equal(chessMoveId({ from: "b7", to: "a8", promotion: "q" }), "b7a8q");
    const promotionAction = activityRegistry.validateAction(
      "chess",
      "play_chess_move",
      { move: "b7a8q" },
      promotion.state,
    );
    assert.equal(
      (promotionAction.input as { spokenText: string }).spokenText,
      "I capture the rook on a8 with my pawn and promote my pawn to a queen.",
    );
  });

  it("rejects inconsistent histories and withholds tools after a terminal game", () => {
    const invalid = snapshotFromMoves([{ from: "e2", to: "e4" }]);
    (invalid.state as { fen: string }).fen = new Chess().fen();
    assert.throws(() => activityRegistry.resolve(invalid), ActivityRegistryError);

    const illegal = {
      activityId: "chess",
      state: {
        gameId: "chess-game-123",
        turnEpoch: 4,
        fen: new Chess().fen(),
        moveHistory: [{ from: "e2", to: "e5" }],
        learnerColor: "w",
      },
    };
    assert.throws(() => activityRegistry.resolve(illegal), ActivityRegistryError);

    const foolsmate = movesFromSan(["f3", "e5", "g4", "Qh4#"]);
    const terminal = activityRegistry.resolve(
      snapshotFromMoves(foolsmate, "b"),
    );
    assert.deepEqual(terminal.tools, []);
    assert.equal(terminal.requiredToolName, undefined);
  });

  it("rejects tool replies from a reset or changed chess position", () => {
    const action = {
      type: "play_chess_move",
      move: { from: "e7", to: "e5" },
      spokenText: "I move my pawn from e7 to e5.",
      gameId: "chess-game-123",
      turnEpoch: 4,
      fen: "position-fen",
    };
    const position = {
      gameId: "chess-game-123",
      turnEpoch: 4,
      fen: "position-fen",
    };
    assert.equal(isChessToolInputForPosition(action, position), true);
    assert.equal(
      isChessToolInputForPosition(action, { ...position, gameId: "reset-game" }),
      false,
    );
    assert.equal(
      isChessToolInputForPosition(action, { ...position, turnEpoch: 5 }),
      false,
    );
    assert.equal(
      isChessToolInputForPosition(action, { ...position, fen: "new-position" }),
      false,
    );
  });

  it("holds quick client responses until the minimum visible think time elapses", async () => {
    assert.equal(remainingThinkTime(100, 100), 400);
    assert.equal(remainingThinkTime(100, 425), 75);
    assert.equal(remainingThinkTime(100, 500), 0);
    assert.equal(remainingThinkTime(100, 100, 0), 0);
    const startedAt = performance.now();
    await waitForMinimumThinkTime(startedAt);
    assert.ok(performance.now() - startedAt >= 400);
  });
});

function getMoveOptions(tool: ActivityTool | undefined) {
  if (!tool || typeof tool.inputSchema !== "object" || tool.inputSchema === null)
    return [] as string[];
  const schema = tool.inputSchema as {
    properties?: { move?: { enum?: string[] } };
  };
  return schema.properties?.move?.enum ?? [];
}
