import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  let confirmed = false;
  if (code) {
    try {
      confirmed = await auth.exchangeCodeForSession(code);
    } catch {
      // Expired links or missing verifier cookies must not grant access.
    }
  }
  const response = NextResponse.redirect(new URL(
    confirmed ? "/practice" : "/login?confirmation=failed",
    request.nextUrl.origin,
  ));
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
