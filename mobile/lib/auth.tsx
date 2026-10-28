import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthError, Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./config";
import { unmetRules } from "./password";
import { UHCL_DOMAIN, UHCL_ONLY_SIGNUP, type Role } from "./roles";

export type { Role };

/** error: why the account wasn't created. notice: created, but needs an email confirmation. */
export type SignUpResult = { error?: string; notice?: string };

/** Plain-English reason for a failed sign-up, from Supabase's error code. */
function signUpErrorText(error: AuthError): string {
  switch (error.code) {
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return `The server rejected this password. ${error.message}`;
    case "email_address_invalid":
      return "That email address isn't valid. Check it for typos.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts right now. Wait a few minutes and try again.";
    case "signup_disabled":
      return "Creating accounts is turned off for this project.";
    case "unexpected_failure":
      // Our signup trigger rejects non-UHCL emails, which Supabase reports like this.
      return `The account couldn't be saved. Only ${UHCL_DOMAIN} emails can create an account.`;
  }
  if (/network/i.test(error.message)) {
    return "Can't reach the server. Check your internet connection.";
  }
  return error.message;
}

type AuthState = {
  session: Session | null;
  /** Browsing without an account; treated as the visitor role, no session. */
  guest: boolean;
  enterGuest: () => void;
  /** Null while signed out or while the profile is still loading. Guests are "visitor". */
  role: Role | null;
  /** The profile couldn't be loaded (network or server error), as opposed to having no role. */
  roleError: boolean;
  retryRole: () => void;
  /** True until the saved session (if any) has been checked on startup. */
  loading: boolean;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string, remember: boolean) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

const REMEMBER_KEY = "hawknav_remember_me";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profileRole, setRole] = useState<Role | null>(null);
  const [roleError, setRoleError] = useState(false);
  const [roleTry, setRoleTry] = useState(0);
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
      setRoleError(false);
      return;
    }
    let cancelled = false;
    setRoleError(false);
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed request is not "no profile": don't downgrade a real student to visitor
        // because of a network hiccup. The app shows a retry instead.
        if (error) {
          setRoleError(true);
          return;
        }
        // No profile row should not happen; fall back to the least access.
        setRole((data?.role as Role | undefined) ?? "visitor");
      });
    return () => {
      cancelled = true;
    };
  }, [session, roleTry]);

  async function signIn(email: string, password: string, remember: boolean) {
    if (!supabase) return "Missing Supabase keys — see README";
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return error.message;

    // The login is recorded by a database trigger (see supabase/schema.sql).
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    return null;
  }

  async function signUp(email: string, password: string): Promise<SignUpResult> {
    if (!supabase) return { error: "Missing Supabase keys — see README" };
    if (UHCL_ONLY_SIGNUP && !email.trim().toLowerCase().endsWith(UHCL_DOMAIN)) {
      return { error: `Use your ${UHCL_DOMAIN} email to create an account.` };
    }
    // Check here first so the reason shows right away, without a server round trip.
    const missing = unmetRules(password);
    if (missing.length > 0) {
      return {
        error: `Your password still needs:\n${missing.map((r) => `• ${r.label}`).join("\n")}`,
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) return { error: signUpErrorText(error) };
    // With email confirmation on, there is no session until the user confirms.
    if (!data.session) {
      return { notice: "Account created. Check your email to confirm it, then sign in." };
    }
    // Signed in already. Reset the flag so an earlier "Remember Me off" doesn't carry over.
    await AsyncStorage.setItem(REMEMBER_KEY, "1");
    return {};
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
        roleError,
        retryRole: () => setRoleTry((n) => n + 1),
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

