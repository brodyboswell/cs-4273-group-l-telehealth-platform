import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "./lib/supabase/config";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const isAuthPage = request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup";
  const noStore = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store");
    return result;
  };

  // Keep the login screen usable while a developer supplies project settings.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    if (isAuthPage) return noStore(response);
    return noStore(isApi
      ? NextResponse.json({ error: "Authentication is not configured." }, { status: 503 })
      : NextResponse.redirect(new URL("/login", request.url)));
  }

  const { url, key } = getSupabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if ((error || !data.user) && !isAuthPage) {
    const denied = isApi
      ? NextResponse.json({ error: "Please log in to continue." }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => denied.cookies.set(cookie));
    return noStore(denied);
  }
  return noStore(response);
}

export const config = {
  matcher: ["/login", "/signup", "/practice/:path*", "/api/:path*"],
};
