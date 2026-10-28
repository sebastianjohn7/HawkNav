import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { apiUrl, DEFAULT_SHUTTLE_ID, supabase } from "../lib/config";
import { ACCESS } from "../lib/roles";
import { DriverScreen } from "../screens/DriverScreen";
import { RiderScreen } from "../screens/RiderScreen";
import { ShuttleMapView, type MapStop } from "../widgets/ShuttleMapView";

type Mode = "rider" | "driver";

type Position = {
  lat: number;
  lng: number;
  heading: number | null;
  updated_at?: string;
};

type Props = {
  /** Distance from the screen bottom to the sheet, so it clears the tab bar. */
  sheetBottom: number;
};

/** Campus map full screen; rider and driver content sit in a sheet over it. */
export function ShuttleModule({ sheetBottom }: Props) {
  const { role: userRole } = useAuth();
  const canDrive = userRole ? ACCESS[userRole].canDrive : false;
  const [pickedView, setRole] = useState<Role>("rider");
  // Students and faculty stay on the rider sheet.
  const role: Role = canDrive ? pickedView : "rider";
  const [position, setPosition] = useState<Position | null>(null);
  const [stops, setStops] = useState<MapStop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [stopFocus, setStopFocus] = useState<{ id: string; n: number } | null>(
    null,
  );
  const [coverFraction, setCoverFraction] = useState(0);
  const [driverShuttleId, setDriverShuttleId] = useState(DEFAULT_SHUTTLE_ID);
  const mapShuttleId = role === "driver" ? driverShuttleId : DEFAULT_SHUTTLE_ID;

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/stops`)
      .then((res) => res.json())
      .then((body: { stops?: Array<MapStop & { lat?: number; lng?: number }> }) => {
        if (cancelled) return;
        const pins = (body.stops ?? []).flatMap((stop) => {
          if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) return [];
          return [
            {
              stop_id: stop.stop_id,
              name: stop.name,
              lat: stop.lat as number,
              lng: stop.lng as number,
            },
          ];
        });
        setStops(pins);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Shared Realtime feed so the map updates for both Rider and Driver views.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    setPosition(null);

    client
      .from("shuttle_positions")
      .select("lat,lng,heading,updated_at")
      .eq("shuttle_id", mapShuttleId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPosition(data as Position);
      });

    const channel = client
      .channel(`shuttle_positions_map_${mapShuttleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shuttle_positions",
          filter: `shuttle_id=eq.${mapShuttleId}`,
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
  }, [mapShuttleId]);

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        <ShuttleMapView
          shuttleLat={position?.lat}
          shuttleLng={position?.lng}
          stops={stops}
          selectedStopId={selectedStopId}
          focusStopId={stopFocus?.id}
          focusNonce={stopFocus?.n ?? 0}
          obscuredFraction={coverFraction}
        />
      </View>
      {canDrive && (
        <View style={styles.topRow} pointerEvents="box-none">
          <View style={styles.switch}>
            <Pressable
              style={[styles.switchItem, role === "rider" && styles.switchOn]}
              onPress={() => setRole("rider")}
            >
              <Text style={styles.switchText}>Rider</Text>
            </Pressable>
            <Pressable
              style={[styles.switchItem, role === "driver" && styles.switchOn]}
              onPress={() => setRole("driver")}
            >
              <Text style={styles.switchText}>Driver</Text>
            </Pressable>
          </View>
        </View>
      )}
      {role === "rider" ? (
        <RiderScreen
          sheetBottom={sheetBottom}
          onSelectedStop={setSelectedStopId}
          onFocusStop={(stopId) =>
            setStopFocus((current) => ({ id: stopId, n: (current?.n ?? 0) + 1 }))
          }
          onCoverFraction={setCoverFraction}
        />
      ) : (
        <View style={[styles.sheet, { bottom: sheetBottom }]}>
          <ScrollView contentContainerStyle={styles.driverScroll}>
            <DriverScreen
              onShuttleId={setDriverShuttleId}
              onLocalPosition={(p) =>
                setPosition({
                  lat: p.lat,
                  lng: p.lng,
                  heading: p.heading,
                })
              }
            />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  sheet: {
    position: "absolute",
    left: 12,
    right: 12,
    maxHeight: "50%",
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  topRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
  },
  switch: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  switchItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  switchOn: { backgroundColor: "#cfe8dc" },
  switchText: { fontWeight: "600" },
  driverScroll: { paddingBottom: 8 },
});
