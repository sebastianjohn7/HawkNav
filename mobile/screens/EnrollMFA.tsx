import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Text,
  TextInput,
  View,
  Pressable,
  Platform,
} from "react-native";
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
    <View>
      <Text>Set up two-factor authentication</Text>
      <Text>Add HawkNav to Duo Mobile, then enter its code.</Text>
      <Text>If you restarted setup, replace the old HawkNav entry in your authenticator with the new setup key.</Text>

      {error !== "" && <Text>{error}</Text>}

      {qrCode !== "" && (
        <View style={{ alignItems: "center", padding: 10, backgroundColor: "#fff" }}>
          <SvgXml xml={qrCode} width={200} height={200} />
        </View>
      )}

      {secret !== "" && (
        <View>
          <Pressable onPress = {() => setShowSetupKey((shown) => !shown)} 
            accessibilityRole="button"
            accessibilityState={{ expanded: showSetupKey }}
            style={{ padding: 10}}
             >

            <Text style={{ fontSize: 16, color: "red", textDecorationLine: "underline" }}>
            
            Manual Setup Key
            </Text>
            </Pressable>

          {showSetupKey && (
          <Text selectable style={{ fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), color: "blue", fontSize: 16 }}>
            {secret}
          </Text>
          )}
        </View>
      )}

        {factorId !== null && (
        
      
        <TextInput
          style={{ borderWidth: 1, padding: 10, marginVertical: 10 }}
          value={code}
          onChangeText={setCode}
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          editable={!loading}
        />
        )}


      {loading && <ActivityIndicator />}

      {!factorId ? (
        <Button
          title="Start Enrollment"
          onPress={startEnrollment}
          disabled={loading}
        />
      ) : (
        <Button
          title="Verify Code"
          onPress={verifyEnrollment}
          disabled={loading}
       />  
      )}
 
    </View>
  );
}
