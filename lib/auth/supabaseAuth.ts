import { createClient } from "../supabase/client";
import type { LoginCredentials, LoginResult, SignupResult } from "./authTypes";

export async function signUp(
  credentials: LoginCredentials,
  origin: string,
  supabase = createClient(),
): Promise<SignupResult> {
  const { data, error } = await supabase.auth.signUp({
    ...credentials,
    options: { emailRedirectTo: new URL("/auth/callback", origin).toString() },
  });
  if (error) {
    if (error.code === "weak_password")
      return { ok: false, message: "Choose a stronger password with at least 8 characters." };
    if (error.code === "over_email_send_rate_limit" || error.status === 429)
      return { ok: false, message: "Too many signup attempts. Please wait a few minutes and try again." };
    if (error.code === "signup_disabled")
      return { ok: false, message: "Account creation is currently disabled. Please contact your instructor." };
    return { ok: false, message: "Could not create an account. Check your details, or log in if you already have an account." };
  }
  // With confirmation enabled, signup creates a user but grants no session.
  return data.session
    ? { ok: true, redirectTo: "/sessions/new" }
    : { ok: true, confirmationRequired: true };
}

export async function signIn(credentials: LoginCredentials): Promise<LoginResult> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials);
  if (error) {
    return { ok: false, message: "Sign-in failed. Check your email and password and make sure your email is confirmed." };
  }
  return { ok: true, redirectTo: "/sessions/new" };
}

export async function signOut(): Promise<{ redirectTo: string }> {
  const { error } = await createClient().auth.signOut();
  if (error) throw error;
  return { redirectTo: "/login" };
}
