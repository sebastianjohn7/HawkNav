import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../lib/auth";
import { ACCESS } from "../lib/roles";

type Props = {
  onBack: () => void;
  onOpenAdmin: () => void;
  onOpenPanorama: () => void;
};

export function SettingsPage({ onBack, onOpenAdmin, onOpenPanorama }: Props) {
  const { session, role, signOut } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={32} color="#1565C0" />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{session?.user.email}</Text>
        <Text style={styles.label}>Role: {role ?? "loading…"}</Text>
        {/* Admin only; the database also rejects anyone else. */}
        {role && ACCESS[role].canUseAdminTools && (
          <Pressable style={styles.btn} onPress={onOpenAdmin}>
            <Text>Admin tools</Text>
          </Pressable>
        )}
        <Pressable style={styles.btn} onPress={onOpenPanorama}>
          <Text>360° tour (preview)</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={signOut}>
          <Text>Sign Out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingRight: 16,
    paddingLeft: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    gap: 4,
  },
  title: { fontSize: 20, fontWeight: "700" },
  body: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  label: { fontSize: 16 },
  btn: {
    borderWidth: 1,
    borderColor: "#999",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 4,
  },
});
