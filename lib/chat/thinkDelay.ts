export const MIN_CLIENT_TURN_THINK_MS = 400;

export function remainingThinkTime(
  startedAt: number,
  now: number,
  minimumMs = MIN_CLIENT_TURN_THINK_MS,
): number {
  return Math.max(0, minimumMs - (now - startedAt));
}

export function waitForMinimumThinkTime(
  startedAt: number,
  minimumMs = MIN_CLIENT_TURN_THINK_MS,
): Promise<void> {
  return new Promise((resolve) => {
    const waitForRemainingTime = () => {
      const remaining = remainingThinkTime(
        startedAt,
        performance.now(),
        minimumMs,
      );
      if (remaining === 0) {
        resolve();
        return;
      }

      // Recheck after waking because browser timers and performance clocks can
      // round at different boundaries and otherwise resolve fractionally early.
      setTimeout(waitForRemainingTime, remaining + 1);
    };
    waitForRemainingTime();
  });
}
