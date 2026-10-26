import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type { ExcalidrawFreeDrawElement } from "@excalidraw/excalidraw/element/types";
import {
  WHITEBOARD_DOODLE_COLORS,
  type WhiteboardDoodle,
} from "./doodle";

const DOODLE_WIDTH = 600;
const DOODLE_HEIGHT = 400;

/** Maps normalized strokes into an Excalidraw scene centered around the origin. */
export function toExcalidrawDoodleSkeletons(
  doodle: WhiteboardDoodle,
): ExcalidrawElementSkeleton[] {
  const elements: ExcalidrawElementSkeleton[] = doodle.strokes.map(
    (stroke, index) => {
      const worldPoints = stroke.points.map(({ x, y }) => ({
        x: -DOODLE_WIDTH / 2 + (x / 100) * DOODLE_WIDTH,
        y: -DOODLE_HEIGHT / 2 + (y / 100) * DOODLE_HEIGHT,
      }));
      const minX = Math.min(...worldPoints.map(({ x }) => x));
      const minY = Math.min(...worldPoints.map(({ y }) => y));
      const maxX = Math.max(...worldPoints.map(({ x }) => x));
      const maxY = Math.max(...worldPoints.map(({ y }) => y));
      const points = worldPoints.map(
        ({ x, y }) =>
          [x - minX, y - minY] as ExcalidrawFreeDrawElement["points"][number],
      );

      return {
        id: `client-doodle-${index}`,
        type: "freedraw",
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        strokeColor: stroke.color ?? WHITEBOARD_DOODLE_COLORS[0].value,
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 2,
        strokeStyle: "solid",
        roundness: null,
        roughness: 1,
        opacity: 100,
        angle: 0 as ExcalidrawFreeDrawElement["angle"],
        seed: index + 1,
        version: 1,
        versionNonce: index + 1,
        index: null,
        isDeleted: false,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        points,
        pressures: [],
        simulatePressure: true,
        lastCommittedPoint: null,
      } satisfies ExcalidrawFreeDrawElement;
    },
  );

  if (doodle.caption) {
    elements.push({
      type: "text",
      x: -DOODLE_WIDTH / 2,
      y: DOODLE_HEIGHT / 2 + 32,
      text: doodle.caption,
    });
  }

  return elements;
}
