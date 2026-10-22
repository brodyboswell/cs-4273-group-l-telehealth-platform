/**
 * Shared types for the learner <-> virtual-client chat and its transcript.
 *
 * Vocabulary (matches AGENTS.md):
 * - "learner"        = the social-work student typing in the chat (the human).
 * - "virtual_client" = the simulated patient ("Alex") whose replies come from the LLM.
 * - "system"         = events the platform records itself (session start, errors).
 */
import type {
  ActivityAvailabilityNotice,
  ActivityAction,
  ActivitySnapshot,
} from "@/lib/activities/types";

export type Speaker = "learner" | "virtual_client" | "system";

export interface TranscriptEntry {
  /** 1-based position in the session; guarantees a stable order for replay and grading. */
  seq: number;
  speaker: Speaker;
  text: string;
  /** ISO-8601 timestamp (UTC) of when the server recorded the entry. */
  timestamp: string;
  /** For virtual_client entries: how long the model took to answer, in ms. */
  latencyMs?: number;
  /** For virtual_client entries: which provider/model produced the reply. */
  model?: string;
  /** Validated activity state accompanying a learner message. */
  activity?: ActivitySnapshot | null;
  /** Validated activity actions returned by the virtual client. */
  actions?: ActivityAction[];
  /** Metadata for a platform-generated, client-visible activity notice. */
  activityNotice?: ActivityAvailabilityNotice;
}

export interface Transcript {
  sessionId: string;
  personaId: string;
  personaName: string;
  createdAt: string;
  updatedAt: string;
  entries: TranscriptEntry[];
}

/** One turn of conversation history as sent to the LLM provider. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Body of POST /api/chat */
export interface ChatRequestBody {
  sessionId: string;
  message: string;
  activity?: ActivitySnapshot;
}

/** Successful response of POST /api/chat */
export interface ChatResponseBody {
  reply: TranscriptEntry;
  learnerEntry: TranscriptEntry;
  transcript: Transcript;
}
