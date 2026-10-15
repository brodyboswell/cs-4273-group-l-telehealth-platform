"use client";

import { useRef, useState, useTransition, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import Image, { getImageProps } from "next/image";
import { useRoomState } from "@/components/session/RoomState";

const ACTIVITIES = [
  { id: "whiteboard", label: "Whiteboard", x: 6, y: 25, width: 21, height: 63 },
  { id: "feelings", label: "Feelings", x: 50, y: 8, width: 19, height: 28 },
  { id: "chess", label: "Chess", x: 60, y: 71, width: 21, height: 12 },
] as const;

type Position = { x: number; y: number };
type Activity = (typeof ACTIVITIES)[number];
type RoomDrag = Position & {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

// View boxes exclude transparent padding without modifying the source assets.
const KEY_OFFSETS: Record<string, Position> = {
  ArrowLeft: { x: -2, y: 0 },
  ArrowRight: { x: 2, y: 0 },
  ArrowUp: { x: 0, y: -2 },
  ArrowDown: { x: 0, y: 2 },
};

const ART_BOUNDS = {
  whiteboard: { width: 1024, height: 1536, viewBox: "97 86 867 1384" },
  feelings: { width: 1505, height: 1045, viewBox: "245 166 1015 709" },
  chess: { width: 1774, height: 887, viewBox: "191 147 1505 717" },
};

function ActivityArt({ id }: { id: Activity["id"] }) {
  const art = ART_BOUNDS[id];
  const { props } = getImageProps({
    src: `/room-${id}.png`,
    alt: "",
    width: 512,
    height: Math.round((512 * art.height) / art.width),
  });
  return (
    <svg
      viewBox={art.viewBox}
      className="pointer-events-none h-full w-full transition-[filter] group-hover:brightness-105"
      aria-hidden="true"
    >
      <image href={props.src} width={art.width} height={art.height} />
    </svg>
  );
}

function boundedPosition(activity: Activity, x: number, y: number): Position {
  return {
    x: Math.max(0, Math.min(100 - activity.width, x)),
    y: Math.max(0, Math.min(100 - activity.height, y)),
  };
}

export function WelcomeRoom() {
  const router = useRouter();
  const [isOpening, startOpening] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);
  const room = useRef<HTMLDivElement>(null);
  const { positions, setPositions } = useRoomState();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const drag = useRef<RoomDrag | null>(null);
  const suppressClick = useRef(false);


  function moveActivity(
    event: PointerEvent<HTMLButtonElement>,
    activity: Activity,
  ) {
    const current = drag.current;
    if (
      !current ||
      current.id !== activity.id ||
      current.pointerId !== event.pointerId ||
      !room.current
    )
      return;
    const bounds = room.current.getBoundingClientRect();
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    // Allow small hand movements during a click without treating it as a drag.
    if (Math.hypot(dx, dy) > 10) current.moved = true;
    if (!current.moved) return;
    setDraggingId(activity.id);
    setPositions((previous) => ({
      ...previous,
      [activity.id]: boundedPosition(
        activity,
        current.x + (dx / bounds.width) * 100,
        current.y + (dy / bounds.height) * 100,
      ),
    }));
  }

  function finishDrag(cancelled = false) {
    suppressClick.current = cancelled || (drag.current?.moved ?? false);
    drag.current = null;
    setDraggingId(null);
  }

  return (
    <div
      className="room-container flex h-full w-full items-center justify-center overflow-hidden bg-[#eae5da] select-none"
      onDragStart={(event) => event.preventDefault()}
    >
      <div ref={room} className="room-stage relative shrink-0">
        {/* The background has no activity objects, so moving one leaves no duplicate. */}
        <Image
          src="/room-background.png"
          alt="A warm practice room with a sofa, bookshelf, and sunlit window"
          fill
          priority
          sizes="(max-width: 640px) calc(100vw - 80px), calc(100vw - 180px)"
          className="pointer-events-none object-cover"
        />
        {ACTIVITIES.map((activity) => {
          const position = positions[activity.id] ?? activity;
          return (
            <button
              key={activity.id}
              type="button"
              aria-label={`Open ${activity.label}`}
              title={activity.label}
              aria-busy={isOpening && openingId === activity.id}
              onPointerEnter={() => router.prefetch(`/practice/${activity.id}`)}
              onFocus={() => router.prefetch(`/practice/${activity.id}`)}
              className={`group absolute touch-none rounded-lg focus-visible:outline focus-visible:outline-4 focus-visible:outline-sage ${draggingId === activity.id ? "z-20 cursor-grabbing" : "cursor-pointer"}`}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${activity.width}%`,
                height: `${activity.height}%`,
              }}
              onPointerDown={(event) => {
                if (!event.isPrimary || event.button !== 0 || drag.current)
                  return;
                suppressClick.current = false;
                drag.current = {
                  id: activity.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  x: position.x,
                  y: position.y,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => moveActivity(event, activity)}
              onPointerUp={(event) => {
                if (drag.current?.pointerId === event.pointerId) finishDrag();
              }}
              onPointerCancel={(event) => {
                if (drag.current?.pointerId === event.pointerId)
                  finishDrag(true);
              }}
              onClick={(event) => {
                if (event.detail !== 0 && suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (isOpening) return;
                setOpeningId(activity.id);
                startOpening(() => router.push(`/practice/${activity.id}`));
              }}
              onKeyDown={(event) => {
                const offset = KEY_OFFSETS[event.key];
                if (!offset) return;
                event.preventDefault();
                setPositions((previous) => ({
                  ...previous,
                  [activity.id]: boundedPosition(
                    activity,
                    position.x + offset.x,
                    position.y + offset.y,
                  ),
                }));
              }}
            >
              <ActivityArt id={activity.id} />
              <span className={`pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full border border-charcoal/20 bg-white/95 px-3 py-1 text-sm font-medium text-charcoal shadow-sm transition-opacity ${isOpening && openingId === activity.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
                {isOpening && openingId === activity.id ? "Opening…" : activity.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
