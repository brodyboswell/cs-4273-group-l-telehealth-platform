import type { TranscriptEntry } from "../chat/types";
import { RISK_CUES, type RiskCue } from "./rubric";

/**
 * Deterministic part of the "risk response" critical item: find where the
 * virtual client said one of the scripted risk cue lines, and collect the
 * learner turns that followed so the LLM grader can judge the response.
 *
 * PRELIMINARY: matching is intentionally simple (see normalizeForMatch).
 */

/** How many learner turns after a cue count as "the response". */
export const DEFAULT_FOLLOW_UP_TURNS = 2;

export interface CueOccurrence {
  cueId: RiskCue["id"];
  /** seq of the virtual_client entry that contained the cue. */
  seq: number;
  /** The next learner entries after the cue, in order (may be fewer than requested). */
  followUps: TranscriptEntry[];
}

export interface DetectOptions {
  /** Defaults to DEFAULT_FOLLOW_UP_TURNS. */
  followUpTurns?: number;
  /** Defaults to the rubric's RISK_CUES. */
  cues?: RiskCue[];
}

/**
 * Lowercase, drop punctuation, and collapse whitespace so small differences
 * in quotes, ellipses, or spacing do not hide a cue the model actually said.
 */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns every cue occurrence in the transcript, in order. Only
 * virtual_client entries are checked, so a learner quoting a cue line (or a
 * system message) is never counted. A cue embedded in a longer reply still
 * matches.
 */
export function detectRiskCues(
  entries: TranscriptEntry[],
  options: DetectOptions = {},
): CueOccurrence[] {
  const followUpTurns = options.followUpTurns ?? DEFAULT_FOLLOW_UP_TURNS;
  const cues = options.cues ?? RISK_CUES;
  const normalizedCues = cues.map((cue) => ({
    cue,
    needle: normalizeForMatch(cue.text),
  }));

  const occurrences: CueOccurrence[] = [];

  entries.forEach((entry, index) => {
    if (entry.speaker !== "virtual_client") return;
    const haystack = normalizeForMatch(entry.text);

    for (const { cue, needle } of normalizedCues) {
      if (needle.length === 0 || !haystack.includes(needle)) continue;

      const followUps = entries
        .slice(index + 1)
        .filter((later) => later.speaker === "learner")
        .slice(0, followUpTurns);

      occurrences.push({ cueId: cue.id, seq: entry.seq, followUps });
    }
  });

  return occurrences;
}