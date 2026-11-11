import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeSyntheticEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Tabs,
  type TabSelectedEvent,
  type TabSelectionRejectedEvent,
} from "react-native-screens";
import { useAlertsUnreadBadge } from "../lib/alertsUnread";
import { useAuth } from "../lib/auth";
import { GlassCircleButton } from "../lib/glass";
import { ACCESS, type Tab } from "../lib/roles";
import { IndoorMapScreen } from "../screens/IndoorMapScreen";
import { ParkingCongestionScreen } from "../screens/ParkingCongestionScreen";
import { AlertsModule } from "./AlertsModule";
import { ShuttleModule } from "./ShuttleModule";

type Props = {
  onOpenSettings: () => void;
};

const TABS: Array<{
  id: Tab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  sf: string;
  sfOn: string;
}> = [
  { id: "shuttle", label: "Shuttle", icon: "bus", sf: "bus", sfOn: "bus.fill" },
  { id: "find", label: "Map", icon: "map", sf: "map", sfOn: "map.fill" },
  { id: "parking", label: "Parking", icon: "car", sf: "car", sfOn: "car.fill" },
  {
    id: "alerts",
    label: "Alerts",
    icon: "notifications",
    sf: "bell",
    sfOn: "bell.fill",
  },
];

// Room for the floating pill, plus a gap so the shuttle sheet clears it.
const FLOATING_BAR_GAP = 8;
// iOS 26 draws the system bar over the screen. This clears that glass pill.
const SYSTEM_TAB_CLEARANCE = 68;

type BarKind = "system" | "floating" | "none";

/**
 * iOS 26+ uses UITabBar only when this binary actually has the native host.
 * Expo Go builds that predate that view fall back to the floating bar.
 */
function systemTabBarAvailable(): boolean {
  if (Platform.OS !== "ios") return false;
  const major = parseInt(String(Platform.Version), 10);
  if (!Number.isFinite(major) || major < 26) return false;

  const probe = (
    globalThis as {
      __nativeComponentRegistry__hasComponent?: (name: string) => boolean;
    }
  ).__nativeComponentRegistry__hasComponent;
  if (typeof probe !== "function") return false;
  try {
    return probe("RNSTabsHostIOS");
  } catch {
    return false;
  }
}

function TabBody({
  id,
  sheetBottom,
  active,
}: {
  id: Tab;
  sheetBottom: number;
  active: boolean;
}) {
  if (id === "shuttle") return <ShuttleModule sheetBottom={sheetBottom} />;
  if (id === "find") return <IndoorMapScreen tab = {id} />;
  if (id === "parking") return <ParkingCongestionScreen sheetBottom={sheetBottom} />;
  return <AlertsModule bottomInset={sheetBottom} />;
}

/** Bottom tabs + settings. Visitors have one tab, so they get no bar. */
export function NavModule({ onOpenSettings }: Props) {
  const { role, roleError, roleErrorMessage, retryRole, guest, signOut } =
    useAuth();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<Tab | null>(null);
  const [floatingBarHeight, setFloatingBarHeight] = useState(64);
  // Disables sibling tabs while a switch settles (ref alone wouldn't re-render).
  const [floatBusy, setFloatBusy] = useState(false);
  const provenance = useRef(0);
  // Sync gate so two onPressIn events in the same frame can't both win.
  const floatingSwitchLock = useRef(false);
  const floatingSwitchTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const floatingTabRef = useRef<Tab | null>(null);

  useEffect(() => {
    return () => {
      if (floatingSwitchTimer.current) clearTimeout(floatingSwitchTimer.current);
    };
  }, []);

  const allowed = role
    ? TABS.filter((t) => ACCESS[role].tabs.includes(t.id))
    : [];
  const tab =
    allowed.length > 0 && allowed.some((t) => t.id === picked)
      ? picked!
      : (allowed[0]?.id ?? "find");
  floatingTabRef.current = tab;
  const alertsUnread = useAlertsUnreadBadge(role, tab === "alerts");

  if (!role) {
    return (
      <View style={styles.center}>
        {roleError ? (
          <>
            <Text style={styles.errorText}>
              Couldn't load your account. Check your connection and try again.
            </Text>
            {roleErrorMessage ? (
              <Text style={styles.errorLink}>{roleErrorMessage}</Text>
            ) : null}
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

  const bar: BarKind =
    allowed.length <= 1
      ? "none"
      : systemTabBarAvailable()
        ? "system"
        : "floating";

  const sheetBottom =
    bar === "floating"
      ? Math.max(insets.bottom, 10) + floatingBarHeight + FLOATING_BAR_GAP
      : bar === "system"
        ? insets.bottom + SYSTEM_TAB_CLEARANCE
        : Math.max(insets.bottom, 12);

  const trailing = guest ? (
    <Pressable style={styles.signInBtn} onPress={signOut}>
      <Text style={styles.signInText}>Sign In</Text>
    </Pressable>
  ) : (
    <GlassCircleButton
      onPress={onOpenSettings}
      accessibilityLabel="Settings"
    >
      <Ionicons name="settings-outline" size={20} color="#333" />
    </GlassCircleButton>
  );

  function selectFloatingTab(next: Tab) {
    if (next === floatingTabRef.current || floatingSwitchLock.current) return;
    floatingSwitchLock.current = true;
    setFloatBusy(true);
    setPicked(next);
    floatingTabRef.current = next;
    if (floatingSwitchTimer.current) clearTimeout(floatingSwitchTimer.current);
    // Wait for the tab pane to settle, then a beat so bounce / 2nd finger dies.
    floatingSwitchTimer.current = setTimeout(() => {
      floatingSwitchLock.current = false;
      setFloatBusy(false);
      floatingSwitchTimer.current = null;
    }, 500);
  }

  return (
    <View style={styles.root}>
      <View style={styles.appBar}>
        <View style={styles.brand}>
          <Image
            source={require("../assets/img/uhcl_wordmark.png")}
            style={styles.brandMark}
            accessibilityLabel="UHCL"
          />
          <Text style={styles.appTitle}>
            {tab === "alerts" ? "Alerts" : "HawkNav"}
          </Text>
        </View>
        {trailing}
      </View>

      {bar === "system" ? (
        <Tabs.Host
          key={allowed.map((t) => t.id).join("-")}
          navStateRequest={{
            selectedScreenKey: tab,
            baseProvenance: provenance.current,
          }}
          onTabSelected={(event: NativeSyntheticEvent<TabSelectedEvent>) => {
            provenance.current = event.nativeEvent.provenance;
            setPicked(event.nativeEvent.selectedScreenKey as Tab);
          }}
          onTabSelectionRejected={(
            event: NativeSyntheticEvent<TabSelectionRejectedEvent>,
          ) => {
            provenance.current = event.nativeEvent.provenance;
            const key = event.nativeEvent.selectedScreenKey as Tab;
            setPicked((current) => (current === key ? current : key));
          }}
          ios={{
            tabBarTintColor: "#1565C0",
            tabBarControllerMode: "tabBar",
            tabBarMinimizeBehavior: "never",
          }}
        >
          {allowed.map((t) => (
            <Tabs.Screen
              key={t.id}
              screenKey={t.id}
              title={t.label}
              ios={{
                icon: { type: "sfSymbol", name: t.sf },
                selectedIcon: { type: "sfSymbol", name: t.sfOn },
              }}
            >
              <View style={styles.body}>
                <TabBody
                  id={t.id}
                  sheetBottom={sheetBottom}
                  active={tab === t.id}
                />
              </View>
            </Tabs.Screen>
          ))}
        </Tabs.Host>
      ) : (
        <View style={styles.body}>
          {/* Keep all floating tabs mounted so rapid switches don't remount/flicker. */}
          <TabBody
          key={tab}
          id={tab}
          sheetBottom={sheetBottom}
          active={true}
        />
        </View>
      )}

      {bar === "floating" && (
        <View
          style={[styles.floatBar, { bottom: Math.max(insets.bottom, 10) }]}
          onLayout={(event) => {
            const next = Math.round(event.nativeEvent.layout.height);
            setFloatingBarHeight((current) =>
              current === next ? current : next,
            );
          }}
        >
          {allowed.map((t) => {
            const on = tab === t.id;
            const showUnread = t.id === "alerts" && alertsUnread && !on;
            return (
              <Pressable
                key={t.id}
                style={styles.floatItem}
                // onPressIn wins immediately; blocked while floatBusy / lock.
                onPressIn={() => selectFloatingTab(t.id)}
                disabled={floatBusy && !on}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={
                  showUnread ? `${t.label}, unread alerts` : t.label
                }
              >
                <View>
                  <Ionicons
                    name={t.icon}
                    size={22}
                    color={on ? "#1565C0" : "#666"}
                  />
                  {showUnread ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={[styles.floatLabel, on && styles.floatLabelOn]}>
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
    backgroundColor: "#fff",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0.75,
  },
  brandMark: { width: 40, height: 30, resizeMode: "contain" },
  // Matches UHCL web H4/H5: DM Sans, tight tracking, navy.
  appTitle: {
    fontFamily: "DMSans_700Bold",
    fontSize: 22,
    letterSpacing: -0.1,
    color: "#003A60",
    // Optical align with the UHCL wordmark beside it.
    transform: [{ translateY: 1.5 }],
  },
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
  body: { flex: 1 },
  tabPane: {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
},
  tabPaneHidden: {
    opacity: 0,
  },
  floatBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  floatItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  floatLabel: { fontSize: 11, color: "#666" },
  floatLabelOn: { color: "#1565C0", fontWeight: "700" },
  unreadDot: {
    position: "absolute",
    top: -2,
    right: -6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#c62828",
  },
});
