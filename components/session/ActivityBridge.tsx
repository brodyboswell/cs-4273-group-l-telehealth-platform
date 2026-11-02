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
  registerTurnRequester(requester: ActivityTurnRequester): () => void;
  capture(): ActivityBridgeCapture;
  requestTurn(request: ActivityTurnTrigger): Promise<void>;
}

export interface ActivityBridgeCapture {
  snapshot: ActivitySnapshot | null;
  dispatch(actions: readonly ActivityAction[]): void;
}

export interface ActivityBridge {
  capture(): ActivityBridgeCapture;
  registerTurnRequester(requester: ActivityTurnRequester): () => void;
  requestTurn(request: ActivityTurnTrigger): Promise<void>;
}

export interface ActivityTurnTrigger {
  requestId: string;
  event: unknown;
}

export interface ActivityTurnDispatchRequest extends ActivityTurnTrigger {
  snapshot: ActivitySnapshot;
  dispatch(actions: readonly ActivityAction[]): void;
}

export type ActivityTurnRequester = (
  request: ActivityTurnDispatchRequest,
) => Promise<void>;

const ActivityBridgeContext = createContext<ActivityBridgeController | null>(null);

export function ActivityBridgeProvider({ children }: { children: ReactNode }) {
  const active = useRef<ActivityRegistration | null>(null);
  const turnRequester = useRef<ActivityTurnRequester | null>(null);

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

  const registerTurnRequester = useCallback(
    (requester: ActivityTurnRequester) => {
      turnRequester.current = requester;
      return () => {
        if (turnRequester.current === requester) turnRequester.current = null;
      };
    },
    [],
  );

  const requestTurn = useCallback(async (request: ActivityTurnTrigger) => {
    const registration = active.current;
    const requester = turnRequester.current;
    if (!registration)
      throw new Error("There is no active activity for the client turn.");
    if (!requester)
      throw new Error("The session chat is not ready to request a client turn.");

    await requester({
      ...request,
      snapshot: {
        activityId: registration.activityId,
        state: registration.state,
      },
      dispatch(actions) {
        dispatchActivityActions(active.current, registration, actions);
      },
    });
  }, []);

  const controller = useMemo(
    () => ({ register, registerTurnRequester, capture, requestTurn }),
    [capture, register, registerTurnRequester, requestTurn],
  );

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
  const { capture, registerTurnRequester, requestTurn } =
    useActivityBridgeController();
  return useMemo(
    () => ({ capture, registerTurnRequester, requestTurn }),
    [capture, registerTurnRequester, requestTurn],
  );
}

function useActivityBridgeController(): ActivityBridgeController {
  const bridge = useContext(ActivityBridgeContext);
  if (!bridge)
    throw new Error("Activity tools require the session activity bridge.");
  return bridge;
}
