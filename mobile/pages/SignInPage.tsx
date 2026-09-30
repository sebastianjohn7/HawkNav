import { useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  onSignIn: () => void;
};

export function SignInPage({ onSignIn }: Props) {
  const { width, height } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

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
      <Pressable
        style={[styles.signIn, { width: width * 0.85 }]}
        onPress={onSignIn}
      >
        <Text style={styles.signInText}>Sign In</Text>
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
  alt: {
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
