import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiUrl } from "../lib/config";

type Shuttle = { id: string; name: string; polling: boolean };

type Props = {
  /** Map follows the shuttle the driver has selected. */
  onShuttleId?: (shuttleId: string) => void;
  /** Show the first plot before Realtime echoes the database write. */
  onLocalPosition?: (p: {
    lat: number;
    lng: number;
    heading: number | null;
  }) => void;
};

export function DriverScreen({ onShuttleId, onLocalPosition }: Props) {
  const [shuttles, setShuttles] = useState<Shuttle[]>([]);
  const [shuttleId, setShuttleId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [status, setStatus] = useState("Idle");
  const [last, setLast] = useState<{
    lat: number;
    lng: number;
    heading: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/shuttles`)
      .then((res) => res.json())
      .then((body: { shuttles?: Shuttle[] }) => {
        if (cancelled) return;
        const list = body.shuttles ?? [];
        setShuttles(list);
        const active = list.find((shuttle) => shuttle.polling) ?? list[0];
        if (!active) return;
        setShuttleId(active.id);
        setPolling(active.polling);
        onShuttleId?.(active.id);
        if (active.polling) setStatus(`Polling ${active.name}`);
      })
      .catch(() => {
        if (!cancelled) setStatus("Cannot reach the API");
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
    <View style={styles.wrap}>
      <Text style={styles.title}>Driver check-in</Text>
      <Text style={styles.meta}>Status: {status}</Text>
      {shuttles.map((shuttle) => {
        const selected = shuttle.id === shuttleId;
        return (
          <Pressable
            key={shuttle.id}
            style={[styles.choice, selected && styles.choiceOn]}
            onPress={() => choose(shuttle.id)}
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
        onPress={polling ? stop : start}
      >
        <Text style={styles.btnText}>{polling ? "Stop" : "Start"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700" },
  meta: { fontSize: 14, color: "#333" },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  choiceOn: { backgroundColor: "#cfe8dc" },
  choiceText: { flex: 1, fontWeight: "600", paddingRight: 8 },
  btn: {
    backgroundColor: "#0b6e4f",
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
  },
  btnOff: { backgroundColor: "#8b1e1e" },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
