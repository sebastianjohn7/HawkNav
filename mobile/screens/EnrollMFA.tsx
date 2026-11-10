import { useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { SvgXml } from "react-native-svg";
import { supabase } from "../lib/config";
import { MFAButton, MFACodeEntry, MFAError, mfaStyles, verificationMessage } from "./MFAControls";

type Props = { onVerified: () => void; onBusyChange?: (busy: boolean) => void };

export function EnrollMFA({ onVerified, onBusyChange }: Props) {
  const [step, setStep] = useState<"intro" | "setup" | "verify">("intro");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
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
      setCopied(false);
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

  async function copyKey() {
    try {
      const copied = await Clipboard.setStringAsync(secret);
      if (!copied) throw new Error("Copy is unavailable. Press and hold the key to copy it.");
      setCopied(true);
      setError("");
    } catch {
      setError("Copy is unavailable. Press and hold the key to copy it.");
    }
  }

  return (
    <View style={mfaStyles.stack}>
      <Text style={mfaStyles.eyebrow}>{step === "intro" ? "ACCOUNT SECURITY" : step === "setup" ? "STEP 1 OF 2 · ADD ACCOUNT" : "STEP 2 OF 2 · VERIFY"}</Text>
      <Text accessibilityRole="header" style={mfaStyles.title}>{step === "intro" ? "Secure your account" : step === "setup" ? "Add HawkNav" : "Enter your verification code"}</Text>
      {step === "intro" && <>
        <Text style={mfaStyles.body}>Add an extra layer of protection with an authenticator app. You'll only need to set this up once.</Text>
        <View style={{ backgroundColor: "#EFF6FF", padding: 18, borderRadius: 14, gap: 10 }}>
          <Text style={mfaStyles.label}>1. Add HawkNav to your authenticator</Text>
          <Text style={mfaStyles.label}>2. Confirm with a six-digit code</Text>
          <Text style={mfaStyles.hint}>Use Duo Mobile, Google Authenticator, or another TOTP authenticator.</Text>
        </View>
        <MFAError message={error} />
        <MFAButton title={busy ? "Preparing setup…" : "Set up authenticator"} loading={busy} onPress={() => void startEnrollment()} />
      </>}
      {step === "setup" && <>
        <Text style={mfaStyles.body}>In your authenticator, choose Add account and scan this QR code.</Text>
        <View style={{ alignItems: "center", backgroundColor: "#fff", padding: 16, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 18 }}>
          <SvgXml xml={qrCode} width={200} height={200} />
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: showKey }} onPress={() => setShowKey(value => !value)}>
          <Text style={mfaStyles.link}>Using this phone? Manual setup key</Text>
        </Pressable>
        {showKey && <View style={{ backgroundColor: "#F1F5F9", padding: 16, borderRadius: 14, gap: 12 }}>
          <Text style={mfaStyles.hint}>Copy this key, then add it manually in your authenticator as a time-based account named HawkNav.</Text>
          <Text selectable style={{ color: "#142D4E", fontSize: 16, lineHeight: 24, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>{secret}</Text>
          <MFAButton title={copied ? "Copied — copy again" : "Copy key"} onPress={() => void copyKey()} />
          {copied && <Text accessibilityLiveRegion="polite" style={mfaStyles.hint}>Key copied. Add it in your authenticator, then return here.</Text>}
        </View>}
        <MFAError message={error} />
        <MFAButton title="Continue" onPress={() => { setError(""); setStep("verify"); }} />
        <Text style={mfaStyles.hint}>Already added an unfinished HawkNav account? Replace it with this setup.</Text>
      </>}
      {step === "verify" && <>
        <Text style={mfaStyles.body}>Open your authenticator and enter the six-digit code for HawkNav.</Text>
        <MFACodeEntry onVerify={verify} onBusyChange={value => { setVerifying(value); onBusyChange?.(value); }} />
        <Pressable accessibilityRole="button" disabled={verifying} onPress={() => setStep("setup")}>
          <Text style={[mfaStyles.link, verifying && { opacity: 0.5 }]}>Back to setup</Text>
        </Pressable>
      </>}
    </View>
  );
}
