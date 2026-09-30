import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const apiUrl = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787"
).replace(/\/$/, "");

export const hasSupabaseConfig =
  Boolean(url) &&
  Boolean(anon) &&
  !url.includes("YOUR_PROJECT") &&
  anon !== "your-anon-key";

export const supabase: SupabaseClient | null = hasSupabaseConfig
  ? createClient(url, anon)
  : null;

export const DEFAULT_SHUTTLE_ID = "shuttle-1";
