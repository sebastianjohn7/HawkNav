import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  onSignOut: () => void;
  onBack: () => void;
};

export function SettingsPage({ onSignOut, onBack }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>Settings Page</Text>
        <Pressable style={styles.btn} onPress={onSignOut}>
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
