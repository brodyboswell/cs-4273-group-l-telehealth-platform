import { auth } from "@/lib/auth/server";
import { jsonError } from "@/lib/chat/http";
import { createPracticeSession } from "@/lib/chat/transcriptStore";
import { isRecord, MAX_SESSION_NAME_LENGTH } from "@/lib/chat/validation";
import { usesBrowserSessions } from "@/lib/chat/storageMode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await auth.getUser();
  if (!user) return jsonError(401, "Please log in to continue.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Request body must be JSON.");
  }
  if (
    !isRecord(body) ||
    typeof body.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.requestId,
    )
  )
    return jsonError(400, "A valid start request ID is required.");
  if (
    body.name !== undefined &&
    (typeof body.name !== "string" ||
      body.name.trim().length > MAX_SESSION_NAME_LENGTH)
  )
    return jsonError(
      400,
      `Session names must be ${MAX_SESSION_NAME_LENGTH} characters or fewer.`,
    );
  try {
    const transcript = await createPracticeSession(
      user.id,
      typeof body.name === "string" ? body.name.trim() : "",
      body.requestId,
    );
    return Response.json(
      {
        sessionId: transcript.sessionId,
        ...(usesBrowserSessions() ? { transcript } : {}),
      },
      {
        status: 201,
        headers: { "cache-control": "no-store" },
      },
    );
  } catch (error) {
    console.error("[sessions] could not start session:", error);
    return jsonError(500, "Could not start your session. Please try again.");
  }
}
