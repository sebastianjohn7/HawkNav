import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./config";
import { UHCL_DOMAIN, UHCL_ONLY_SIGNUP, type Role } from "./roles";

export type { Role };

type AuthState = {
  session: Session | null;
  /** Browsing without an account; treated as the visitor role, no session. */
  guest: boolean;
  enterGuest: () => void;
  /** Null while signed out or while the profile is still loading. Guests are "visitor". */
  role: Role | null;
  /** True until the saved session (if any) has been checked on startup. */
  loading: boolean;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string, remember: boolean) => Promise<string | null>;
  /** Returns an error message, or null on success. */
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const REMEMBER_KEY = "hawknav_remember_me";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileRole, setRole] = useState<Role | null>(null);
  const [guest, setGuest] = useState(false);
  const [loading, setLoading] = useState(true);
  const role: Role | null = guest ? "visitor" : profileRole;

  // Restore the saved session, then follow sign-in / sign-out changes.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const client = supabase;

    (async () => {
      const { data } = await client.auth.getSession();
      // "Remember Me" off means the session should not outlive the app.
      const remember = await AsyncStorage.getItem(REMEMBER_KEY);
      if (data.session && remember === "0") {
        await client.auth.signOut();
        setSession(null);
      } else {
        setSession(data.session);
      }
      setLoading(false);
    })();

    const { data: sub } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // The role lives in profiles (set by the signup trigger), not in the app.
  useEffect(() => {
    if (!supabase || !session) {
      setRole(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        // No profile row should not happen; fall back to the least access.
        if (!cancelled) setRole((data?.role as Role | undefined) ?? "visitor");
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function signIn(email: string, password: string, remember: boolean) {
    if (!supabase) return "Missing Supabase keys — see README";
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return error.message;

    await AsyncStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    // FR-1: record login activity. A failed log must not block the login.
    await supabase.from("login_log").insert({ user_id: data.user.id });
    return null;
  }

  async function signUp(email: string, password: string) {
    if (!supabase) return "Missing Supabase keys — see README";
    if (UHCL_ONLY_SIGNUP && !email.trim().toLowerCase().endsWith(UHCL_DOMAIN)) {
      return `Use your ${UHCL_DOMAIN} email to create an account.`;
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return error.message;
    // With email confirmation on, there is no session until the link is clicked.
    if (!data.session) return "Check your email to confirm your account, then sign in.";

    // Without confirmation, signing up also signs the user in, so log it like a login.
    await AsyncStorage.setItem(REMEMBER_KEY, "1");
    await supabase.from("login_log").insert({ user_id: data.session.user.id });
    return null;
  }

  async function signOut() {
    setGuest(false);
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        guest,
        enterGuest: () => setGuest(true),
        role,
        loading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

