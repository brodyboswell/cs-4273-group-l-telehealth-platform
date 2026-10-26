import { Chess, type Square } from "chess.js";
import { isRecord } from "@/lib/chat/validation";
import {
  chessMoveId,
  parseChessMove,
  parseChessToolInput,
  type ChessColor,
  type ChessMove,
} from "@/lib/chess/chessTypes";
import { defineActivity, type ActivityDefinition } from "./types";

interface ChessActivityState {
  gameId: string;
  turnEpoch: number;
  fen: string;
  moveHistory: ChessMove[];
  learnerColor: ChessColor;
  agentColor: ChessColor;
  turn: ChessColor;
  lastMove: ChessMove | null;
  lastMoveColor: ChessColor | null;
  legalMoves: ChessMove[];
  gameOver: boolean;
  historySan: string[];
}

const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

function getLegalMoves(game: Chess): ChessMove[] {
  return game.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    ...(move.promotion ? { promotion: move.promotion as ChessMove["promotion"] } : {}),
  }));
}

function isChessColor(value: unknown): value is ChessColor {
  return value === "w" || value === "b";
}

function parseChessState(value: unknown): ChessActivityState {
  if (
    !isRecord(value) ||
    typeof value.gameId !== "string" ||
    !GAME_ID_PATTERN.test(value.gameId) ||
    !Number.isSafeInteger(value.turnEpoch) ||
    (value.turnEpoch as number) < 0 ||
    typeof value.fen !== "string" ||
    value.fen.length > 128 ||
    !Array.isArray(value.moveHistory) ||
    value.moveHistory.length > 512 ||
    !isChessColor(value.learnerColor)
  )
    throw new Error("Expected a valid chess position and move history.");

  const moveHistory = value.moveHistory.map(parseChessMove);
  const game = new Chess();
  for (const move of moveHistory) {
    const legal = getLegalMoves(game);
    if (!legal.some((candidate) => chessMoveId(candidate) === chessMoveId(move)))
      throw new Error(`Move ${chessMoveId(move)} is not legal in this game history.`);
    game.move({
      from: move.from as Square,
      to: move.to as Square,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
  }
  if (game.fen() !== value.fen)
    throw new Error("The FEN does not match the supplied legal move history.");

  const verboseHistory = game.history({ verbose: true });
  const lastMove = verboseHistory.at(-1);
  const learnerColor = value.learnerColor;
  return {
    gameId: value.gameId,
    turnEpoch: value.turnEpoch as number,
    fen: game.fen(),
    moveHistory,
    learnerColor,
    agentColor: learnerColor === "w" ? "b" : "w",
    turn: game.turn(),
    lastMove: lastMove
      ? {
          from: lastMove.from,
          to: lastMove.to,
          ...(lastMove.promotion
            ? { promotion: lastMove.promotion as ChessMove["promotion"] }
            : {}),
        }
      : null,
    lastMoveColor: lastMove?.color ?? null,
    legalMoves: getLegalMoves(game),
    gameOver: game.isGameOver(),
    historySan: game.history(),
  };
}

function describeState(state: ChessActivityState): string {
  const turn = state.turn === "w" ? "White" : "Black";
  const clientTurn = state.turn === state.agentColor;
  const options = state.legalMoves.map(chessMoveId);
  return [
    `The learner is playing chess as ${state.learnerColor === "w" ? "White" : "Black"}; you are ${state.agentColor === "w" ? "White" : "Black"}.`,
    `Position: ${state.fen}`,
    `Moves so far: ${state.historySan.join(" ") || "none"}.`,
    state.gameOver
      ? "The game is over; do not make another move."
      : clientTurn
        ? `It is your turn (${turn}). Choose exactly one available move: ${options.join(", ")}.`
        : `It is the learner's turn (${turn}); do not make a chess move yet.`,
  ].join("\n");
}

const chessTool = {
  name: "play_chess_move",
  description: "Play exactly one of the listed legal chess moves.",
  inputSchema: {
    type: "object" as const,
    properties: {
      move: {
        type: "string" as const,
        description: "An exact move ID from the currently available legal moves.",
        enum: [],
      },
    },
    required: ["move"],
    additionalProperties: false,
  },
  mockInput: { move: "e2e4" },
  parseInput(value: unknown, rawState?: unknown) {
    if (!rawState || typeof rawState !== "object")
      throw new Error("The current chess state is required to validate a move.");
    const state = rawState as ChessActivityState;
    return parseChessToolInput(value, state);
  },
};

const definition: ActivityDefinition<ChessActivityState> = {
  id: "chess",
  label: "chess board",
  parseState: parseChessState,
  describeState,
  tools: [chessTool],
  getTools(state) {
    if (state.gameOver || state.turn !== state.agentColor || state.legalMoves.length === 0)
      return [];
    return [
      {
        ...chessTool,
        inputSchema: {
          ...chessTool.inputSchema,
          properties: {
            ...chessTool.inputSchema.properties,
            move: {
              type: "string",
              description: "An exact move ID from the currently available legal moves.",
              enum: state.legalMoves.map(chessMoveId),
            },
          },
        },
        mockInput: {
          move: chessMoveId(state.legalMoves[0]!),
        },
      },
    ];
  },
  requiredToolName(state) {
    return state.gameOver || state.turn !== state.agentColor || state.legalMoves.length === 0
      ? undefined
      : "play_chess_move";
  },
  parseTurnEvent(value, requestId, state) {
    if (!REQUEST_ID_PATTERN.test(requestId) || requestId !== `${state.gameId}-${state.turnEpoch}`)
      throw new Error("The turn request does not match the current game position.");
    if (!isRecord(value) || typeof value.type !== "string")
      throw new Error("Expected a chess turn event.");
    if (state.gameOver || state.turn !== state.agentColor || state.legalMoves.length === 0)
      throw new Error("The virtual client cannot move in this position.");

    if (value.type === "opening") {
      if (
        state.moveHistory.length !== 0 ||
        state.learnerColor !== "b" ||
        Object.keys(value).some((key) => key !== "type")
      )
        throw new Error("An opening move is only valid when the learner chose Black.");
      return {
        activityId: "chess",
        requestId,
        actor: "platform",
        type: "opening",
        text: "The learner chose Black, so the virtual client is opening the game as White.",
        input: {},
      };
    }

    if (value.type === "learner_move") {
      if (
        !isRecord(value.input) ||
        Object.keys(value).some((key) => !["type", "input"].includes(key)) ||
        state.lastMoveColor !== state.learnerColor ||
        !state.lastMove
      )
        throw new Error("A learner move must be the most recent move on the board.");
      const move = parseChessMove(value.input.move);
      if (chessMoveId(move) !== chessMoveId(state.lastMove))
        throw new Error("The learner move does not match the current board history.");
      return {
        activityId: "chess",
        requestId,
        actor: "learner",
        type: "move",
        text: `The learner played ${chessMoveId(move)}. It is your turn to move.`,
        input: { move },
      };
    }

    throw new Error("Unsupported chess turn event.");
  },
};

export const chessActivity = defineActivity(definition);
