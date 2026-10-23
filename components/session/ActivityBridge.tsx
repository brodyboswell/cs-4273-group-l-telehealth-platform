"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { ActivityAction, ActivitySnapshot } from "@/lib/activities/types";
import {
  dispatchActivityActions,
  type ActivityActionTarget,
} from "@/lib/activities/actionDispatch";

interface ActivityRegistration extends ActivityActionTarget {
  state: unknown;
}

interface ActivityBridgeController {
  register(registration: ActivityRegistration): () => void;
  capture(): ActivityBridgeCapture;
}

export interface ActivityBridgeCapture {
  snapshot: ActivitySnapshot | null;
  dispatch(actions: readonly ActivityAction[]): void;
}

export interface ActivityBridge {
  capture(): ActivityBridgeCapture;
}

const ActivityBridgeContext = createContext<ActivityBridgeController | null>(null);

export function ActivityBridgeProvider({ children }: { children: ReactNode }) {
  const active = useRef<ActivityRegistration | null>(null);

  const register = useCallback((registration: ActivityRegistration) => {
    active.current = registration;
    return () => {
      if (active.current === registration) active.current = null;
    };
  }, []);

  const capture = useCallback((): ActivityBridgeCapture => {
    const registration = active.current;
    return {
      snapshot: registration
        ? { activityId: registration.activityId, state: registration.state }
        : null,
      dispatch(actions) {
        dispatchActivityActions(active.current, registration, actions);
      },
    };
  }, []);

  const controller = useMemo(() => ({ register, capture }), [capture, register]);

  return (
    <ActivityBridgeContext.Provider value={controller}>
      {children}
    </ActivityBridgeContext.Provider>
  );
}

export function useActivityTools(
  activityId: string,
  state: unknown,
  onAction: (action: ActivityAction) => void,
): void {
  const bridge = useActivityBridgeController();
  const registration = useRef<ActivityRegistration | null>(null);

  if (registration.current === null)
    registration.current = { activityId, state, onAction };

  useEffect(() => {
    const current = registration.current;
    if (!current) return;

    current.activityId = activityId;
    current.state = state;
    current.onAction = onAction;
  }, [activityId, onAction, state]);

  useEffect(() => {
    const current = registration.current;
    return current ? bridge.register(current) : undefined;
  }, [bridge]);
}

export function useActivityBridge(): ActivityBridge {
  const { capture } = useActivityBridgeController();
  return { capture };
}

function useActivityBridgeController(): ActivityBridgeController {
  const bridge = useContext(ActivityBridgeContext);
  if (!bridge)
    throw new Error("Activity tools require the session activity bridge.");
  return bridge;
}
