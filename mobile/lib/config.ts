import AsyncStorage from "@react-native-async-storage/async-storage";
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
  ? createClient(url, anon, {
      auth: {
        // Keep the session on the phone so users stay signed in after a restart.
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        // No browser URL in React Native to parse a session from.
        detectSessionInUrl: false,
      },
    })
  : null;

export const DEFAULT_SHUTTLE_ID = "shuttle-1";
