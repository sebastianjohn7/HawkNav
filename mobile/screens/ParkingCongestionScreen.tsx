import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

const LOT_LAYOUTS: Record<string, number[][]> = {
  1: [
    [28, 29, 30, 31, 32, 33, 34, 35, 36, 37],
    [19, 20, 21, 22, 23, 24, 25, 26, 27],
    [10, 11, 12, 13, 14, 15, 16, 17, 18],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  ],
  2: [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22],
    [23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33],
    [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44],
  ],
};

const LOT_BLOCKED_BAYS: Record<number, Record<number, number[]>> = {
  1: { 1: [1], 2: [1] },
  2: { 0: [9, 10, 11] },
};

const LOT_LEADING_SPACERS: Record<number, Record<number, number>> = {
  2: { 0: 1 },
};

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
  const [lots, setLots] = useState<ParkingMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState("Connecting");
  const [expanded, setExpanded] = useState(true);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [spotStatuses, setSpotStatuses] = useState<
    Record<number, Record<number, boolean>>
  >({});
  const [spotStatusError, setSpotStatusError] = useState<string | null>(null);
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

  const loadSpotStatuses = useCallback(async () => {
    if (!supabase) {
      setSpotStatuses({});
      setSpotStatusError(
        "Supabase is not configured; live stall data is unavailable.",
      );
      return;
    }

    try {
      const nextStatuses: Record<number, Record<number, boolean>> = {};
      const seenSpots = new Set<string>();
      const expectedSpots = new Set(
        Object.entries(LOT_LAYOUTS).flatMap(([lotId, rows]) =>
          rows.flatMap((row) =>
            row.map((layoutSpotId) => `${lotId}:${layoutSpotId + 1}`),
          ),
        ),
      );
      const pageSize = 1000;
      let pageStart = 0;
      while (true) {
        const { data, error: statusError } = await supabase
          .from("parking_spot_updates")
          .select("parking_lot_id,parking_spot_id,is_available,updated_at,id")
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(pageStart, pageStart + pageSize - 1);
        if (statusError) throw statusError;

        const updates = data ?? [];
        for (const update of updates) {
          const key = `${update.parking_lot_id}:${update.parking_spot_id}`;
          if (seenSpots.has(key)) continue;
          seenSpots.add(key);
          if (update.is_available === null) continue;

          nextStatuses[update.parking_lot_id] ??= {};
          nextStatuses[update.parking_lot_id][update.parking_spot_id] =
            update.is_available;
        }

        pageStart += updates.length;
        if (
          updates.length < pageSize ||
          [...expectedSpots].every((spot) => seenSpots.has(spot))
        ) {
          break;
        }
      }
      setSpotStatuses(nextStatuses);
      setSpotStatusError(null);
    } catch (statusLoadError) {
      setSpotStatusError(
        `Could not load live stall availability: ${
          statusLoadError instanceof Error
            ? statusLoadError.message
            : String(statusLoadError)
        }`,
      );
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadSpotStatuses();
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
          void loadSpotStatuses();
        },
      )
      .subscribe((status) => setRealtimeStatus(String(status)));

    return () => {
      void client.removeChannel(channel);
    };
  }, [loadMetrics, loadSpotStatuses]);

  const selectedLot = groupedLots.find(
    (lot) => lot.parking_lot_id === selectedLotId,
  );

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.title}>Parking Congestion</Text>
        <Text style={styles.subtitle}>UHCL Campus Parking</Text>
      </View>
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          initialRegion={UHCL_REGION}
          mapType="standard"
        >
          {groupedLots.map((lot) => {
            const coordinate = LOT_MARKER_LOCATIONS[lot.parking_lot_id];
            if (!coordinate) return null;
            const selected = selectedLotId === lot.parking_lot_id;

            return (
              <Marker
                key={lot.parking_lot_id}
                coordinate={coordinate}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => setSelectedLotId(lot.parking_lot_id)}
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
      </View>
      {selectedLot && (
        <View style={[styles.miniMapCard, { bottom: sheetBottom + 12 }]}>
          <View style={styles.miniMapHeader}>
            <View style={styles.miniMapTitleGroup}>
              <Text style={styles.miniMapTitle}>
                {selectedLot.unofficial_name || selectedLot.uhcl_name}
              </Text>
              <Text style={styles.miniMapSubtitle}>
                {selectedLot.building} · {selectedLot.uhcl_name}
              </Text>
            </View>
            <Pressable
              onPress={() => setSelectedLotId(null)}
              accessibilityRole="button"
              accessibilityLabel={`Close ${selectedLot.uhcl_name} mini-map`}
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color="#555" />
            </Pressable>
          </View>
          <Text style={styles.miniMapLegend}>
            Green = Available · Red = Occupied · Gray = No data
          </Text>
          {spotStatusError && (
            <Text style={styles.error}>{spotStatusError}</Text>
          )}
          {(() => {
            const rows = LOT_LAYOUTS[String(selectedLot.parking_lot_id)] ?? [];
            const blockedBays =
              LOT_BLOCKED_BAYS[selectedLot.parking_lot_id] ?? {};
            const leadingSpacers =
              LOT_LEADING_SPACERS[selectedLot.parking_lot_id] ?? {};
            const maxCols = Math.max(
              1,
              ...rows.map(
                (row, index) =>
                  row.length +
                  (blockedBays[index]?.length ?? 0) +
                  (leadingSpacers[index] ?? 0),
              ),
            );
            const renderRow = (row: number[], rowIndex: number) => {
              const blockedAfter = blockedBays[rowIndex] ?? [];
              const leadingSpacerCount = leadingSpacers[rowIndex] ?? 0;
              const spacerCount =
                maxCols -
                row.length -
                blockedAfter.length -
                leadingSpacerCount;
              const facesDown = rowIndex === 0 || rowIndex === 2;

              return (
                <View key={`row-${rowIndex}`} style={styles.stallRow}>
                  {Array.from(
                    { length: leadingSpacerCount },
                    (_, index) => (
                      <View
                        key={`leading-spacer-${index}`}
                        style={styles.stallSpacer}
                      />
                    ),
                  )}
                  {row.map((layoutSpotId, index) => {
                    const databaseSpotId = layoutSpotId + 1;
                    const isAvailable =
                      spotStatuses[selectedLot.parking_lot_id]?.[
                        databaseSpotId
                      ];

                    return (
                      <Fragment key={layoutSpotId}>
                        <View
                          style={[
                            styles.stall,
                            facesDown
                              ? styles.stallOpenBottom
                              : styles.stallOpenTop,
                            {
                              backgroundColor:
                                isAvailable === undefined
                                  ? "#64748b"
                                  : isAvailable
                                    ? "#22c55e"
                                    : "#ef4444",
                            },
                          ]}
                        >
                          <Text style={styles.stallLabel}>
                            {databaseSpotId}
                          </Text>
                        </View>
                        {blockedAfter.includes(index + 1) && (
                          <View
                            style={styles.blockedBay}
                            accessibilityLabel="Blocked-off bay"
                          >
                            <Text style={styles.blockedBayLabel}>X</Text>
                          </View>
                        )}
                      </Fragment>
                    );
                  })}
                  {Array.from({ length: spacerCount }, (_, index) => (
                    <View
                      key={`spacer-${index}`}
                      style={styles.stallSpacer}
                    />
                  ))}
                </View>
              );
            };

            return (
              <View style={styles.asphaltCanvas}>
                {rows[0] && renderRow(rows[0], 0)}
                <View style={styles.drivingLane}>
                  <Text style={styles.laneLabel}>DRIVING LANE</Text>
                </View>
                {rows[1] && renderRow(rows[1], 1)}
                <View style={styles.median} />
                {rows[2] && renderRow(rows[2], 2)}
                <View style={styles.drivingLane}>
                  <Text style={styles.laneLabel}>DRIVING LANE</Text>
                </View>
                {rows[3] && renderRow(rows[3], 3)}
              </View>
            );
          })()}
        </View>
      )}
      {!selectedLot && (
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
                  onPress={() => {
                    void loadMetrics();
                    void loadSpotStatuses();
                  }}
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
                    onPress={() => {
                      void loadMetrics();
                      void loadSpotStatuses();
                    }}
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
                                  metric && {
                                    color: availabilityColor(metric),
                                  },
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
      )}
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
  miniMapCard: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 10,
    padding: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  miniMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  miniMapTitleGroup: { flex: 1, gap: 2 },
  miniMapTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
  },
  miniMapSubtitle: { fontSize: 11, color: "#555" },
  miniMapLegend: { fontSize: 10, color: "#555", marginTop: 6, marginBottom: 8 },
  asphaltCanvas: {
    gap: 2,
    padding: 8,
    backgroundColor: "#334155",
    borderRadius: 8,
  },
  stallRow: { flexDirection: "row", gap: 2 },
  stall: {
    flex: 1,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#e2e8f0",
    borderWidth: 1,
  },
  stallOpenBottom: { borderBottomWidth: 0 },
  stallOpenTop: { borderTopWidth: 0 },
  stallLabel: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  blockedBay: {
    flex: 1,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1e293b",
    borderColor: "#94a3b8",
    borderWidth: 1,
    borderStyle: "dashed",
  },
  blockedBayLabel: { color: "#cbd5e1", fontSize: 9, fontWeight: "700" },
  stallSpacer: { flex: 1, height: 32, backgroundColor: "transparent" },
  drivingLane: {
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
  },
  laneLabel: { color: "#cbd5e1", fontSize: 8, letterSpacing: 1 },
  median: { height: 4, backgroundColor: "#94a3b8", borderRadius: 2 },
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
