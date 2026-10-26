import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { ACCESS } from "../lib/roles";

const STORAGE_KEY = "hawknav_alerts";

type AlertMessage = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type Props = {
  /** Clears the tab bar so the list and the send button stay on screen. */
  bottomInset: number;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Campus alerts. Messages stay on this device until a database exists. */
export function AlertsModule({ bottomInset }: Props) {
  const { role } = useAuth();
  const canSend = role ? ACCESS[role].canUseAdminTools : false;
  const [ready, setReady] = useState(false);
  const [alerts, setAlerts] = useState<AlertMessage[]>([]);
  const [writing, setWriting] = useState(false);
  const [fabHeight, setFabHeight] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as AlertMessage[];
        if (Array.isArray(parsed)) setAlerts(parsed);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(alerts)).catch(() => {});
  }, [alerts, ready]);

  function send() {
    const nextTitle = title.trim();
    const nextBody = body.trim();
    if (!nextTitle || !nextBody) return;
    const message: AlertMessage = {
      id: `${Date.now()}`,
      title: nextTitle,
      body: nextBody,
      createdAt: new Date().toISOString(),
    };
    setAlerts((current) => [message, ...current]);
    setTitle("");
    setBody("");
    setWriting(false);
  }

  if (writing) {
    const canSubmit = title.trim().length > 0 && body.trim().length > 0;
    return (
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => setWriting(false)} hitSlop={8}>
            <Text style={styles.link}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>New alert</Text>
          <Pressable onPress={send} disabled={!canSubmit} hitSlop={8}>
            <Text style={[styles.link, !canSubmit && styles.linkOff]}>Send</Text>
          </Pressable>
        </View>
        <View style={[styles.form, { paddingBottom: bottomInset }]}>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor="#888"
          />
          <TextInput
            style={[styles.input, styles.bodyInput]}
            value={body}
            onChangeText={setBody}
            placeholder="Message"
            placeholderTextColor="#888"
            multiline
            textAlignVertical="top"
          />
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.list,
          alerts.length === 0 && styles.listEmpty,
          { paddingBottom: bottomInset + fabHeight * 2 },
        ]}
        ListEmptyComponent={
          ready ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={36} color="#888" />
              <Text style={styles.emptyTitle}>No alerts</Text>
              <Text style={styles.emptyBody}>
                Campus messages will show up here.
              </Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardWhen}>{formatWhen(item.createdAt)}</Text>
            <Text style={styles.cardBody}>{item.body}</Text>
          </View>
        )}
      />
      {canSend && (
        <Pressable
          style={[styles.fab, { bottom: bottomInset + fabHeight }]}
          onPress={() => setWriting(true)}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            setFabHeight((current) => (current === next ? current : next));
          }}
          accessibilityLabel="New alert"
        >
          <Ionicons name="add" size={28} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f7f8" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
    gap: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", flex: 1 },
  link: { color: "#1565C0", fontWeight: "700", fontSize: 16 },
  linkOff: { color: "#9bb" },
  fab: {
    position: "absolute",
    right: "4%",
    backgroundColor: "#1565C0",
    borderRadius: 999,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  list: { padding: 16, gap: 12 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  empty: { alignItems: "center", gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyBody: { fontSize: 15, color: "#555", textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  cardTitle: { fontSize: 17, fontWeight: "700" },
  cardWhen: { fontSize: 13, color: "#666" },
  cardBody: { fontSize: 15, color: "#222" },
  form: { flex: 1, padding: 16, gap: 12 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  bodyInput: { flex: 1, minHeight: 160 },
});
