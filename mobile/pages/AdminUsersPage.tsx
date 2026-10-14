import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth, type Role } from "../lib/auth";
import { supabase } from "../lib/config";

type Row = { id: string; email: string; role: Role };
type Action = "make_admin" | "make_driver" | "demote";

type Props = {
  onBack: () => void;
};

/** What each action does, for the confirm dialog. */
const ACTION_TEXT: Record<Action, (email: string) => string> = {
  make_admin: (e) => `Make ${e} an admin?`,
  make_driver: (e) => `Make ${e} a shuttle driver?`,
  demote: (e) => `Remove ${e}'s admin/driver access?`,
};

const ACTION_LABEL: Record<Action, string> = {
  make_admin: "Make admin",
  make_driver: "Make driver",
  demote: "Demote",
};

/** Buttons offered for an account, by its current role. The database re-checks every rule. */
function actionsFor(role: Role): Action[] {
  if (role === "admin") return ["demote"];
  if (role === "driver") return ["make_admin", "demote"];
  return ["make_driver", "make_admin"];
}

/** Admin only: promote UHCL accounts to driver or admin, or demote them. */
export function AdminUsersPage({ onBack }: Props) {
  const { session } = useAuth();
  const myId = session?.user.id;
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    // RLS lets admins read every profile; 50 rows is plenty with search.
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,role")
      .ilike("email", `%${search.trim()}%`)
      .order("email")
      .limit(50);
    setLoading(false);
    if (error) setMessage(error.message);
    else setRows((data ?? []) as Row[]);
  }, [search]);

  // Wait a moment after typing so every keystroke isn't a query.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  function confirmChange(row: Row, action: Action) {
    Alert.alert("Confirm", ACTION_TEXT[action](row.email), [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => change(row, action) },
    ]);
  }

  async function change(row: Row, action: Action) {
    if (!supabase) return;
    setMessage(null);
    const { error } = await supabase.rpc("change_role", {
      target: row.id,
      action,
    });
    if (error) setMessage(error.message);
    else await load();
  }

  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Manage users</Text>
        <TextInput
          style={styles.search}
          placeholder="Search by email"
          autoCapitalize="none"
          autoCorrect={false}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {message && <Text style={styles.message}>{message}</Text>}
      {loading && <ActivityIndicator style={styles.spinner} />}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={
          loading ? null : <Text style={styles.empty}>No accounts found.</Text>
        }
        renderItem={({ item }) => {
          const isMe = item.id === myId;
          return (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.email}>
                  {item.email}
                  {isMe ? " (you)" : ""}
                </Text>
                <Text style={styles.role}>{item.role}</Text>
              </View>
              {/* No buttons on your own row: nobody can change their own role. */}
              {!isMe && (
                <View style={styles.actions}>
                  {actionsFor(item.role).map((a) => (
                    <Pressable
                      key={a}
                      style={styles.btn}
                      onPress={() => confirmChange(item, a)}
                    >
                      <Text style={styles.btnText}>{ACTION_LABEL[a]}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        }}
      />
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
  search: {
    height: 44,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 4,
    paddingHorizontal: 12,
  },
  message: { color: "#b00020", padding: 12 },
  spinner: { marginTop: 12 },
  empty: { textAlign: "center", color: "#666", marginTop: 24 },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    gap: 8,
  },
  rowText: {},
  email: { fontSize: 15, fontWeight: "600" },
  role: { fontSize: 12, color: "#555", marginTop: 2 },
  actions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  btn: {
    borderWidth: 1,
    borderColor: "#1565C0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  btnText: { color: "#1565C0", fontWeight: "600" },
});
