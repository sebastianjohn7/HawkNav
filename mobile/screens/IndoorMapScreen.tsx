import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Geojson, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import deltaFloorplan from "../assets/maps/delta_floorplan_copy.json";
import { buildGraphFromGeoJson, findShortestPath } from "../utils/aStarRouting.ts";
import DisplayPointInfo from "./hooks/displayPointInfo.tsx";

type LevelId = "UHCL.MAIN.DELTA.L1" | "UHCL.MAIN.DELTA.L2";

const LEVELS: Array<{ id: LevelId; label: string }> = [
  { id: "UHCL.MAIN.DELTA.L1", label: "Level 1" },
  { id: "UHCL.MAIN.DELTA.L2", label: "Level 2" },
];

/** Fit map to extracted Delta bbox (lng/lat → MapView region). */
const bbox = deltaFloorplan.bbox as [number, number, number, number];
const DELTA_REGION = {
  latitude: (bbox[1] + bbox[3]) / 2,
  longitude: (bbox[0] + bbox[2]) / 2,
  latitudeDelta: Math.max((bbox[3] - bbox[1]) * 1.6, 0.001),
  longitudeDelta: Math.max((bbox[2] - bbox[0]) * 1.6, 0.001),
};

const deltaGraph = buildGraphFromGeoJson(deltaFloorplan);

type FC = GeoJSON.FeatureCollection;

type FloorLayers = {
  walls: FC;
  units: FC;
  hallways: FC;
};

/** Split once at module load so floor switches reuse stable FeatureCollection refs. */
function splitFloor(levelId: LevelId): FloorLayers {
  const wallFeats: GeoJSON.Feature[] = [];
  const unitFeats: GeoJSON.Feature[] = [];
  const hallwayFeats: GeoJSON.Feature[] = [];

  for (const f of deltaFloorplan.features as GeoJSON.Feature[]) {
    if ((f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID !== levelId) {
      continue;
    }
    const t = f.geometry?.type;
    if (f.properties?.USE_TYPE === "HALLWAY") {
      hallwayFeats.push(f);
    } else if (t === "Polygon" || t === "MultiPolygon" || t === "Point") {
      unitFeats.push(f);
    } else if (t === "LineString" || t === "MultiLineString") {
      wallFeats.push(f);
    }
  }

  return {
    walls: { type: "FeatureCollection", features: wallFeats },
    units: { type: "FeatureCollection", features: unitFeats },
    hallways: { type: "FeatureCollection", features: hallwayFeats },
  };
}

const FLOOR_LAYERS: Record<LevelId, FloorLayers> = {
  "UHCL.MAIN.DELTA.L1": splitFloor("UHCL.MAIN.DELTA.L1"),
  "UHCL.MAIN.DELTA.L2": splitFloor("UHCL.MAIN.DELTA.L2"),
};

/** Display-only Delta floor plan from UHCL Indoors GeoJSON. Custom paths come later. */
export function IndoorMapScreen() {
  const [displayInfo, setDisplayInfo] = useState<GeoJSON.Feature | null>(null);
  const [startNode, setStartNode] = useState<string | null>("135");
  const [endNode, setEndNode] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>("UHCL.MAIN.DELTA.L1");

  // Only mount the active floor. Dual-mount + style toggle froze the UI
  // (react-native-maps rewrites thousands of native overlays on each style change).
  const layers = FLOOR_LAYERS[level];

  const pathLine = useMemo(() => {
    if (!endNode) return null;
    return findShortestPath(deltaFloorplan, startNode, endNode).map(
      ([longitude, latitude]) => ({ latitude, longitude }),
    );
  }, [endNode, startNode]);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Delta</Text>
        <View style={styles.levelRow}>
          {LEVELS.map((l) => {
            const on = level === l.id;
            return (
              <Pressable
                key={l.id}
                style={[styles.levelBtn, on && styles.levelBtnOn]}
                onPress={() => {
                  setLevel(l.id);
                  setDisplayInfo(null);
                }}
              >
                <Text style={[styles.levelText, on && styles.levelTextOn]}>
                  {l.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={DELTA_REGION}
        mapType="standard"
        // Native ignores bottom/left of 0 (falsy). Stack in bottom-left:
        // Apple logo above, Legal underneath.
        appleLogoInsets={{ left: 8, bottom: 8 }}
        legalLabelInsets={{ top: 0, right: 0, bottom: 8, left: 8 }}
      >
        <Geojson
          key={`${level}-units`}
          geojson={layers.units}
          strokeColor="#1E3A8A"
          strokeWidth={1}
          fillColor="rgba(147, 197, 253, 0.35)"
          color="#9094a0"
          onPress={(object) => {
            setDisplayInfo(object.feature);
          }}
        />
        <Geojson
          key={`${level}-hallways`}
          geojson={layers.hallways}
          strokeColor="#f4f9f6"
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />
        <Geojson
          key={`${level}-walls`}
          geojson={layers.walls}
          strokeColor="#33553a"
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />
        {pathLine && (
          <Polyline
            coordinates={pathLine}
            strokeColor="#2563EB"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={10}
          />
        )}
      </MapView>
      {displayInfo && (
        <>
          <Pressable
            style={styles.backdrop}
            onPress={() => setDisplayInfo(null)}
          />
          <DisplayPointInfo object={displayInfo} setEndNode={setEndNode} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f5f5f5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
    gap: 12,
  },
  bannerTitle: { fontWeight: "700" },
  levelRow: { flexDirection: "row", gap: 8 },
  levelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#e5e7eb",
  },
  levelBtnOn: { backgroundColor: "#1D4ED8" },
  levelText: { fontWeight: "600", color: "#111" },
  levelTextOn: { color: "#fff" },
  map: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "transparent",
    height: "100%",
    width: "100%",
    opacity: 0.1,
    zIndex: 998,
  },
});
