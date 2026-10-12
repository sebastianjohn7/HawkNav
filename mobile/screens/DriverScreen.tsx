import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Location from "expo-location";
import { DEFAULT_SHUTTLE_ID, hasSupabaseConfig, supabase } from "../lib/config";
import "../lib/backgroundLocationStub";

type Props = {
  /** Optimistic map update before Realtime echoes the upsert. */
  onLocalPosition?: (p: {
    lat: number;
    lng: number;
    heading: number | null;
  }) => void;
};

export function DriverScreen({ onLocalPosition }: Props) {
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [last, setLast] = useState<{
    lat: number;
    lng: number;
    heading: number | null;
  } | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    return () => {
      subRef.current?.remove();
    };
  }, []);

  async function start() {
    if (!supabase) {
      setStatus("Missing Supabase keys — see README Phase 1B");
      return;
    }
    const client = supabase;
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setStatus("Location permission denied");
      return;
    }

    // 3–5s balances battery drain vs rider freshness for campus shuttles.
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 0,
      },
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const heading = pos.coords.heading;
        const point = { lat, lng, heading };
        setLast(point);
        onLocalPosition?.(point);
        const { error } = await client.from("shuttle_positions").upsert(
          {
            shuttle_id: DEFAULT_SHUTTLE_ID,
            lat,
            lng,
            heading: heading ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "shuttle_id" },
        );
        if (error) {
          // 42501 = row-level security refused the write: the account is no longer a driver.
          if (error.code === "42501") {
            stop();
            setStatus("You no longer have driver access. Ask an admin.");
          } else {
            setStatus(`Upsert error: ${error.message}`);
          }
          return;
        }
        setStatus("Streaming");
      },
    );
    subRef.current = sub;
    setStreaming(true);
    setStatus("Streaming");
  }

  function stop() {
    subRef.current?.remove();
    subRef.current = null;
    setStreaming(false);
    setStatus("Stopped");
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Driver check-in</Text>
      {!hasSupabaseConfig && (
        <Text style={styles.warn}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY after
          creating a Supabase project (README Phase 1B).
        </Text>
      )}
      <Text style={styles.meta}>Status: {status}</Text>
      {last && (
        <Text style={styles.meta}>
          {last.lat.toFixed(5)}, {last.lng.toFixed(5)} heading=
          {last.heading?.toFixed(0) ?? "—"}
        </Text>
      )}
      <Pressable
        style={[styles.btn, streaming && styles.btnOff]}
        onPress={streaming ? stop : start}
      >
        <Text style={styles.btnText}>
          {streaming ? "Stop" : "Start / Check in"}
        </Text>
      </Pressable>
      {!streaming && status === "Streaming" && <ActivityIndicator />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  meta: { fontSize: 14, color: "#333" },
  warn: { color: "#8a4b08", backgroundColor: "#fff4e5", padding: 10 },
  btn: {
    backgroundColor: "#0b6e4f",
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
  },
  btnOff: { backgroundColor: "#8b1e1e" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
