import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useAuth } from "../lib/auth";

/** Sign in or create an account. On success the session change moves the app on. */
export function SignInPage() {
  const { signIn, signUp, enterGuest } = useAuth();
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const err = creating
      ? await signUp(email, password)
      : await signIn(email, password, rememberMe);
    setBusy(false);
    // Success without a message means the session is set and App switches screens.
    if (err) setMessage(err);
  }

  return (
    <View style={styles.root}>
      <View style={{ height: height / 10 }} />
      <Image
        source={require("../assets/img/odyssey.jpg")}
        style={styles.logo}
        resizeMode="contain"
      />
      <TextInput
        style={[styles.input, { width: width * 0.95 }]}
        placeholder="Enter your email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { width: width * 0.95 }]}
        placeholder="Enter your password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <View style={[styles.row, { width: width * 0.95 }]}>
        <Pressable
          style={[styles.check, rememberMe && styles.checkOn]}
          onPress={() => setRememberMe((v) => !v)}
        />
        <Text style={styles.remember}>Remember Me?</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  logo: { width: 198, height: 198, marginBottom: 16 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 4,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
    paddingHorizontal: 8,
    gap: 8,
  },
  check: {
    width: 25,
    height: 25,
    borderWidth: 1,
    borderColor: "#000",
    backgroundColor: "#fff",
  },
  checkOn: { backgroundColor: "#000" },
  remember: { fontWeight: "700", flex: 1 },
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
