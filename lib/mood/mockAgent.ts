import type { MoodAgentAction } from "./moodTypes";

const MOCK_RESPONSE: MoodAgentAction = {
  type: "select_mood",
  moodId: "worried",
  rationale: "AI Bot is feeling worried because something has been weighing on them today.",
};

export async function requestMockAgentMood(): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return MOCK_RESPONSE;
}
