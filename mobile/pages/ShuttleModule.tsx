import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { DEFAULT_SHUTTLE_ID, supabase } from "../lib/config";
import { ACCESS } from "../lib/roles";
import { DriverScreen } from "../screens/DriverScreen";
import { RiderScreen } from "../screens/RiderScreen";
import { ShuttleMapView } from "../widgets/ShuttleMapView";

type Mode = "rider" | "driver";

type Position = {
  lat: number;
  lng: number;
  heading: number | null;
  updated_at?: string;
};

/** Josh's Shuttle tab — campus map + Rider/Driver; marker tracks live GPS. */
export function ShuttleModule() {
  const { role } = useAuth();
  const canDrive = role ? ACCESS[role].canDrive : false;
  const [picked, setMode] = useState<Mode>("rider");
  // Non-drivers always get the rider view, whatever was picked.
  const mode: Mode = canDrive ? picked : "rider";
  const [position, setPosition] = useState<Position | null>(null);

  // Shared Realtime feed so the map updates for both Rider and Driver views.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;

    client
      .from("shuttle_positions")
      .select("lat,lng,heading,updated_at")
      .eq("shuttle_id", DEFAULT_SHUTTLE_ID)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPosition(data as Position);
      });

    const channel = client
      .channel("shuttle_positions_map")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shuttle_positions",
          filter: `shuttle_id=eq.${DEFAULT_SHUTTLE_ID}`,
        },
        (payload) => {
          const row = payload.new as Position | undefined;
          if (row && typeof row.lat === "number") setPosition(row);
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, []);

  return (
    <View style={styles.root}>
      <ShuttleMapView
        shuttleLat={position?.lat}
        shuttleLng={position?.lng}
      />
      {/* Only drivers and admins get the Rider/Driver switch. */}
      {canDrive && (
        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === "rider" && styles.tabOn]}
            onPress={() => setMode("rider")}
          >
            <Text style={styles.tabText}>Rider</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === "driver" && styles.tabOn]}
            onPress={() => setMode("driver")}
          >
            <Text style={styles.tabText}>Driver</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.body}>
        {mode === "rider" ? (
          <RiderScreen />
        ) : (
          <DriverScreen
            onLocalPosition={(p) =>
              setPosition({
                lat: p.lat,
                lng: p.lng,
                heading: p.heading,
              })
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  tabOn: { backgroundColor: "#cfe8dc" },
  tabText: { fontWeight: "600" },
  body: { flex: 1 },
});
