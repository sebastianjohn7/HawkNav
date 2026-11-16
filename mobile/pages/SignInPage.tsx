import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { PASSWORD_RULES } from "../lib/password";

/** Sign in or create an account. On success the session change moves the app on. */
export function SignInPage() {
  const { signIn, signUp, enterGuest } = useAuth();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setMessage("Enter your email and password.");
      return;
    }
    setBusy(true);
    setMessage(null);

    if (creating) {
      const result = await signUp(email, password);
      setBusy(false);
      // Failures get a pop-up with the reason; success moves on (or asks for confirmation).
      if (result.error) {
        Alert.alert("Couldn't create your account", result.error);
      } else if (result.notice) {
        Alert.alert("Almost done", result.notice);
        setCreating(false);
      }
      return;
    }

    const err = await signIn(email, password, rememberMe);
    setBusy(false);
    // Success without a message means the session is set and App switches screens.
    if (err) setMessage(err);
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ height: height / 12 }} />
      <Text style={styles.brandTitle} accessibilityRole="header">
        <Text style={styles.brandHawk}>Hawk</Text>
        <Text style={styles.brandNav}>Nav</Text>
      </Text>
      <TextInput
        style={[styles.input, { width: width * 0.95 }]}
        placeholder="Enter your UHCL email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <View style={{ width: width * 0.95 }}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholder="Enter your password"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          style={styles.showBtn}
          onPress={() => setShowPassword((v) => !v)}
        >
          <Text style={styles.showText}>{showPassword ? "Hide" : "Show"}</Text>
        </Pressable>
      </View>

      {/* Live checklist while creating an account: each rule turns green once met. */}
      {creating && (
        <View style={[styles.rules, { width: width * 0.95 }]}>
          <Text style={styles.rulesTitle}>Your password needs:</Text>
          {PASSWORD_RULES.map((r) => {
            const met = r.test(password);
            return (
              <Text key={r.id} style={met ? styles.ruleMet : styles.rule}>
                {met ? "✓" : "○"} {r.label}
              </Text>
            );
          })}
        </View>
      )}

      <View style={[styles.row, { width: width * 0.95 }]}>
        {/* Tapping the box or its label toggles; the checkmark shows when it is on. */}
        <Pressable
          style={styles.rememberTap}
          onPress={() => setRememberMe((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: rememberMe }}
        >
          <View style={[styles.check, rememberMe && styles.checkOn]}>
            {rememberMe && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Text style={styles.remember}>Remember Me?</Text>
        </Pressable>
        <Pressable onPress={() => {}}>
          <Text style={styles.link}>Forgot Password?</Text>
        </Pressable>
      </View>
      {message && (
        <Text style={[styles.message, { width: width * 0.95 }]}>{message}</Text>
      )}
      <Pressable
        style={[styles.signIn, { width: width * 0.85 }]}
        onPress={submit}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.signInText}>
            {creating ? "Create Account" : "Sign In"}
          </Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setCreating((v) => !v);
          setMessage(null);
        }}
      >
        <Text style={styles.toggle}>
          {creating
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </Text>
      </Pressable>
      {/* Visitors browse the Delta map with no account. */}
      <Pressable
        style={[styles.visitor, { width: width * 0.85 }]}
        onPress={enterGuest}
      >
        <Text style={styles.visitorText}>Continue as Visitor</Text>
      </Pressable>
      <Pressable onPress={() => {}}>
        <Text style={styles.alt}>Alternate Sign-In Methods</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Full white underlayer so the intro black fade never shows a split screen.
  scroll: { flex: 1, backgroundColor: "#fff" },
  root: {
    flexGrow: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  brandTitle: {
    fontFamily: "DMSans_900Black",
    fontSize: 52,
    letterSpacing: -2,
    marginBottom: 28,
    transform: [{ skewX: "-8deg" }],
  },
  brandHawk: { color: "#1565C0" },
  brandNav: { color: "#43A047" },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 4,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  // Leaves room for the Show/Hide button on the right.
  passwordInput: { paddingRight: 64 },
  showBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    height: 50,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  showText: { color: "#1565C0", fontWeight: "600" },
  rules: { paddingHorizontal: 8, marginBottom: 12, gap: 2 },
  rulesTitle: { fontWeight: "700", marginBottom: 2 },
  rule: { color: "#666" },
  ruleMet: { color: "#1b7f3b" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
    paddingHorizontal: 8,
    gap: 8,
  },
  rememberTap: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  check: {
    width: 25,
    height: 25,
    borderWidth: 2,
    borderColor: "#1565C0",
    borderRadius: 4,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: "#1565C0" },
  remember: { fontWeight: "700" },
  link: { fontWeight: "700" },
  signIn: {
    height: 60,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    marginBottom: 15,
  },
  signInText: { fontSize: 16, fontWeight: "600" },
  visitor: {
    height: 50,
    borderWidth: 1,
    borderColor: "#1565C0",
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  visitorText: { color: "#1565C0", fontWeight: "600" },
  message: { color: "#b00020", marginBottom: 12, paddingHorizontal: 8 },
  toggle: { fontWeight: "600", color: "#1565C0", marginBottom: 20 },
  alt: {
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
