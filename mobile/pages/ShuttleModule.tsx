import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../lib/auth";
import { apiUrl, DEFAULT_SHUTTLE_ID, supabase } from "../lib/config";
import { ACCESS } from "../lib/roles";
import { DriverScreen } from "../screens/DriverScreen";
import { RiderScreen } from "../screens/RiderScreen";
import { ShuttleMapView, type MapStop } from "../widgets/ShuttleMapView";

type ShuttleMode = "rider" | "driver";

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

/** Campus map full screen; rider and driver content sit over it. */
export function ShuttleModule({ sheetBottom }: Props) {
  const { role: userRole } = useAuth();
  const canDrive = userRole ? ACCESS[userRole].canDrive : false;
  const [pickedMode, setMode] = useState<ShuttleMode>("rider");
  // Students and faculty stay on the rider sheet.
  const mode: ShuttleMode = canDrive ? pickedMode : "rider";
  const [position, setPosition] = useState<Position | null>(null);
  const [stops, setStops] = useState<MapStop[]>([]);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [stopFocus, setStopFocus] = useState<{ id: string; n: number } | null>(
    null,
  );
  const [coverFraction, setCoverFraction] = useState(0);
  const [driverShuttleId, setDriverShuttleId] = useState(DEFAULT_SHUTTLE_ID);
  const mapShuttleId = mode === "driver" ? driverShuttleId : DEFAULT_SHUTTLE_ID;

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/stops`)
      .then((res) => res.json())
      .then(
        (body: {
          stops?: Array<
            MapStop & { lat?: number; lng?: number; runs_today?: boolean }
          >;
        }) => {
          if (cancelled) return;
          // All geocoded stops get pins; sidebar green dots mark runs_today.
          const pins = (body.stops ?? []).flatMap((stop) => {
            if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) {
              return [];
            }
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
        },
      )
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
        <View style={styles.toggleWrap} pointerEvents="box-none">
          <View style={styles.toggle}>
            <Pressable
              style={[styles.toggleSide, mode === "rider" && styles.toggleOn]}
              onPress={() => setMode("rider")}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "rider" }}
              accessibilityLabel="Rider"
            >
              <Ionicons
                name="walk"
                size={18}
                color={mode === "rider" ? "#0B6E4F" : "#666"}
              />
            </Pressable>
            <Pressable
              style={[styles.toggleSide, mode === "driver" && styles.toggleOn]}
              onPress={() => setMode("driver")}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === "driver" }}
              accessibilityLabel="Driver"
            >
              <Ionicons
                name="bus"
                size={18}
                color={mode === "driver" ? "#0B6E4F" : "#666"}
              />
            </Pressable>
          </View>
        </View>
      )}

      {mode === "rider" ? (
        <RiderScreen
          sheetBottom={sheetBottom}
          shuttleLat={position?.lat}
          shuttleLng={position?.lng}
          onSelectedStop={setSelectedStopId}
          onFocusStop={(stopId) =>
            setStopFocus((current) => ({ id: stopId, n: (current?.n ?? 0) + 1 }))
          }
          onCoverFraction={setCoverFraction}
        />
      ) : (
        <DriverScreen
          sheetBottom={sheetBottom}
          onShuttleId={setDriverShuttleId}
          onLocalPosition={(p) =>
            setPosition({
              lat: p.lat,
              lng: p.lng,
              heading: p.heading,
            })
          }
          onCoverFraction={setCoverFraction}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  toggleWrap: {
    position: "absolute",
    top: 10,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 999,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  toggleSide: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  toggleOn: { backgroundColor: "#cfe8dc" },
});
