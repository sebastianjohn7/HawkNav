import { useEffect, useState } from "react";
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
import { MFA } from "./pages/MFA";



/** Expo port of Josh's Landing → Sign-in → NavModule shell, gated by sign-in. */
function Screens() {
  const { session, guest, role, loading } = useAuth();
  const [started, setStarted] = useState(false);
  const [screen, setScreen] = useState<"nav" | "settings" | "admin">("nav");

  // After signing out, the next sign-in should start on the main screen.
  useEffect(() => {
    if (!session && !guest) setScreen("nav");
  }, [session, guest]);

  // Wait for the saved session check so a signed-in user doesn't flash the login page.
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  // The session decides which side of the app is shown; no manual route changes.
  if (!session && !guest) {
    return started ? (
      
      <SignInPage />
    ) : (
      <LandingPage onGetStarted={() => setStarted(true)} />
    );
  }

  // Guests only use navigation; account screens require a signed-in session.
  if (!session) {
    return <NavModule onOpenSettings={() => {}} />;
  }

  let content;
  if (screen === "admin" && role && ACCESS[role].canUseAdminTools) {
    content = <AdminPage onBack={() => setScreen("settings")} />;
  } else if (screen === "settings") {
    content = (
      <SettingsPage
        onBack={() => setScreen("nav")}
        onOpenAdmin={() => setScreen("admin")}
      />
    );
  } else {
    content = <NavModule onOpenSettings={() => setScreen("settings")} />;
  }

  // Every signed-in screen stays behind the same MFA gate.
  return <MFA key={session.user.id}>{content}</MFA>;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        <AuthProvider>
          <Screens />
        </AuthProvider>
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

