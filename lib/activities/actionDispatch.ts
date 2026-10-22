import type { ActivityAction } from "./types";

export interface ActivityActionTarget {
  activityId: string;
  onAction(action: ActivityAction): void;
}

/** Applies captured actions only while their original activity instance is active. */
export function dispatchActivityActions(
  current: ActivityActionTarget | null,
  captured: ActivityActionTarget | null,
  actions: readonly ActivityAction[],
): void {
  if (!captured || current !== captured) return;

  for (const action of actions) {
    if (action.activityId === captured.activityId) captured.onAction(action);
  }
}
