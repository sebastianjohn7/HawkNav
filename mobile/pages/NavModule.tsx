import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IndoorMapScreen } from "../screens/IndoorMapScreen";
import { AlertsModule } from "./AlertsModule";
import { ShuttleModule } from "./ShuttleModule";

type Tab = "shuttle" | "find" | "alerts";

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
  const [tab, setTab] = useState<Tab>("shuttle");

  return (
    <View style={styles.root}>
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>HawkNav</Text>
        <Pressable style={styles.settingsBtn} onPress={onOpenSettings}>
          <Ionicons name="settings" size={22} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.body}>
        {tab === "shuttle" && <ShuttleModule />}
        <IndoorMapScreen tab={tab}/>
        {tab === "alerts" && <AlertsModule />}
      </View>

      <View style={styles.bottom}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              style={styles.bottomItem}
              onPress={() => setTab(t.id)}
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
