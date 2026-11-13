import React, { useEffect, useMemo, useState } from "react";
import {
  Keyboard,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { searchRooms, type RoomOption } from "../../utils/roomSearch";

type Props = {
  /** Where the user is now, shown read-only (the demo user until beacons arrive). */
  currentLabel: string;
  /** Every room that can be searched. */
  rooms: RoomOption[];
  /** The chosen destination (a floor plan NAME), or null. */
  destination: string | null;
  onSelectDestination: (name: string) => void;
  onClearDestination: () => void;
  /** Reports the panel's height so the screen can place other overlays below it. */
  onHeightChange?: (height: number) => void;
};

/**
 * Top-of-map panel: "From" is the user's current location (read-only), "To" is a search box over
 * the map's rooms. Sits over the map and grows downward while the results list is open.
 */
export default function RouteSearchPanel({
  currentLabel,
  rooms,
  destination,
  onSelectDestination,
  onClearDestination,
  onHeightChange,
}: Props) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const labelFor = (name: string | null) =>
    name ? (rooms.find((r) => r.name === name)?.label ?? name) : "";

  // Keep the box in step with the destination when it's set elsewhere (e.g. "Route To" on a card).
  useEffect(() => {
    setQuery(labelFor(destination));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination]);

  const results = useMemo(() => {
    // Right after picking a room the box holds its own name; don't filter down to just that one.
    const typing = destination === null || query !== labelFor(destination);
    return searchRooms(rooms, typing ? query : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, query, destination]);

  const pick = (room: RoomOption) => {
    onSelectDestination(room.name);
    setQuery(room.label);
    setFocused(false);
    Keyboard.dismiss();
  };

  const clear = () => {
    setQuery("");
    onClearDestination();
  };

  return (
    <View
      style={styles.panel}
      onLayout={(e: LayoutChangeEvent) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      <View style={styles.row}>
        <Ionicons name="person-circle" size={20} color="#DC2626" />
        <Text style={styles.rowLabel} numberOfLines={1}>From</Text>
        <Text style={styles.currentText} numberOfLines={1}>
          {currentLabel}
        </Text>
      </View>

      <View style={[styles.row, styles.inputRow, focused && styles.inputRowFocused]}>
        <Ionicons name="location" size={20} color="#1D4ED8" />
        <Text style={styles.rowLabel} numberOfLines={1}>To</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search rooms"
          placeholderTextColor="#9CA3AF"
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          clearButtonMode="never"
          accessibilityLabel="Destination room"
        />
        {(query.length > 0 || destination) && (
          <Pressable onPress={clear} hitSlop={10} accessibilityLabel="Clear destination">
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </Pressable>
        )}
      </View>

      {focused && (
        <ScrollView
          style={styles.results}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {results.length === 0 ? (
            <Text style={styles.empty}>No rooms match "{query}"</Text>
          ) : (
            results.map((room) => (
              <Pressable
                key={room.name}
                style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
                onPress={() => pick(room)}
              >
                <Text style={styles.resultName}>{room.label}</Text>
                <Text style={styles.resultMeta}>
                  {[room.type, room.floors].filter(Boolean).join(" · ")}
                </Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    zIndex: 1000,
    elevation: 60,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36 },
  rowLabel: { width: 48, fontWeight: "700", color: "#374151" },
  currentText: { flex: 1, color: "#111827" },
  inputRow: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "#F9FAFB",
  },
  inputRowFocused: { borderColor: "#1D4ED8", backgroundColor: "#fff" },
  input: { flex: 1, paddingVertical: 6, fontSize: 16, color: "#111827" },
  results: { maxHeight: 260, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  result: { paddingVertical: 10, paddingHorizontal: 4 },
  resultPressed: { backgroundColor: "#EFF6FF" },
  resultName: { fontWeight: "700", color: "#111827" },
  resultMeta: { color: "#6B7280", fontSize: 12 },
  empty: { paddingVertical: 12, color: "#6B7280" },
});
