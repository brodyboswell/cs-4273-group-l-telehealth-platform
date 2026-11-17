import { createClient } from "../supabase/server";

export const auth = {
  async exchangeCodeForSession(code: string): Promise<boolean> {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  },
  async getUser(): Promise<{ id: string } | null> {
    const supabase = await createClient();
    // Validate with Supabase rather than trusting a user object from cookies.
    const { data, error } = await supabase.auth.getUser();
    return error ? null : data.user;
  },
};
