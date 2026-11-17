/** Hosted prototype sessions stay in the browser until database storage lands. */
export function usesBrowserSessions(): boolean {
  return (
    process.env.PRACTICE_STORAGE === "browser" ||
    (process.env.VERCEL === "1" && process.env.PRACTICE_STORAGE !== "file")
  );
}
