import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DMSans_700Bold, useFonts } from "@expo-google-fonts/dm-sans";
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

/** Expo port of Josh's Landing → Sign-in → NavModule shell, gated by sign-in. */
function Screens() {
  const { session, guest, role, loading } = useAuth();
  const [started, setStarted] = useState(false);
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

  // Signed-in screens stay behind the MFA gate.
  if (session) {
    content = <MFA key={session.user.id}>{content}</MFA>;
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
      {!loading && session ? <MFA key={session.user.id}>{content}</MFA> : content}
    </SafeAreaView>
  );
}

export default function App() {
  // UHCL web headings use DM Sans — load once for the app bar title.
  const [fontsLoaded] = useFonts({
    DMSans_700Bold,
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
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
