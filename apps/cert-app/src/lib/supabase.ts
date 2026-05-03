import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function signInWithPassword(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  // If auto-confirm is off, signUp won't return a session — user must verify email first
  if (!data.session) {
    throw new Error("Check your email to confirm your account before signing in.");
  }
  // When auto-confirm is on, signUp already establishes a session (picked up by onAuthStateChange)
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export type User = Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"];
