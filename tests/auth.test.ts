import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { GET as confirmSignup } from "../app/auth/callback/route";
import { auth } from "../lib/auth/server";
import { signUp } from "../lib/auth/supabaseAuth";
import { createBrowserClient } from "@supabase/ssr";

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
});

describe("authentication middleware", () => {
  it("blocks protected pages and APIs when Supabase is unconfigured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const page = await middleware(new NextRequest("http://localhost/practice/whiteboard"));
    assert.equal(page.status, 307);
    assert.equal(page.headers.get("location"), "http://localhost/login");
    const api = await middleware(new NextRequest("http://localhost/api/chat"));
    assert.equal(api.status, 503);
    assert.match(api.headers.get("cache-control") ?? "", /no-store/);
    const login = await middleware(new NextRequest("http://localhost/login"));
    assert.equal(login.status, 200);
    const signup = await middleware(new NextRequest("http://localhost/signup"));
    assert.equal(signup.status, 200);
  });

  it("rejects missing sessions without making a network request", async (context) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    context.mock.method(globalThis, "fetch", () => {
      throw new Error("Unexpected network request");
    });
    const api = await middleware(new NextRequest("http://localhost/api/transcripts"));
    assert.equal(api.status, 401);
    const page = await middleware(new NextRequest("http://localhost/practice"));
    assert.equal(page.headers.get("location"), "http://localhost/login");
    const login = await middleware(new NextRequest("http://localhost/login"));
    assert.equal(login.status, 200);
    assert.match(login.headers.get("cache-control") ?? "", /no-store/);
    const signup = await middleware(new NextRequest("http://localhost/signup"));
    assert.equal(signup.status, 200);
  });
});

describe("account creation", () => {
  function testClient() {
    return createBrowserClient("https://test.supabase.co", "test-publishable-key", {
      isSingleton: false,
      cookies: { getAll: () => [], setAll: () => {} },
    });
  }

  it("requests confirmation with a PKCE callback and grants no access before confirmation", async (context) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    const user = { id: "signup-user", email: "learner@example.com", identities: [] };
    context.mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
      const url = new URL(input);
      assert.equal(url.pathname, "/auth/v1/signup");
      assert.equal(url.searchParams.get("redirect_to"), "http://localhost:3000/auth/callback");
      const body = JSON.parse(String(init.body));
      assert.equal(body.email, user.email);
      assert.equal(typeof body.code_challenge, "string");
      return Response.json(user);
    });
    const result = await signUp({ email: user.email, password: "test-password-only" }, "http://localhost:3000", testClient());
    assert.deepEqual(result, { ok: true, confirmationRequired: true });
  });

  it("shows actionable errors when signup is disabled or email is rate limited", async (context) => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    let code = "signup_disabled";
    context.mock.method(globalThis, "fetch", async () => Response.json(
      { code, msg: "Do not expose raw server details" },
      { status: 422, headers: { "x-supabase-api-version": "2024-01-01" } },
    ));
    const credentials = { email: "learner@example.com", password: "test-password-only" };
    const disabled = await signUp(credentials, "http://localhost:3000", testClient());
    assert.equal(disabled.ok, false);
    assert.match("message" in disabled ? disabled.message : "", /disabled/);
    code = "over_email_send_rate_limit";
    const limited = await signUp(credentials, "http://localhost:3000", testClient());
    assert.equal(limited.ok, false);
    assert.match("message" in limited ? limited.message : "", /wait/);
  });
});

describe("signup confirmation callback", () => {
  it("exchanges a valid code and redirects only to practice", async (context) => {
    const exchange = context.mock.method(auth, "exchangeCodeForSession", async (code: string) => {
      assert.equal(code, "valid-test-code");
      return true;
    });
    const response = await confirmSignup(new NextRequest("http://localhost/auth/callback?code=valid-test-code&next=https://example.org"));
    assert.equal(exchange.mock.callCount(), 1);
    assert.equal(response.headers.get("location"), "http://localhost/practice");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });

  it("sends missing, expired, or failed codes to the login error state", async (context) => {
    const exchange = context.mock.method(auth, "exchangeCodeForSession", async () => false);
    const missing = await confirmSignup(new NextRequest("http://localhost/auth/callback"));
    assert.equal(exchange.mock.callCount(), 0);
    const expired = await confirmSignup(new NextRequest("http://localhost/auth/callback?code=expired"));
    exchange.mock.mockImplementation(async () => { throw new Error("Network failure"); });
    const failed = await confirmSignup(new NextRequest("http://localhost/auth/callback?code=failed"));
    for (const response of [missing, expired, failed]) {
      assert.equal(response.headers.get("location"), "http://localhost/login?confirmation=failed");
    }
  });
});
