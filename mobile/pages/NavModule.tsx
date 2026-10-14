import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { ACCESS, type Tab } from "../lib/roles";
import { IndoorMapScreen } from "../screens/IndoorMapScreen";
import { AlertsModule } from "./AlertsModule";
import { ShuttleModule } from "./ShuttleModule";

type Props = {
  onOpenSettings: () => void;
};

const TABS: Array<{
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: "shuttle", label: "Shuttle", icon: "bus" },
  { id: "find", label: "Find", icon: "location" },
  { id: "alerts", label: "News & Alerts", icon: "notifications" },
];

/** Josh's NavModule shell — bottom tabs + settings (Parking removed). */
export function NavModule({ onOpenSettings }: Props) {
  const { role, roleError, retryRole, guest, signOut } = useAuth();
  const [picked, setPicked] = useState<Tab | null>(null);

  // The role is read from the profile after sign-in; wait for it.
  if (!role) {
    return (
      <View style={styles.center}>
        {roleError ? (
          <>
            <Text style={styles.errorText}>
              Couldn't load your account. Check your connection and try again.
            </Text>
            <Pressable style={styles.signInBtn} onPress={retryRole}>
              <Text style={styles.signInText}>Retry</Text>
            </Pressable>
            <Pressable onPress={signOut}>
              <Text style={styles.errorLink}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const allowed = TABS.filter((t) => ACCESS[role].tabs.includes(t.id));
  // Fall back to the first allowed tab if the picked one isn't allowed (e.g. role changed).
  const tab = allowed.some((t) => t.id === picked) ? picked : allowed[0].id;

  return (
    <View style={styles.root}>
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>HawkNav</Text>
        {guest ? (
          // Guests have no account or settings; this goes back to the sign-in page.
          <Pressable style={styles.signInBtn} onPress={signOut}>
            <Text style={styles.signInText}>Sign In</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.settingsBtn} onPress={onOpenSettings}>
            <Ionicons name="settings" size={22} color="#fff" />
          </Pressable>
        )}
      </View>

      <View style={styles.body}>
        {tab === "shuttle" && <ShuttleModule />}
        {tab === "find" && <IndoorMapScreen />}
        {tab === "alerts" && <AlertsModule />}
      </View>

      {/* One screen (visitors) needs no tab bar. */}
      {allowed.length > 1 && (
      <View style={styles.bottom}>
        {allowed.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={styles.bottomItem}
              onPress={() => setPicked(t.id)}
            >
              <Ionicons
                name={t.icon}
                size={22}
                color={on ? "#1565C0" : "#666"}
              />
              <Text style={[styles.bottomLabel, on && styles.bottomLabelOn]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  appBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  appTitle: { fontSize: 18, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 },
  errorText: { textAlign: "center", fontSize: 16 },
  errorLink: { color: "#1565C0", fontWeight: "600" },
  signInBtn: {
    backgroundColor: "#1565C0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  signInText: { color: "#fff", fontWeight: "700" },
  settingsBtn: {
    backgroundColor: "#1565C0",
    padding: 8,
    borderRadius: 20,
  },
  body: { flex: 1 },
  bottom: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ccc",
    paddingTop: 6,
    paddingBottom: 4,
    backgroundColor: "#fafafa",
  },
  bottomItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  bottomLabel: { fontSize: 10, color: "#666" },
  bottomLabelOn: { color: "#1565C0", fontWeight: "700" },
});
