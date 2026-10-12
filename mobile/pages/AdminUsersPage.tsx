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
import { UHCL_DOMAIN } from "../lib/roles";

type Row = { id: string; email: string; role: Role };

type Props = {
  onBack: () => void;
};

/** Admin only: promote UHCL accounts to admin, or demote other admins. */
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

  function confirmChange(row: Row, makeAdmin: boolean) {
    const text = makeAdmin
      ? `Make ${row.email} an admin?`
      : `Remove admin access from ${row.email}?`;
    Alert.alert("Confirm", text, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => change(row, makeAdmin) },
    ]);
  }

  async function change(row: Row, makeAdmin: boolean) {
    if (!supabase) return;
    setMessage(null);
    // The database function re-checks every rule; this is just the call.
    const { error } = await supabase.rpc("set_admin", {
      target: row.id,
      make_admin: makeAdmin,
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
          const isAdmin = item.role === "admin";
          const isUhcl = item.email.toLowerCase().endsWith(UHCL_DOMAIN);
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
              {isAdmin && !isMe && (
                <Pressable
                  style={styles.btn}
                  onPress={() => confirmChange(item, false)}
                >
                  <Text style={styles.btnText}>Demote</Text>
                </Pressable>
              )}
              {!isAdmin && isUhcl && (
                <Pressable
                  style={styles.btn}
                  onPress={() => confirmChange(item, true)}
                >
                  <Text style={styles.btnText}>Make admin</Text>
                </Pressable>
              )}
              {!isAdmin && !isUhcl && (
                <Text style={styles.note}>UHCL accounts only</Text>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    gap: 12,
  },
  rowText: { flex: 1 },
  email: { fontSize: 15, fontWeight: "600" },
  role: { fontSize: 12, color: "#555", marginTop: 2 },
  btn: {
    borderWidth: 1,
    borderColor: "#1565C0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
  },
  btnText: { color: "#1565C0", fontWeight: "600" },
  note: { fontSize: 12, color: "#888" },
});
