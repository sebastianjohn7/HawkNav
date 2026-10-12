import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../lib/auth";

type Props = {
  onBack: () => void;
};

export function SettingsPage({ onBack }: Props) {
  const { session, role, signOut } = useAuth();

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{session?.user.email}</Text>
        <Text style={styles.label}>Role: {role ?? "loading…"}</Text>
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
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    gap: 8,
  },
  back: { color: "#1565C0", fontWeight: "600" },
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
