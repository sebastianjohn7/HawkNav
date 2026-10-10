import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./lib/auth";
import { LandingPage } from "./pages/LandingPage";
import { NavModule } from "./pages/NavModule";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";

/** Expo port of Josh's Landing → Sign-in → NavModule shell, gated by sign-in. */
function Screens() {
  const { session, guest, loading } = useAuth();
  const [started, setStarted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Guests have no account, so no settings page; NavModule offers Sign In instead.
  return settingsOpen && !guest ? (
    <SettingsPage onBack={() => setSettingsOpen(false)} />
  ) : (
    <NavModule onOpenSettings={() => setSettingsOpen(true)} />
  );
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
