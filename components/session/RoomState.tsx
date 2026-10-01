"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

type RoomPositions = Record<string, { x: number; y: number }>;
type RoomState = {
  positions: RoomPositions;
  setPositions: Dispatch<SetStateAction<RoomPositions>>;
};

const RoomContext = createContext<RoomState | null>(null);

export function RoomStateProvider({ children }: { children: React.ReactNode }) {
  // The shared practice layout stays mounted while activity routes change.
  const [positions, setPositions] = useState<RoomPositions>({});
  return (
    <RoomContext.Provider value={{ positions, setPositions }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoomState() {
  const state = useContext(RoomContext);
  if (!state)
    throw new Error("Room state requires the practice session layout.");
  return state;
}
