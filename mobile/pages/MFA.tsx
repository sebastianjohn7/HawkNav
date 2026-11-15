import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MFAButton, MFAError, mfaStyles } from "../screens/MFAControls";
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
  const insets = useSafeAreaInsets();
  const [working, setWorking] = useState(false);
  const userId = session?.user?.id;
  const [status, setStatus] = useState<MFAStatus>("checking");
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [exitError, setExitError] = useState("");

  async function backToSignIn() {
    if (leaving || working) return;
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: "#F3F7FC" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 20, paddingBottom: Math.max(insets.bottom, 20) }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 20 }}>
          <Text style={{ fontFamily: "DMSans_700Bold", color: "#1565C0", fontSize: 24, textAlign: "center" }}>HawkNav</Text>
          <View pointerEvents={leaving ? "none" : "auto"}
            style={{ backgroundColor: "#fff", borderRadius: 24, padding: 24, borderWidth: 1, borderColor: "#E2E8F0", gap: 18 }}>
            {status === "checking" && <>
              <ActivityIndicator color="#1565C0" />
              <Text style={[mfaStyles.body, { textAlign: "center" }]}>Checking account security…</Text>
            </>}
            {status === "error" && <>
              <Text style={mfaStyles.title}>Let's try that again</Text>
              <MFAError message={message} />
              <MFAButton title="Retry" onPress={() => void checkMFA()} disabled={leaving} />
            </>}
            {status === "enroll" && <EnrollMFA onVerified={() => void checkMFA()} onBusyChange={setWorking} />}
            {status === "verify" && <AuthMFA onVerified={() => void checkMFA()} onBusyChange={setWorking} />}
          </View>
          <MFAError message={exitError} />
          <Pressable accessibilityRole="button" disabled={leaving || working}
            accessibilityState={{ disabled: leaving || working }} onPress={() => void backToSignIn()}>
            <Text style={[mfaStyles.link, (leaving || working) && { opacity: 0.5 }]}>
              {leaving ? "Signing out…" : "Back to sign in"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
