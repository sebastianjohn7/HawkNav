import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./lib/auth";
import { ACCESS } from "./lib/roles";
import { AdminPage } from "./pages/AdminPage";
import { LandingPage } from "./pages/LandingPage";
import { NavModule } from "./pages/NavModule";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";

/** Expo port of Josh's Landing → Sign-in → NavModule shell, gated by sign-in. */
function Screens() {
  const { session, guest, role, loading } = useAuth();
  const [started, setStarted] = useState(false);
  const [screen, setScreen] = useState<"nav" | "settings" | "admin">("nav");
  // Back sits in the same place on the next screen, so the finger release
  // would press it too. Ignore that second press.
  const ignoreBackUntil = useRef(0);

  function show(next: "nav" | "settings" | "admin") {
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

  if (loading) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  } else if (!session && !guest) {
    content = started ? (
      <SignInPage />
    ) : (
      <LandingPage onGetStarted={() => setStarted(true)} />
    );
  } else if (screen === "admin" && role && ACCESS[role].canUseAdminTools) {
    content = <AdminPage onBack={() => show("settings")} />;
  } else if (screen === "settings" && !guest) {
    content = (
      <SettingsPage
        onBack={() => show("nav")}
        onOpenAdmin={() => show("admin")}
      />
    );
  } else {
    edgeToEdgeBottom = true;
    content = <NavModule onOpenSettings={() => show("settings")} />;
  }

  return (
    <SafeAreaView
      style={styles.root}
      edges={
        edgeToEdgeBottom
          ? ["top", "left", "right"]
          : ["top", "bottom", "left", "right"]
      }
    >
      {content}
    </SafeAreaView>
  );
}

export default function App() {
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
