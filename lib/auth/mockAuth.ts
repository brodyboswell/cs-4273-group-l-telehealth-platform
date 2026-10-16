import type { LoginCredentials, LoginResult } from "./authTypes";

// Placeholder until a real auth backend exists: every attempt succeeds, and the
// credentials are intentionally neither inspected, logged, nor persisted.
export const signIn: (credentials: LoginCredentials) => Promise<LoginResult> =
  async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return { ok: true, redirectTo: "/practice" };
  };

export async function signOut(): Promise<{ redirectTo: string }> {
  return { redirectTo: "/login" };
}
