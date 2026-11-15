import { useRef, useState } from "react";
import { Text, View, Pressable, Platform } from "react-native";
import { supabase } from "../lib/config";
import { SvgXml } from "react-native-svg";

import { MFAButton, MFACodeEntry, MFAError, mfaStyles, verificationMessage } from "./MFAControls";

type Props = { onVerified: () => void; onBusyChange?: (busy: boolean) => void };

export function EnrollMFA({ onVerified, onBusyChange }: Props) {
  const [step, setStep] = useState<"intro" | "setup" | "verify">("intro");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [showKey, setShowKey] = useState(false);

  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);

  async function startEnrollment() {
    if (lock.current) return;
    if (factorId) { setStep("setup"); return; }
    if (!supabase) { setError("Sign-in is unavailable. Please try again."); return; }
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      if (factors.totp.some(f => f.status === "verified")) { onVerified(); return; }
      for (const factor of factors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified" && factor.friendly_name === "HawkNav") {
          const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (error) throw error;
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "HawkNav" });
      if (error) throw error;
      if (!data?.totp?.secret) throw new Error("Couldn't create your setup key. Please try again.");
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setQrCode(data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, ""));
      setShowKey(false);

      setStep("setup");
    } catch (err) {
      setError(verificationMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  async function verify(code: string) {
    if (!supabase || !factorId) throw new Error("Please return to setup and try again.");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw error;
    setSecret("");
    setQrCode("");
    onVerified();
  }

  return (
    <View style={mfaStyles.stack}>
      <Text style={mfaStyles.eyebrow}>ACCOUNT SECURITY</Text>
      <MFAError message={error} />

      {step === "intro" && (
        <>
          <Text accessibilityRole="header" style={mfaStyles.title}>Set up two-factor authentication</Text>
          <Text style={mfaStyles.body}>
            Add HawkNav to Duo Mobile, Google Authenticator, or another authenticator. Then enter its six-digit code to finish setup.
          </Text>
          <MFAButton title="Start Enrollment" onPress={startEnrollment} loading={busy} />
        </>
      )}

      {step === "setup" && (
        <>
          <Text accessibilityRole="header" style={mfaStyles.title}>Add HawkNav to your authenticator</Text>
          <Text style={mfaStyles.body}>Scan this QR code using your authenticator on another device.</Text>
          {qrCode !== "" && (
            <View style={{ alignItems: "center", padding: 10, backgroundColor: "#fff" }}>
              <SvgXml xml={qrCode} width={200} height={200} />
            </View>
          )}
          <Text style={mfaStyles.hint}>
            Using the same phone? Reveal the manual setup key, press and hold to copy it, then add it in your authenticator as a time-based account.
          </Text>
          <Pressable onPress={() => setShowKey(shown => !shown)}
            accessibilityRole="button" accessibilityState={{ expanded: showKey }}>
            <Text style={mfaStyles.link}>{showKey ? "Hide manual setup key" : "Manual setup key"}</Text>
          </Pressable>
          {showKey && (
            <Text selectable style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), color: "#142D4E", fontSize: 16 }}>
              {secret}
            </Text>
          )}
          <Text style={mfaStyles.hint}>If you restarted enrollment, replace the old HawkNav entry with this new setup key.</Text>
          <MFAButton title="Continue" onPress={() => { setShowKey(false); setStep("verify"); }} />
        </>
      )}

      {step === "verify" && (
        <>
          <Text accessibilityRole="header" style={mfaStyles.title}>Confirm your authenticator</Text>
          <Text style={mfaStyles.body}>Enter the six-digit code for HawkNav to finish setup.</Text>
          <MFACodeEntry onVerify={verify} onBusyChange={value => {
            setVerifying(value);
            onBusyChange?.(value);
          }} />
          <Pressable accessibilityRole="button" disabled={verifying}
            accessibilityState={{ disabled: verifying }} onPress={() => setStep("setup")}>
            <Text style={[mfaStyles.link, verifying && { opacity: 0.5 }]}>Back to setup</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}