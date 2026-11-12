import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { apiUrl, supabase } from "../lib/config";
import { UHCL_REGION } from "../widgets/ShuttleMapView";

type ParkingMetric = {
  parking_lot_id: number;
  uhcl_name: string;
  unofficial_name: string;
  building: string;
  spot_type: "standard" | "handicap" | "EV";
  number_available: number;
  total_number: number;
  percentage: number;
  latest_updated_at: string | null;
};

type SpotType = ParkingMetric["spot_type"];

type ParkingLotMetrics = {
  parking_lot_id: number;
  uhcl_name: string;
  unofficial_name: string;
  building: string;
  spot_types: Partial<Record<SpotType, ParkingMetric>>;
  latest_updated_at: string | null;
};

const SPOT_TYPES: SpotType[] = ["standard", "handicap", "EV"];

const LOT_MARKER_LOCATIONS: Record<
  number,
  { latitude: number; longitude: number }
> = {
  1: { latitude: 29.5785, longitude: -95.10365 },
  2: { latitude: 29.57745, longitude: -95.1046 },
};

type MapSize = { width: number; height: number };
type MarkerCardPosition = { left: number; top: number };

function availabilityColor(metric: ParkingMetric): string {
  if (metric.total_number <= 0) return "#666";
  if (metric.percentage < 0.3) return "#B42318";
  if (metric.percentage < 0.6) return "#946200";
  return "#1A7F37";
}

export function ParkingCongestionScreen({
  sheetBottom,
}: {
  sheetBottom: number;
}) {
  const mapRef = useRef<MapView>(null);
  const markerPositionRequest = useRef(0);
  const [lots, setLots] = useState<ParkingMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting");
  const [expanded, setExpanded] = useState(true);
  const [visibleMarkerMetrics, setVisibleMarkerMetrics] = useState<Set<number>>(
    () => new Set(),
  );
  const [mapSize, setMapSize] = useState<MapSize>({ width: 0, height: 0 });
  const [markerCardPositions, setMarkerCardPositions] = useState<
    Record<number, MarkerCardPosition>
  >({});
  const groupedLots = useMemo(() => {
    const groups = new Map<number, ParkingLotMetrics>();
    for (const metric of lots) {
      let group = groups.get(metric.parking_lot_id);
      if (!group) {
        group = {
          parking_lot_id: metric.parking_lot_id,
          uhcl_name: metric.uhcl_name,
          unofficial_name: metric.unofficial_name,
          building: metric.building,
          spot_types: {},
          latest_updated_at: null,
        };
        groups.set(metric.parking_lot_id, group);
      }
      group.spot_types[metric.spot_type] = metric;
      if (
        metric.latest_updated_at &&
        (!group.latest_updated_at ||
          metric.latest_updated_at > group.latest_updated_at)
      ) {
        group.latest_updated_at = metric.latest_updated_at;
      }
    }
    return [...groups.values()];
  }, [lots]);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/parking/metrics`);
      const responseText = await response.text();
      let body: {
        metrics?: ParkingMetric[];
        error?: string;
      };
      try {
        body = JSON.parse(responseText) as typeof body;
      } catch {
        const detail =
          response.status === 530
            ? "API tunnel is unavailable. Restart the API tunnel and reload the app."
            : `API returned a non-JSON response (HTTP ${response.status}). Check the API URL and server.`;
        throw new Error(detail);
      }
      if (!response.ok) {
        throw new Error(body.error ?? `Request failed (${response.status})`);
      }
      setLots(body.metrics ?? []);
    } catch (loadError) {
      setError(
        `Could not load parking metrics: ${
          loadError instanceof Error ? loadError.message : String(loadError)
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleMarkerMetrics(lotId: number) {
    setVisibleMarkerMetrics((current) => {
      const next = new Set(current);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  }

  const updateMarkerCardPositions = useCallback(async () => {
    const map = mapRef.current;
    if (!map || mapSize.width === 0 || mapSize.height === 0) return;

    const requestId = ++markerPositionRequest.current;
    try {
      const positions = await Promise.all(
        groupedLots.flatMap((lot) => {
          if (!visibleMarkerMetrics.has(lot.parking_lot_id)) return [];
          const coordinate = LOT_MARKER_LOCATIONS[lot.parking_lot_id];
          if (!coordinate) return [];

          return [
            map.pointForCoordinate(coordinate).then((point) => {
              const cardWidth = 250;
              const cardHeight = 110;
              return [
                lot.parking_lot_id,
                {
                  left: Math.max(
                    8,
                    Math.min(
                      point.x - cardWidth / 2,
                      mapSize.width - cardWidth - 8,
                    ),
                  ),
                  top: Math.max(
                    8,
                    Math.min(
                      point.y - cardHeight - 22,
                      mapSize.height - cardHeight - 8,
                    ),
                  ),
                },
              ] as const;
            }),
          ];
        }),
      );

      if (requestId === markerPositionRequest.current) {
        setMarkerCardPositions(Object.fromEntries(positions));
      }
    } catch (positionError) {
      console.error("Could not position parking metric cards", positionError);
    }
  }, [groupedLots, mapSize, visibleMarkerMetrics]);

  function onMapLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setMapSize((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }

  useEffect(() => {
    void updateMarkerCardPositions();
  }, [updateMarkerCardPositions]);

  useEffect(() => {
    void loadMetrics();
    if (!supabase) {
      setRealtimeStatus("Manual refresh only");
      return;
    }

    const client = supabase;
    const channel = client
      .channel("parking_spot_updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "parking_spot_updates",
        },
        () => {
          void loadMetrics();
        },
      )
      .subscribe((status) => setRealtimeStatus(String(status)));

    return () => {
      void client.removeChannel(channel);
    };
  }, [loadMetrics]);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.title}>Parking Congestion</Text>
        <Text style={styles.subtitle}>UHCL Campus Parking</Text>
      </View>
      <View style={styles.mapContainer} onLayout={onMapLayout}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={UHCL_REGION}
          mapType="standard"
          onRegionChangeComplete={() => void updateMarkerCardPositions()}
        >
          {groupedLots.map((lot) => {
            const coordinate = LOT_MARKER_LOCATIONS[lot.parking_lot_id];
            if (!coordinate) return null;
            const selected = visibleMarkerMetrics.has(lot.parking_lot_id);

            return (
              <Marker
                key={lot.parking_lot_id}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => toggleMarkerMetrics(lot.parking_lot_id)}
              >
                <View style={styles.markerHitBox}>
                  <View
                    style={[
                      styles.markerPin,
                      selected
                        ? styles.markerPinSelected
                        : styles.markerPinIdle,
                    ]}
                  >
                    <Text style={styles.markerLabel}>
                      {lot.uhcl_name.replace(/^Lot\s+/i, "")}
                    </Text>
                  </View>
                </View>
              </Marker>
            );
          })}
        </MapView>
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          {groupedLots
            .filter((lot) => visibleMarkerMetrics.has(lot.parking_lot_id))
            .map((lot) => {
              const position = markerCardPositions[lot.parking_lot_id];
              if (!position) return null;

              return (
                <View
                  key={lot.parking_lot_id}
                  pointerEvents="box-none"
                  style={[
                    styles.markerCardPosition,
                    { left: position.left, top: position.top },
                  ]}
                >
                  <View style={styles.markerCard}>
                    <View style={styles.markerCardHeader}>
                      <View style={styles.markerCardTitleGroup}>
                        <Text style={styles.markerCardTitle}>
                          {lot.unofficial_name || lot.uhcl_name}
                        </Text>
                        <Text style={styles.markerCardSubtitle}>
                          {lot.building} · {lot.uhcl_name}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => toggleMarkerMetrics(lot.parking_lot_id)}
                        accessibilityRole="button"
                        accessibilityLabel={`Hide ${lot.uhcl_name} metrics`}
                        hitSlop={8}
                      >
                        <Ionicons name="close" size={18} color="#555" />
                      </Pressable>
                    </View>
                    <View style={styles.markerMetricRow}>
                      {SPOT_TYPES.map((spotType) => {
                        const metric = lot.spot_types[spotType];
                        return (
                          <View key={spotType} style={styles.markerMetric}>
                            <Text style={styles.markerSpotType}>
                              {spotType === "handicap"
                                ? "Handicap"
                                : spotType === "EV"
                                  ? "EV"
                                  : "Standard"}
                            </Text>
                            <Text
                              style={[
                                styles.markerPercentage,
                                metric && { color: availabilityColor(metric) },
                              ]}
                            >
                              {metric
                                ? `${(metric.percentage * 100).toFixed(0)}%`
                                : "—"}
                            </Text>
                            <Text style={styles.markerCount}>
                              {metric
                                ? `${metric.number_available}/${metric.total_number}`
                                : "No data"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              );
            })}
        </View>
      </View>
      <View
        style={[
          styles.panel,
          expanded && styles.expandedPanel,
          { bottom: sheetBottom + 12 },
        ]}
      >
        <Pressable
          style={styles.panelTop}
          onPress={() => setExpanded((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded
              ? "Minimize parking availability"
              : "Maximize parking availability"
          }
        >
          <View style={styles.panelHandle} />
          <View style={styles.panelHeading}>
            <Text style={styles.panelTitle}>Parking Availability</Text>
            <Ionicons
              name={expanded ? "chevron-down" : "chevron-up"}
              size={20}
              color="#555"
            />
          </View>
        </Pressable>
        {expanded && (
          <ScrollView
            style={styles.panelContent}
            contentContainerStyle={styles.panelContentInner}
            showsVerticalScrollIndicator
          >
            <View style={styles.statusRow}>
              <Text style={styles.status}>Status: {realtimeStatus}</Text>
              <Pressable
                onPress={() => void loadMetrics()}
                accessibilityRole="button"
                disabled={loading}
              >
                <Text style={styles.retry}>Refresh</Text>
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator accessibilityLabel="Loading Parking Metrics" />
            ) : error ? (
              <View style={styles.messageRow}>
                <Text style={styles.error}>{error}</Text>
                <Pressable
                  onPress={() => void loadMetrics()}
                  accessibilityRole="button"
                >
                  <Text style={styles.retry}>Retry</Text>
                </Pressable>
              </View>
            ) : groupedLots.length === 0 ? (
              <Text style={styles.note}>No parking lots are available.</Text>
            ) : (
              groupedLots.map((lot) => {
                const updated = lot.latest_updated_at
                  ? `Updated ${new Date(lot.latest_updated_at).toLocaleTimeString()}`
                  : "Waiting for spot updates";

                return (
                  <View key={lot.parking_lot_id} style={styles.lotCard}>
                    <View style={styles.lotHeader}>
                      <Text style={styles.lotName}>
                        {lot.building} • {lot.uhcl_name}
                      </Text>
                    </View>
                    <View style={styles.metricsRow}>
                      {SPOT_TYPES.map((spotType) => {
                        const metric = lot.spot_types[spotType];
                        return (
                          <View key={spotType} style={styles.metricColumn}>
                            <Text style={styles.spotType}>
                              {spotType === "EV"
                                ? "EV"
                                : spotType.charAt(0).toUpperCase() +
                                  spotType.slice(1)}
                            </Text>
                            <Text
                              style={[
                                styles.metricValue,
                                metric && { color: availabilityColor(metric) },
                              ]}
                            >
                              {metric
                                ? `${(metric.percentage * 100).toFixed(1)}%`
                                : "—"}
                            </Text>
                            <Text style={styles.lotDetail}>
                              {metric
                                ? `${metric.number_available} out of ${metric.total_number}`
                                : "No data"}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={styles.updated}>{updated}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    gap: 4,
  },
  title: { fontWeight: "700" },
  subtitle: { fontSize: 12, color: "#555" },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  markerHitBox: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  markerPin: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "#1565C0",
    elevation: 4,
  },
  markerLabel: { color: "#fff", fontSize: 12, fontWeight: "700" },
  markerPinIdle: { width: 34, height: 34 },
  markerPinSelected: { width: 44, height: 44 },
  markerCardPosition: {
    position: "absolute",
    zIndex: 5,
  },
  markerCard: {
    width: 250,
    height: 110,
    padding: 10,
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  markerCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  markerCardTitleGroup: { flex: 1, gap: 2 },
  markerCardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  markerCardSubtitle: { fontSize: 10, color: "#555", textAlign: "center" },
  markerMetricRow: { flexDirection: "row", gap: 4 },
  markerMetric: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: "#f7f7f7",
  },
  markerSpotType: { fontSize: 9, color: "#333", textAlign: "center" },
  markerPercentage: { fontSize: 13, fontWeight: "700", color: "#666" },
  markerCount: { fontSize: 10, color: "#555" },
  panel: {
    position: "absolute",
    left: 12,
    right: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    overflow: "hidden",
    maxHeight: "75%",
  },
  expandedPanel: { height: "75%" },
  panelTop: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  panelHandle: {
    alignSelf: "center",
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#bbb",
    marginBottom: 8,
  },
  panelHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  panelContent: { flex: 1 },
  panelContentInner: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  panelTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  status: { fontSize: 13, fontWeight: "600", color: "#555" },
  lotCard: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
    gap: 4,
  },
  lotHeader: { gap: 2, paddingBottom: 2, alignItems: "center" },
  metricsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: 6,
  },
  lotName: { fontSize: 14, fontWeight: "600", color: "#111" },
  spotType: { fontSize: 11, fontWeight: "600", color: "#333" },
  metricColumn: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#f7f7f7",
  },
  lotDetail: { fontSize: 12, color: "#555", textAlign: "center" },
  metricValue: { fontSize: 15, fontWeight: "700", color: "#666" },
  updated: {
    fontSize: 11,
    color: "#666",
    textAlign: "center",
    alignSelf: "stretch",
  },
  note: { fontSize: 12, color: "#666" },
  messageRow: { gap: 6 },
  error: { fontSize: 12, color: "#9B1C1C" },
  retry: { fontSize: 13, color: "#1565C0", fontWeight: "700" },
});
