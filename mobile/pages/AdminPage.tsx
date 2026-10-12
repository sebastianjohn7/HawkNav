import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { AdminUsersPage } from "./AdminUsersPage";

type ToolId = "users";

// To add an admin tool: add it here and render it below.
const TOOLS: Array<{ id: ToolId; label: string; hint: string }> = [
  { id: "users", label: "Manage users", hint: "Promote or demote admins" },
];

type Props = {
  onBack: () => void;
};

/** Admin home: a list of admin tools. Only reachable by admins (see App.tsx). */
export function AdminPage({ onBack }: Props) {
  const [tool, setTool] = useState<ToolId | null>(null);

  if (tool === "users") {
    return <AdminUsersPage onBack={() => setTool(null)} />;
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Admin tools</Text>
      </View>
      {TOOLS.map((t) => (
        <Pressable key={t.id} style={styles.row} onPress={() => setTool(t.id)}>
          <Text style={styles.label}>{t.label}</Text>
          <Text style={styles.hint}>{t.hint}</Text>
        </Pressable>
      ))}
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
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  label: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, color: "#555", marginTop: 2 },
});
