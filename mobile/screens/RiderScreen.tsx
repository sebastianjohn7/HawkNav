import { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { apiUrl } from "../lib/config";
import { canUseLiquidGlass, GLASS_WHITE_TINT } from "../lib/glass";
import {
  fallbackRouteEta,
  fetchDrivingRouteEta,
  formatRouteEtaLine,
} from "../lib/routeEta";

type Stop = {
  stop_id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  /** True when this stop is on today's schedule (Chicago day group). */
  runs_today?: boolean;
};

/** Open directions in Apple Maps (iOS) or Google Maps (Android). */
async function openDirections(lat: number, lng: number, label: string) {
  const name = encodeURIComponent(label);
  if (Platform.OS === "ios") {
    await Linking.openURL(
      `http://maps.apple.com/?daddr=${lat},${lng}&q=${name}`,
    );
    return;
  }
  // Prefer the Google Maps app; fall back to the web directions URL.
  const appUrl = `google.navigation:q=${lat},${lng}`;
  const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=walking`;
  const canOpenApp = await Linking.canOpenURL(appUrl);
  await Linking.openURL(canOpenApp ? appUrl : webUrl);
}

/** Min movement before we re-query the road router. */
const ROUTE_MOVE_METERS = 40;
const ROUTE_MIN_INTERVAL_MS = 5_000;

type EtaResponse = {
  stop_id: string;
  stop_name: string;
  drop_off_only?: boolean;
  eta: {
    next_time: string;
    next_time_12h?: string;
    weekday?: string;
    is_today?: boolean;
    day_group: string;
    route: string;
  } | null;
};

type Props = {
  /** Keeps the ETA card above the tab bar. */
  sheetBottom: number;
  /** Live shuttle plot from Realtime — used for distance ETA only. */
  shuttleLat?: number | null;
  shuttleLng?: number | null;
  /** Highlights the chosen stop pin on the map. */
  onSelectedStop?: (stopId: string | null) => void;
  /** Move the map to this stop. Called only when the rider taps a row. */
  onFocusStop?: (stopId: string) => void;
  /** Map pin pick — `nonce` bumps on every tap so repeats still apply. */
  mapPickStopId?: string | null;
  mapPickNonce?: number;
  /** Share of the screen the open sidebar covers, so the pin stays visible. */
  onCoverFraction?: (fraction: number) => void;
};

export function RiderScreen({
  sheetBottom,
  shuttleLat,
  shuttleLng,
  onSelectedStop,
  onFocusStop,
  mapPickStopId,
  mapPickNonce = 0,
  onCoverFraction,
}: Props) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [stopsOpen, setStopsOpen] = useState(false);
  const [scheduleText, setScheduleText] = useState<string>("");
  const [liveText, setLiveText] = useState<string | null>(null);
  const [routeTick, setRouteTick] = useState(0);
  const frameWidth = useRef(0);
  const panelWidth = useRef(0);
  const lastRouteAt = useRef(0);
  const lastRouteFrom = useRef<{ lat: number; lng: number } | null>(null);
  const routeAbort = useRef<AbortController | null>(null);

  function reportCover() {
    if (frameWidth.current <= 0 || panelWidth.current <= 0) return;
    onCoverFraction?.(panelWidth.current / frameWidth.current);
  }

  useEffect(() => {
    fetch(`${apiUrl}/stops`, {
      headers: {
        "ngrok-skip-browser-warning": "true",
        "Accept": "application/json",
      },
    })
      .then((r) => {
        //console.log(`HTTP Status: ${r.status} ${r.statusText}`);
        return r.json()
      })
      .then((body) => {
        const list = (body.stops as Stop[]) ?? [];
        //console.log(`\n\nCurrent Stops: `, body.stops);
        setStops(list);
        const firstToday = list.find((stop) => stop.runs_today) ?? list[0];
        if (firstToday) setSelected(firstToday.stop_id);
      })
      .catch((e) => {
        //console.log("\nAPI Request Processing error occured.");
        setScheduleText(`API error: ${String(e)}`);
  }); //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  }, []);

  const loadEta = useCallback(async (stopId: string) => {
    try {
      const res = await fetch(
        `${apiUrl}/eta?stop_id=${encodeURIComponent(stopId)}`,
      );
      const body = (await res.json()) as EtaResponse;
      if (body.drop_off_only) {
        setScheduleText(`${body.stop_name}: DROP OFF ONLY`);
      } else if (!body.eta) {
        setScheduleText(`${body.stop_name}: no scheduled departures`);
      } else {
        const time = body.eta.next_time_12h ?? body.eta.next_time;
        const day = body.eta.is_today
          ? "today"
          : (body.eta.weekday ?? body.eta.day_group);
        setScheduleText(`${body.stop_name}: next ${time} (${day})`);
      }
    } catch (e) {
      setScheduleText(`ETA error: ${String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (selected) void loadEta(selected);
  }, [selected, loadEta]);

  // One-way: map pin → rider selection (nonce avoids parent↔child loops).
  useEffect(() => {
    if (!mapPickStopId || mapPickNonce === 0) return;
    setSelected(mapPickStopId);
  }, [mapPickStopId, mapPickNonce]);

  useEffect(() => {
    onSelectedStop?.(selected);
  }, [selected, onSelectedStop]);

  const selectedStop = stops.find((stop) => stop.stop_id === selected);
  const canRoute =
    selectedStop != null &&
    Number.isFinite(selectedStop.lat) &&
    Number.isFinite(selectedStop.lng);

  const hasShuttle =
    typeof shuttleLat === "number" &&
    typeof shuttleLng === "number" &&
    Number.isFinite(shuttleLat) &&
    Number.isFinite(shuttleLng);

  // Reset routed ETA when the chosen stop changes.
  useEffect(() => {
    lastRouteFrom.current = null;
    lastRouteAt.current = 0;
    setLiveText(null);
  }, [selected]);

  // Re-check the road router on a fixed cadence.
  useEffect(() => {
    const id = setInterval(
      () => setRouteTick((n) => n + 1),
      ROUTE_MIN_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, []);

  // Road-routed duration/distance for the live shuttle → stop ETA (no turn UI).
  useEffect(() => {
    if (!canRoute || !hasShuttle || !selectedStop) {
      setLiveText(null);
      lastRouteFrom.current = null;
      return;
    }

    const stopLat = selectedStop.lat as number;
    const stopLng = selectedStop.lng as number;
    const from = lastRouteFrom.current;
    const moved = from
      ? fallbackRouteEta(from.lat, from.lng, shuttleLat, shuttleLng)
          .distanceMeters
      : Infinity;
    const due =
      Date.now() - lastRouteAt.current >= ROUTE_MIN_INTERVAL_MS ||
      moved >= ROUTE_MOVE_METERS ||
      !from;

    if (!due) return;

    routeAbort.current?.abort();
    const ac = new AbortController();
    routeAbort.current = ac;

    void (async () => {
      try {
        const eta = await fetchDrivingRouteEta(
          shuttleLat,
          shuttleLng,
          stopLat,
          stopLng,
          ac.signal,
        );
        if (ac.signal.aborted) return;
        lastRouteAt.current = Date.now();
        lastRouteFrom.current = { lat: shuttleLat, lng: shuttleLng };
        setLiveText(formatRouteEtaLine(eta));
      } catch {
        if (ac.signal.aborted) return;
        // Offline / router down — keep a straight-line estimate.
        lastRouteAt.current = Date.now();
        lastRouteFrom.current = { lat: shuttleLat, lng: shuttleLng };
        setLiveText(
          formatRouteEtaLine(
            fallbackRouteEta(shuttleLat, shuttleLng, stopLat, stopLng),
          ),
        );
      }
    })();

    return () => {
      ac.abort();
    };
  }, [canRoute, hasShuttle, selectedStop, shuttleLat, shuttleLng, routeTick]);

  const etaText = [liveText, scheduleText].filter(Boolean).join("\n");

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      onLayout={(event) => {
        frameWidth.current = event.nativeEvent.layout.width;
        reportCover();
      }}
    >
      {!stopsOpen &&
        (canUseLiquidGlass() ? (
          <GlassView
            style={styles.handleGlass}
            glassEffectStyle="regular"
            isInteractive
            tintColor={GLASS_WHITE_TINT}
          >
            <Pressable
              style={styles.handleHit}
              onPress={() => setStopsOpen(true)}
              accessibilityLabel="Open stops"
            >
              <Ionicons name="list" size={18} color="#1565C0" />
              <Text style={styles.handleText}>Stops</Text>
            </Pressable>
          </GlassView>
        ) : (
          <Pressable style={styles.handle} onPress={() => setStopsOpen(true)}>
            <Ionicons name="list" size={18} color="#1565C0" />
            <Text style={styles.handleText}>Stops</Text>
          </Pressable>
        ))}

      <View style={[styles.card, { bottom: sheetBottom }]}>
        <Text style={styles.eta} numberOfLines={3}>
          {etaText || selectedStop?.name || "Open Stops to pick a stop"}
        </Text>
        {canRoute && (
          <Pressable
            style={styles.routeBtn}
            onPress={() =>
              openDirections(
                selectedStop.lat as number,
                selectedStop.lng as number,
                selectedStop.name,
              )
            }
            accessibilityLabel={`Directions to ${selectedStop.name}`}
            hitSlop={6}
          >
            <Ionicons name="navigate" size={18} color="#1565C0" />
          </Pressable>
        )}
      </View>

      {stopsOpen && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={styles.backdrop}
            onPress={() => setStopsOpen(false)}
          />
          <View
            style={[styles.sidebarSlot, { paddingBottom: sheetBottom }]}
            pointerEvents="box-none"
          >
            {canUseLiquidGlass() ? (
              <GlassView
                style={[styles.sidebar, styles.sidebarGlass]}
                glassEffectStyle="regular"
                isInteractive
                tintColor={GLASS_WHITE_TINT}
                onLayout={(event) => {
                  panelWidth.current = event.nativeEvent.layout.width;
                  reportCover();
                }}
              >
                <StopsPanelBody
                  stops={stops}
                  selected={selected}
                  glass
                  onClose={() => setStopsOpen(false)}
                  onSelect={(stopId) => {
                    setSelected(stopId);
                    onFocusStop?.(stopId);
                  }}
                />
              </GlassView>
            ) : (
              <View
                style={styles.sidebar}
                onLayout={(event) => {
                  panelWidth.current = event.nativeEvent.layout.width;
                  reportCover();
                }}
              >
                <StopsPanelBody
                  stops={stops}
                  selected={selected}
                  onClose={() => setStopsOpen(false)}
                  onSelect={(stopId) => {
                    setSelected(stopId);
                    onFocusStop?.(stopId);
                  }}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function StopsPanelBody({
  stops,
  selected,
  glass,
  onClose,
  onSelect,
}: {
  stops: Stop[];
  selected: string | null;
  glass?: boolean;
  onClose: () => void;
  onSelect: (stopId: string) => void;
}) {
  return (
    <>
      <View
        style={[styles.sidebarHeader, glass && styles.sidebarHeaderGlass]}
      >
        <Text style={styles.sidebarTitle}>Stops</Text>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color="#1565C0" />
        </Pressable>
      </View>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
      >
        {stops.map((item) => {
          const on = selected === item.stop_id;
          return (
            <Pressable
              key={item.stop_id}
              style={[
                styles.row,
                on && styles.rowSelected,
                glass && on && styles.rowSelectedGlass,
              ]}
              onPress={() => onSelect(item.stop_id)}
            >
              <View style={styles.rowMain}>
                {item.runs_today ? (
                  <View
                    style={styles.todayDot}
                    accessibilityLabel="Runs today"
                  />
                ) : (
                  <View style={styles.todayDotSpacer} />
                )}
                <Text style={styles.rowText}>{item.name}</Text>
              </View>
              {on && <Ionicons name="checkmark" size={18} color="#0B6E4F" />}
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill },
  handle: {
    position: "absolute",
    left: 0,
    top: "38%",
    backgroundColor: "#fff",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  handleGlass: {
    position: "absolute",
    left: 0,
    top: "38%",
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  handleHit: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
  },
  handleText: {
    color: "#1565C0",
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    position: "absolute",
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  eta: { flex: 1, fontSize: 15, fontWeight: "600" },
  routeBtn: {
    padding: 8,
    borderRadius: 999,
    backgroundColor: "#e8f0fa",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sidebarSlot: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  sidebar: {
    width: "46%",
    // Fraction of the map — keeps the panel short; list scrolls inside.
    height: "55%",
    backgroundColor: "#fff",
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    overflow: "hidden",
  },
  // No solid fill / overflow clip — those blank out Liquid Glass.
  sidebarGlass: {
    backgroundColor: "transparent",
    overflow: "visible",
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  sidebarHeaderGlass: { borderBottomColor: "rgba(0,0,0,0.12)" },
  sidebarTitle: { fontSize: 16, fontWeight: "700" },
  list: { flex: 1 },
  listContent: { flexGrow: 0 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  todayDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#0B6E4F",
  },
  todayDotSpacer: { width: 8, height: 8 },
  rowText: { flex: 1 },
  rowSelected: { backgroundColor: "#e8f5ef" },
  rowSelectedGlass: { backgroundColor: "rgba(11, 110, 79, 0.18)" },
});
