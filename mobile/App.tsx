import { useState } from "react";
import { StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LandingPage } from "./pages/LandingPage";
import { NavModule } from "./pages/NavModule";
import { SettingsPage } from "./pages/SettingsPage";
import { SignInPage } from "./pages/SignInPage";

type Route = "landing" | "signIn" | "nav" | "settings";

/** Expo port of Josh's Landing → Sign-in → NavModule shell. */
export default function App() {
  const [route, setRoute] = useState<Route>("landing");

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root}>
        {route === "landing" && (
          <LandingPage onGetStarted={() => setRoute("signIn")} />
        )}
        {route === "signIn" && (
          <SignInPage onSignIn={() => setRoute("nav")} />
        )}
        {route === "nav" && (
          <NavModule onOpenSettings={() => setRoute("settings")} />
        )}
        {route === "settings" && (
          <SettingsPage
            onBack={() => setRoute("nav")}
            onSignOut={() => setRoute("signIn")}
          />
        )}
        <StatusBar style="auto" />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
});
