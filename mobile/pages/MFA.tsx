import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Button, Text, View } from "react-native";
import { supabase } from "../lib/config";
import { useAuth } from "../lib/auth";

import { EnrollMFA } from "../screens/EnrollMFA";
import { AuthMFA } from "../screens/AuthMFA";

type MFAStatus =
  | "checking"
  | "enroll"
  | "verify"
  | "allowed"
  | "error";

type Props = {
  children: ReactNode;
};

export function MFA({ children }: Props) {
  const { session, signOut, retryRole } = useAuth();
  const userId = session?.user?.id;
  const [status, setStatus] = useState<MFAStatus>("checking");
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [exitError, setExitError] = useState("");

  async function backToSignIn() {
    if (leaving) return;
    setLeaving(true);
    setExitError("");
    try {
      await signOut();
    } catch (error) {
      setExitError(error instanceof Error ? error.message : "Could not sign out. Try again.");
    } finally {
      setLeaving(false);
    }
  }

  const checkMFA = useCallback(async () => {
    setStatus("checking");
    setMessage("");

    if (!supabase || !userId) {
      setMessage("Please sign in before setting up MFA.");
      setStatus("error");
      return;
    }

    try {
      const { data, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (error) throw error;

      if (data.currentLevel === "aal2") {
        setStatus("allowed");
      } else if (data.currentLevel === "aal1") {
        setStatus(data.nextLevel === "aal2" ? "verify" : "enroll");
      } else {
        throw new Error("Unable to confirm your signed-in session.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "MFA check failed."
      );
      setStatus("error");
    }
  }, [userId]);

  useEffect(() => {
    void checkMFA();
  }, [checkMFA]);

  // Profile role may have failed while the session was still password-only.
  useEffect(() => {
    if (status === "allowed") retryRole();
  }, [status, retryRole]);



  // Never show protected content without a session.
  if (!session) {
    return <Text>Please sign in.</Text>;
  }

  if (status === "allowed") {
    return <>{children}</>;
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      {status === "checking" && <ActivityIndicator />}
      {status === "error" && (
        <View>
          <Text>{message}</Text>
          <Button title="Retry" onPress={() => void checkMFA()} disabled={leaving} />
        </View>
      )}
      {status === "enroll" && <EnrollMFA onVerified={() => void checkMFA()} />}
      {status === "verify" && <AuthMFA onVerified={() => void checkMFA()} />}
      {exitError !== "" && <Text accessibilityRole="alert">{exitError}</Text>}
      <Button
        title={leaving ? "Signing out..." : "Back to sign in"}
        onPress={backToSignIn}
        disabled={leaving}
      />
    </View>
  );
}
