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

type Props = {
  onVerified: () => void;
};

export function EnrollMFA({ onVerified }: Props) {
  const busy = useRef(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [code, setCode] = useState("");
  const [showSetupKey, setShowSetupKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  async function startEnrollment() {
    if (busy.current || factorId) return;

    if (!supabase) {
      setError("Supabase client not initialized.");
      return;
    }
    busy.current = true;
    setLoading(true);
    setError("");

    try {
      // Secrets cannot be recovered after a restart. Remove only unfinished
      // HawkNav enrollments, then create a fresh setup key.
      const { data: factors, error: factorsError } =
        await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;

      if (factors.totp.some((factor) => factor.status === "verified")) {
        onVerified();
        return;
      }

      for (const factor of factors.all) {
        if (
          factor.factor_type === "totp" &&
          factor.status === "unverified" &&
          factor.friendly_name === "HawkNav"
        ) {
          const { error: removalError } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (removalError) throw removalError;
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "HawkNav",

      });
      if (error) throw error;
      if (!data || !data.totp || !data.totp.secret) {
        throw new Error("Enrollment data is incomplete.");
      }
      setFactorId(data.id);
      setSecret(data.totp.secret);
      setQrCode(data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, ""));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Enrollment failed."
      );
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function verifyEnrollment() {
    if (busy.current) return;

    if (!supabase || !factorId) {
      setError("Supabase client not initialized or factor ID missing.");
      return;
    }
    const codeTrimmed = code.trim();
    if (!/^\d{6}$/.test(codeTrimmed)) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    busy.current = true;
    setLoading(true);
    setError("");

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: codeTrimmed,
      });

      if (error) throw error;

      // Pull the aal2 session before the app loads the profile role.
      await supabase.auth.getSession();

      setCode("");
      setFactorId(null);
      setSecret("");
      setQrCode("");
      onVerified();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Verification failed."
      );
    } finally {
      busy.current = false;
      setLoading(false);
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

