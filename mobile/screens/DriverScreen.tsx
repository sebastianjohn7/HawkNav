import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GlassView } from "expo-glass-effect";
import { apiUrl } from "../lib/config";
import { canUseLiquidGlass, GLASS_WHITE_TINT } from "../lib/glass";

type Shuttle = { id: string; name: string; polling: boolean };

type Props = {
  /** Keeps the sidebar above the tab bar. */
  sheetBottom: number;
  /** Map follows the shuttle the driver has selected. */
  onShuttleId?: (shuttleId: string) => void;
  /** Show the first plot before Realtime echoes the database write. */
  onLocalPosition?: (p: {
    lat: number;
    lng: number;
    heading: number | null;
  }) => void;
  /** Share of the screen the open sidebar covers, so the pin stays visible. */
  onCoverFraction?: (fraction: number) => void;
};

export function DriverScreen({
  sheetBottom,
  onShuttleId,
  onLocalPosition,
  onCoverFraction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [shuttles, setShuttles] = useState<Shuttle[]>([]);
  const [shuttleId, setShuttleId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [last, setLast] = useState<{
    lat: number;
    lng: number;
    heading: number | null;
  } | null>(null);
  const frameWidth = useRef(0);
  const panelWidth = useRef(0);

  function reportCover() {
    if (frameWidth.current <= 0 || panelWidth.current <= 0) return;
    onCoverFraction?.(panelWidth.current / frameWidth.current);
  }

  useEffect(() => {
    if (!open) onCoverFraction?.(0);
  }, [open, onCoverFraction]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/shuttles`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<{ shuttles?: Shuttle[] }>;
      })
      .then((body) => {
        if (cancelled) return;
        const list = body.shuttles ?? [];
        setShuttles(list);
        const active = list.find((shuttle) => shuttle.polling) ?? list[0];
        if (!active) {
          setStatus("No shuttles configured");
          return;
        }
        setShuttleId(active.id);
        setPolling(active.polling);
        onShuttleId?.(active.id);
        if (active.polling) setStatus(`Polling ${active.name}`);
        else setStatus("Idle");
      })
      .catch((error) => {
        if (cancelled) return;
        const detail =
          error instanceof Error ? error.message : "request failed";
        setStatus(`Cannot reach API (${apiUrl}): ${detail}`);
      });
    return () => {
      cancelled = true;
    };
  }, [onShuttleId]);

  function choose(id: string) {
    if (polling) return;
    setShuttleId(id);
    onShuttleId?.(id);
  }

  async function start() {
    if (!shuttleId) {
      setStatus("Pick a shuttle");
      return;
    }
    setStatus("Starting");
    try {
      const res = await fetch(`${apiUrl}/shuttles/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuttle_id: shuttleId }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPolling(false);
        setStatus(body.error ?? "Check-in failed");
        return;
      }
      setPolling(true);
      const name = shuttles.find((shuttle) => shuttle.id === shuttleId)?.name;
      setStatus(body.note ?? `Polling ${name ?? shuttleId}`);
      if (body.position) {
        const point = {
          lat: body.position.lat as number,
          lng: body.position.lng as number,
          heading: (body.position.heading ?? null) as number | null,
        };
        setLast(point);
        onLocalPosition?.(point);
      }
    } catch {
      setPolling(false);
      setStatus("Cannot reach the API");
    }
  }

  async function stop() {
    if (!shuttleId) return;
    try {
      const res = await fetch(`${apiUrl}/shuttles/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuttle_id: shuttleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setStatus(body.error ?? "Stop failed");
        return;
      }
      setPolling(false);
      setStatus("Stopped");
    } catch {
      setStatus("Cannot reach the API");
    }
  }

  return (
    <View
      style={styles.overlay}
      pointerEvents="box-none"
      onLayout={(event) => {
        frameWidth.current = event.nativeEvent.layout.width;
        reportCover();
      }}
    >
      {!open &&
        (canUseLiquidGlass() ? (
          <GlassView
            style={styles.handleGlass}
            glassEffectStyle="regular"
            isInteractive
            tintColor={GLASS_WHITE_TINT}
          >
            <Pressable
              style={styles.handleHit}
              onPress={() => setOpen(true)}
              accessibilityLabel="Open check-in"
            >
              <Ionicons name="bus" size={18} color="#1565C0" />
              <Text style={styles.handleText}>Drive</Text>
            </Pressable>
          </GlassView>
        ) : (
          <Pressable style={styles.handle} onPress={() => setOpen(true)}>
            <Ionicons name="bus" size={18} color="#1565C0" />
            <Text style={styles.handleText}>Drive</Text>
          </Pressable>
        ))}

      {open && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
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
                <CheckinPanelBody
                  glass
                  status={status}
                  shuttles={shuttles}
                  shuttleId={shuttleId}
                  polling={polling}
                  last={last}
                  onClose={() => setOpen(false)}
                  onChoose={choose}
                  onToggle={polling ? stop : start}
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
                <CheckinPanelBody
                  status={status}
                  shuttles={shuttles}
                  shuttleId={shuttleId}
                  polling={polling}
                  last={last}
                  onClose={() => setOpen(false)}
                  onChoose={choose}
                  onToggle={polling ? stop : start}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function CheckinPanelBody({
  glass,
  status,
  shuttles,
  shuttleId,
  polling,
  last,
  onClose,
  onChoose,
  onToggle,
}: {
  glass?: boolean;
  status: string;
  shuttles: Shuttle[];
  shuttleId: string;
  polling: boolean;
  last: { lat: number; lng: number; heading: number | null } | null;
  onClose: () => void;
  onChoose: (id: string) => void;
  onToggle: () => void;
}) {
  return (
    <>
      <View style={[styles.sidebarHeader, glass && styles.sidebarHeaderGlass]}>
        <Pressable onPress={onClose} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color="#1565C0" />
        </Pressable>
        <Text style={styles.sidebarTitle}>Check-in</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.meta}>Status: {status}</Text>
        {shuttles.map((shuttle) => {
          const selected = shuttle.id === shuttleId;
          return (
            <Pressable
              key={shuttle.id}
              style={[
                styles.choice,
                selected && styles.choiceOn,
                glass && styles.choiceGlass,
                glass && selected && styles.choiceOnGlass,
              ]}
              onPress={() => onChoose(shuttle.id)}
              disabled={polling}
            >
              <Text style={styles.choiceText}>{shuttle.name}</Text>
              {selected && (
                <Ionicons name="checkmark" size={18} color="#0B6E4F" />
              )}
            </Pressable>
          );
        })}
        {last && (
          <Text style={styles.meta}>
            {last.lat.toFixed(5)}, {last.lng.toFixed(5)} heading=
            {last.heading?.toFixed(0) ?? "—"}
          </Text>
        )}
        <Pressable
          style={[styles.btn, polling && styles.btnOff]}
          onPress={onToggle}
        >
          <Text style={styles.btnText}>{polling ? "Stop" : "Start"}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill },
  handle: {
    position: "absolute",
    right: 0,
    top: "38%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  handleGlass: {
    position: "absolute",
    right: 0,
    top: "38%",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sidebarSlot: {
    ...StyleSheet.absoluteFill,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  sidebar: {
    width: "46%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: "hidden",
  },
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
  body: { padding: 10, gap: 6 },
  meta: { fontSize: 13, color: "#333" },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  choiceGlass: { backgroundColor: "rgba(255,255,255,0.28)" },
  choiceOn: { backgroundColor: "#cfe8dc" },
  choiceOnGlass: { backgroundColor: "rgba(11, 110, 79, 0.22)" },
  choiceText: { flex: 1, fontWeight: "600", fontSize: 14, paddingRight: 8 },
  btn: {
    backgroundColor: "#0b6e4f",
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
  },
  btnOff: { backgroundColor: "#8b1e1e" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
