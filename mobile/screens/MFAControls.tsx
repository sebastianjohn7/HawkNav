import { useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function MFAButton({ title, onPress, disabled = false, loading = false }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [mfaStyles.button, (disabled || loading) && { opacity: 0.6 }, pressed && { opacity: 0.8 }]}>
      {loading && <ActivityIndicator color="#fff" />}
      <Text style={mfaStyles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function MFAError({ message }: { message: string }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={mfaStyles.error}>{message}</Text> : null;
}

export function verificationMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (code === "mfa_verification_failed") return "That code didn't work. Try the newest code from your authenticator.";
  if (code === "over_request_rate_limit") return "Too many attempts. Wait a moment before trying again.";
  if (error instanceof Error && /network|fetch/i.test(error.message)) return "Couldn't connect. Check your connection and try again.";
  return error instanceof Error ? error.message : "Couldn't verify your code. Please try again.";
}

// Submit from input events, not an effect: failed codes never retry in a loop.
export function MFACodeEntry({ onVerify, onBusyChange }: {
  onVerify: (code: string) => Promise<void>; onBusyChange?: (busy: boolean) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  async function submit(value: string) {
    if (lock.current || !/^\d{6}$/.test(value)) return;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await onVerify(value);
    } catch (err) {
      setError(verificationMessage(err));
      setCode("");
      input.current?.focus();
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function change(value: string) {
    if (lock.current) return;
    const digits = value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    setError("");
    if (digits.length === 6) void submit(digits);
  }

  return (
    <View style={mfaStyles.stack}>
      <Text style={mfaStyles.label}>Verification code</Text>
      <TextInput ref={input} autoFocus value={code} onChangeText={change}
        accessibilityLabel="Six-digit verification code"
        placeholder="000000" placeholderTextColor="#94A3B8"
        keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
        autoCorrect={false} editable={!busy} selectTextOnFocus
        onSubmitEditing={() => void submit(code)} style={mfaStyles.code} />
      <Text style={mfaStyles.hint}>{busy ? "Checking your code…" : "Paste or enter all six digits. We'll verify automatically."}</Text>
      <MFAError message={error} />
      <MFAButton title={busy ? "Verifying…" : "Verify code"} loading={busy}
        disabled={code.length !== 6} onPress={() => void submit(code)} />
    </View>
  );
}

export const mfaStyles = StyleSheet.create({
  stack: { gap: 16 },
  eyebrow: { color: "#1565C0", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontFamily: "DMSans_700Bold", fontSize: 28, lineHeight: 35, color: "#142D4E" },
  body: { fontSize: 16, lineHeight: 24, color: "#526176" },
  hint: { fontSize: 13, lineHeight: 20, color: "#526176" },
  label: { fontWeight: "600", fontSize: 14, color: "#142D4E" },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: "#1565C0", padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16, textAlign: "center" },
  link: { color: "#1565C0", fontSize: 15, fontWeight: "600", textAlign: "center", paddingVertical: 12 },
  error: { color: "#A62121", backgroundColor: "#FFF1F1", padding: 12, borderRadius: 10, lineHeight: 21 },
  code: { borderWidth: 1, borderColor: "#BAC9DC", borderRadius: 14, backgroundColor: "#F8FAFC", padding: 16, textAlign: "center", fontSize: 28, letterSpacing: 8, color: "#142D4E", minHeight: 64 },
});
