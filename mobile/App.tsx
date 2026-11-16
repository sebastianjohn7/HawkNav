import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import {
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_900Black,
  useFonts,
} from "@expo-google-fonts/dm-sans";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./lib/auth";
import { ACCESS } from "./lib/roles";
import { AdminPage } from "./pages/AdminPage";
import { LandingPage } from "./pages/LandingPage";
import { NavModule } from "./pages/NavModule";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";
import { MFA } from "./pages/MFA";

type ScreenName = "nav" | "settings" | "admin";

/** Landing intro → Sign-in → NavModule shell, gated by auth. */
function Screens() {
  const { session, guest, role, loading } = useAuth();
  const [started, setStarted] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [screen, setScreen] = useState<ScreenName>("nav");
  // Back sits in the same place on the next screen, so the finger release
  // would press it too. Ignore that second press.
  const ignoreBackUntil = useRef(0);

  function show(next: ScreenName) {
    const now = Date.now();
    if (now < ignoreBackUntil.current) return;
    // Leaving tools lands on Settings, whose back control is in that same spot.
    if (screen === "admin" && next === "settings") {
      ignoreBackUntil.current = now + 400;
    }
    setScreen(next);
  }

  // After signing out, the next sign-in should start on the main screen.
  useEffect(() => {
    if (!session && !guest) setScreen("nav");
  }, [session, guest]);

  let content: ReactNode;
  // The tab bar sits on the physical bottom, so the nav screen skips that inset.
  let edgeToEdgeBottom = false;
  const onAuthGate = !session && !guest;
  // Full-bleed black chrome while the intro runs (avoids white safe-area bars).
  const introActive = onAuthGate && showIntro;

  if (loading) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  } else if (onAuthGate) {
    // White Sign In fills the stack; intro is only a black veil on top.
    content = (
      <View style={styles.authStack}>
        {started && (
          <View
            style={showIntro ? styles.signInUnderlay : styles.signInReady}
          >
            <SignInPage />
          </View>
        )}
        {showIntro && (
          <LandingPage
            onReveal={() => setStarted(true)}
            onFinished={() => setShowIntro(false)}
          />
        )}
      </View>
    );
  } else if (!session) {
    // Guests only use navigation; account screens require a signed-in session.
    edgeToEdgeBottom = true;
    content = <NavModule onOpenSettings={() => {}} />;
  } else if (screen === "admin" && role && ACCESS[role].canUseAdminTools) {
    content = <AdminPage onBack={() => show("settings")} />;
  } else if (screen === "settings") {
    content = <SettingsPage onBack={() => show("nav")} onOpenAdmin={() => show("admin")} />;
  } else {
    edgeToEdgeBottom = true;
    content = <NavModule onOpenSettings={() => show("settings")} />;
  }

  return (
    <SafeAreaView
      style={[styles.root, introActive && styles.rootIntro]}
      edges={
        introActive
          ? []
          : edgeToEdgeBottom
            ? ["top", "left", "right"]
            : ["top", "bottom", "left", "right"]
      }
    >
      {!loading && session ? <MFA key={session.user.id}>{content}</MFA> : content}
    </SafeAreaView>
  );
}

export default function App() {
  // UHCL web headings use DM Sans — load once for the app bar title.
  const [fontsLoaded] = useFonts({
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_900Black,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Screens />
      </AuthProvider>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  // Black only while the veil is up — avoids a leftover black band after fade.
  rootIntro: { backgroundColor: "#000" },
  authStack: { flex: 1, backgroundColor: "#fff" },
  // Absolute while the veil fades so Sign In is a full white plane underneath.
  signInUnderlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },
  // After intro, normal flex layout inside SafeArea insets.
  signInReady: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
