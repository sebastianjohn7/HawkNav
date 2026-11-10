import { Text, View } from "react-native";
import { supabase } from "../lib/config";
import { MFACodeEntry, mfaStyles } from "./MFAControls";

type Props = { onVerified: () => void; onBusyChange?: (busy: boolean) => void };

export function AuthMFA({ onVerified, onBusyChange }: Props) {
  async function verify(code: string) {
    if (!supabase) throw new Error("Sign-in is unavailable. Please try again.");
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factor = data.totp.find(f => f.status === "verified");
    if (!factor) {
      // Recheck the gate so a removed authenticator leads to enrollment.
      onVerified();
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (verifyError) throw verifyError;
    onVerified();
  }

  return <View style={mfaStyles.stack}>
    <Text style={mfaStyles.eyebrow}>ACCOUNT SECURITY</Text>
    <Text accessibilityRole="header" style={mfaStyles.title}>Enter your verification code</Text>
    <Text style={mfaStyles.body}>Open your authenticator and enter the six-digit code for HawkNav.</Text>
    <MFACodeEntry onVerify={verify} onBusyChange={onBusyChange} />
    <Text style={mfaStyles.hint}>Use your existing HawkNav account in the authenticator. No new setup is needed.</Text>
  </View>;
}
