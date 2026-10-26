"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChessPiece } from "./ChessPiece";
import { Chess, type Square, type PieceSymbol } from "chess.js";
import {
  isChessToolInputForPosition,
  isMoveInLegalList,
  parseChessMove,
  type ChessColor,
  type ChessMove,
  type ChessPromotion,
} from "@/lib/chess/chessTypes";
import type { ActivityAction } from "@/lib/activities/types";
import {
  useActivityBridge,
  useActivityTools,
} from "@/components/session/ActivityBridge";

const FILES = "abcdefgh".split("");
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const NAMES: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

function getLegalChessMoves(game: Chess): ChessMove[] {
  return game.moves({ verbose: true }).map((move) => ({
    from: move.from,
    to: move.to,
    ...(move.promotion
      ? { promotion: move.promotion as ChessPromotion }
      : {}),
  }));
}

export function ChessBoard() {
  const activityBridge = useActivityBridge();
  const [position, setPosition] = useState(() => ({ game: new Chess() }));
  const { game } = position;
  const refreshPosition = useCallback(() => setPosition({ game }), [game]);
  const [learnerColor, setLearnerColor] = useState<ChessColor>("w");
  const agentColor: ChessColor = learnerColor === "w" ? "b" : "w";
  const [gameId, setGameId] = useState(() => crypto.randomUUID());
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [turnEpoch, setTurnEpoch] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const lastRequestKey = useRef<string | null>(null);
  const mounted = useRef(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<Square | null>(null);
  const [message, setMessage] = useState("");
  const drag = useRef<{
    from: Square;
    pointerId: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{
    x: number;
    y: number;
    type: PieceSymbol;
    color: "w" | "b";
  } | null>(null);
  const moves = useMemo(
    () =>
      selected ? position.game.moves({ square: selected, verbose: true }) : [],
    [position, selected],
  );
  const legalDestinations = useMemo(
    () => new Set(moves.map((move) => move.to)),
    [moves],
  );
  const { history, lastMove, turn, status, gameOver } = useMemo(() => {
    const { game } = position;
    const history = game.history({ verbose: true });
    const turn = game.turn() === "w" ? "White" : "Black";
    const status = game.isCheckmate()
      ? `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`
      : game.isStalemate()
        ? "Draw — stalemate"
        : game.isThreefoldRepetition()
          ? "Draw — threefold repetition"
          : game.isInsufficientMaterial()
            ? "Draw — insufficient material"
            : game.isDraw()
              ? "Draw — fifty-move rule"
              : `${turn} to move${game.isCheck() ? " — check" : ""}`;
    return {
      history: history.map((move) => move.san),
      lastMove: history.at(-1),
      turn,
      status,
      gameOver: game.isGameOver(),
    };
  }, [position]);
  const moveHistory = useMemo(
    () =>
      position.game.history({ verbose: true }).map((move) => ({
        from: move.from,
        to: move.to,
        ...(move.promotion
          ? { promotion: move.promotion as ChessPromotion }
          : {}),
      })),
    [position],
  );
  const activityState = useMemo(
    () => ({
      gameId,
      turnEpoch,
      fen: position.game.fen(),
      moveHistory,
      learnerColor,
    }),
    [gameId, learnerColor, moveHistory, position, turnEpoch],
  );

  const applyMove = useCallback(
    (to: Square, promotionPiece: ChessPromotion | undefined, from: Square) => {
      game.move({
        from,
        to,
        ...(promotionPiece ? { promotion: promotionPiece } : {}),
      });
      refreshPosition();
      setSelected(null);
      setPromotion(null);
      setMessage("");
    },
    [game, refreshPosition],
  );

  const commitMove = useCallback(
    (
      to: Square,
      promotionPiece?: ChessPromotion,
      from: Square | null = selected,
    ) => {
      if (!from) return;
      applyMove(to, promotionPiece, from);
      setAgentError(null);
      setTurnEpoch((epoch) => epoch + 1);
    },
    [applyMove, selected],
  );

  const handleActivityAction = useCallback(
    (action: ActivityAction) => {
      if (action.activityId !== "chess" || action.tool !== "play_chess_move")
        return;
      if (
        typeof action.input !== "object" ||
        action.input === null ||
        Array.isArray(action.input)
      )
        return;

      const input = action.input as Record<string, unknown>;
      if (
        !isChessToolInputForPosition(input, {
          gameId,
          turnEpoch,
          fen: game.fen(),
        })
      )
        return;

      let move: ChessMove;
      try {
        move = parseChessMove(input.move);
      } catch {
        setAgentError("The virtual client returned an invalid chess move.");
        return;
      }
      const movingPiece = game.get(move.from);
      if (
        game.turn() !== agentColor ||
        movingPiece?.color !== agentColor ||
        !isMoveInLegalList(move, getLegalChessMoves(game))
      ) {
        setAgentError("The virtual client’s move is no longer legal here.");
        return;
      }

      applyMove(move.to, move.promotion, move.from);
      setAgentError(null);
    },
    [agentColor, applyMove, game, gameId, turnEpoch],
  );

  useActivityTools("chess", activityState, handleActivityAction);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (gameOver || game.turn() !== agentColor || isAgentThinking) return;
    const requestId = `${gameId}-${turnEpoch}`;
    if (lastRequestKey.current === requestId) return;

    // Let the persistent chat register its turn handler before an opening move.
    const timer = window.setTimeout(() => {
      if (lastRequestKey.current === requestId) return;
      lastRequestKey.current = requestId;
      setIsAgentThinking(true);
      setAgentError(null);
      const latestMove = moveHistory.at(-1);
      const event =
        moveHistory.length === 0
          ? { type: "opening" }
          : { type: "learner_move", input: { move: latestMove } };

      void activityBridge
        .requestTurn({ requestId, event })
        .catch((requestError: unknown) => {
          if (!mounted.current) return;
          setAgentError(
            requestError instanceof Error
              ? requestError.message
              : "The virtual client could not choose a chess move.",
          );
        })
        .finally(() => {
          if (mounted.current) setIsAgentThinking(false);
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    activityBridge,
    agentColor,
    game,
    gameId,
    gameOver,
    isAgentThinking,
    moveHistory,
    retryVersion,
    turnEpoch,
  ]);

  function selectSquare(square: Square) {
    if (gameOver || promotion || isAgentThinking || game.turn() === agentColor)
      return;
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
      else
        setMessage(
          selected
            ? "Choose a highlighted square for a legal move."
            : `Select a ${turn.toLowerCase()} piece first.`,
        );
    }
  }

  function undo() {
    if (isAgentThinking) return;
    const moveHistory = game.history({ verbose: true });
    const lastMove = moveHistory.at(-1);
    if (!lastMove) return;

    // On the learner's turn, undo the client's reply and the learner's move together.
    const pliesToUndo = lastMove.color === agentColor ? 2 : 1;
    if (moveHistory.length < pliesToUndo) return;
    for (let index = 0; index < pliesToUndo; index += 1) game.undo();
    refreshPosition();
    setSelected(null);
    setPromotion(null);
    setMessage("");
    setAgentError(null);
    setTurnEpoch((epoch) => epoch + 1);
  }

  function startNewGame(nextLearnerColor = learnerColor) {
    if (isAgentThinking) return;
    setLearnerColor(nextLearnerColor);
    setGameId(crypto.randomUUID());
    game.reset();
    refreshPosition();
    setSelected(null);
    setPromotion(null);
    setMessage("");
    setAgentError(null);
    setTurnEpoch((epoch) => epoch + 1);
  }

  return (
    <div className="chess-layout h-full overflow-auto bg-cream">
      <div className="chess-playing-area flex items-start justify-center gap-2">
        <div
          className="flex w-4 flex-col justify-around text-xs text-charcoal/50"
          style={{ height: "var(--board-size)" }}
          aria-hidden="true"
        >
          {RANKS.map((rank) => (
            <span key={rank}>{rank}</span>
          ))}
        </div>
        <div>
          <div
            className="grid grid-cols-8 grid-rows-[repeat(8,minmax(0,1fr))] overflow-hidden rounded-panel border-2 border-charcoal"
            style={{ width: "var(--board-size)", height: "var(--board-size)" }}
            role="group"
            aria-label="Chessboard, white at bottom"
          >
            {RANKS.flatMap((rank, row) =>
              FILES.map((file, col) => {
                const square = `${file}${rank}` as Square;
                const piece = game.get(square);
                const legal = legalDestinations.has(square);
                const recent =
                  lastMove?.from === square || lastMove?.to === square;
                return (
                  <button
                    key={square}
                    type="button"
                    data-square={square}
                    onPointerDown={(event) => {
                      if (!event.isPrimary || event.button !== 0) return;
                      suppressClick.current = false;
                      if (
                        !piece ||
                        piece.color !== game.turn() ||
                        game.turn() === agentColor ||
                        isAgentThinking ||
                        promotion ||
                        gameOver
                      )
                        return;
                      suppressClick.current = false;
                      drag.current = {
                        from: square,
                        pointerId: event.pointerId,
                        x: event.clientX,
                        y: event.clientY,
                        moved: false,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      const current = drag.current;
                      if (
                        !current ||
                        current.pointerId !== event.pointerId ||
                        current.from !== square ||
                        !piece
                      )
                        return;
                      if (
                        Math.hypot(
                          event.clientX - current.x,
                          event.clientY - current.y,
                        ) > 5
                      )
                        current.moved = true;
                      if (current.moved) {
                        setSelected(square);
                        setDragPreview({
                          x: event.clientX,
                          y: event.clientY,
                          type: piece.type,
                          color: piece.color,
                        });
                      }
                    }}
                    onPointerUp={(event) => {
                      const current = drag.current;
                      if (current?.pointerId !== event.pointerId) return;
                      drag.current = null;
                      setDragPreview(null);
                      if (!current?.moved) return;
                      suppressClick.current = true;
                      const destination = document
                        .elementFromPoint(event.clientX, event.clientY)
                        ?.closest("[data-square]")
                        ?.getAttribute("data-square") as Square | null;
                      const legalMove = game
                        .moves({ square: current.from, verbose: true })
                        .find((move) => move.to === destination);
                      if (legalMove && destination) {
                        if (legalMove.promotion) {
                          setSelected(current.from);
                          setPromotion(destination);
                        } else commitMove(destination, undefined, current.from);
                      } else
                        setMessage(
                          "Choose a highlighted square for a legal move.",
                        );
                    }}
                    onPointerCancel={(event) => {
                      if (drag.current?.pointerId !== event.pointerId) return;
                      drag.current = null;
                      setDragPreview(null);
                      suppressClick.current = true;
                    }}
                    onClick={(event) => {
                      if (event.detail !== 0 && suppressClick.current) {
                        suppressClick.current = false;
                        return;
                      }
                      selectSquare(square);
                    }}
                    disabled={
                      !!promotion ||
                      gameOver ||
                      isAgentThinking ||
                      game.turn() === agentColor
                    }
                    aria-pressed={selected === square}
                    aria-label={`${square}, ${piece ? `${piece.color === "w" ? "white" : "black"} ${NAMES[piece.type]}` : "empty"}${legal ? ", legal destination" : ""}`}
                    className={`touch-none relative flex min-h-0 min-w-0 items-center justify-center cursor-pointer p-0 leading-none text-charcoal select-none focus-visible:z-10 focus-visible:outline focus-visible:outline-4 focus-visible:outline-terracotta ${
                      (row + col) % 2 === 0 ? "bg-cream" : "bg-sage"
                    } ${selected === square ? "ring-4 ring-inset ring-terracotta" : recent ? "ring-2 ring-inset ring-charcoal/30" : ""}`}
                  >
                    {piece && (
                      <ChessPiece type={piece.type} color={piece.color} />
                    )}
                    {legal && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute ${piece ? "inset-1 rounded-full border-4 border-terracotta" : "h-3 w-3 rounded-full bg-charcoal/40"}`}
                      />
                    )}
                  </button>
                );
              }),
            )}
          </div>
          <div
            className="mt-1 grid grid-cols-8 text-center text-xs text-charcoal/50"
            aria-hidden="true"
          >
            {FILES.map((file) => (
              <span key={file}>{file}</span>
            ))}
          </div>
        </div>
      </div>

      {dragPreview && (
        <span
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 h-20 w-20"
          style={{ left: dragPreview.x, top: dragPreview.y }}
        >
          <ChessPiece type={dragPreview.type} color={dragPreview.color} />
        </span>
      )}
      <aside className="chess-controls rounded-panel border border-charcoal/15 bg-white p-5">
        <label className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-charcoal">
          <span>You play as</span>
          <select
            value={learnerColor}
            disabled={isAgentThinking}
            onChange={(event) =>
              startNewGame(event.currentTarget.value as ChessColor)
            }
            className="rounded border border-charcoal/30 bg-white px-3 py-2 disabled:opacity-50"
          >
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </label>
        <div
          role="status"
          className="rounded-panel bg-sage px-4 py-3 text-center text-sm font-medium text-white"
        >
          {status}
        </div>
        <p aria-live="polite" className="mt-2 text-xs text-charcoal/70">
          {message}
        </p>
        {isAgentThinking && (
          <p className="mt-2 text-sm text-charcoal/70" role="status">
            The virtual client is choosing a move…
          </p>
        )}
        {agentError && (
          <div
            className="mt-3 rounded-panel border border-terracotta/30 bg-terracotta/10 px-3 py-2 text-sm text-charcoal"
            role="alert"
          >
            <p>{agentError}</p>
            <button
              type="button"
              onClick={() => {
                setAgentError(null);
                lastRequestKey.current = null;
                setRetryVersion((version) => version + 1);
              }}
              disabled={isAgentThinking}
              className="mt-2 font-semibold underline disabled:opacity-50"
            >
              Try client move again
            </button>
          </div>
        )}
        {promotion && (
          <fieldset className="mt-3">
            <legend className="text-sm font-medium">Promote pawn to</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["q", "r", "b", "n"] as const).map((piece) => (
                <button
                  key={piece}
                  type="button"
                  onClick={() => commitMove(promotion, piece)}
                  className="rounded border border-charcoal/30 px-2 py-1 text-sm capitalize"
                >
                  {NAMES[piece]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPromotion(null)}
                className="text-sm underline"
              >
                Cancel
              </button>
            </div>
          </fieldset>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={undo}
            disabled={
              !history.length ||
              (history.length === 1 && lastMove?.color === agentColor) ||
              !!promotion ||
              isAgentThinking
            }
            className="rounded-panel border border-charcoal/30 px-3 py-2 text-sm disabled:opacity-40"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => startNewGame()}
            disabled={isAgentThinking}
            className="rounded-panel border border-charcoal/30 px-3 py-2 text-sm"
          >
            New game
          </button>
        </div>
        {history.length > 0 && (
          <h3 className="mt-4 text-sm font-semibold">Moves</h3>
        )}
        <ol
          className="mt-1 max-h-24 overflow-auto text-xs text-charcoal/70"
          aria-label="Move history"
        >
          {history
            .filter((_, index) => index % 2 === 0)
            .map((move, index) => (
              <li key={index}>
                {index + 1}. {move} {history[index * 2 + 1] ?? ""}
              </li>
            ))}
        </ol>
      </aside>
    </div>
  );
}
