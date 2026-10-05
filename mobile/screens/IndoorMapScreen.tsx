import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Geojson, PROVIDER_DEFAULT } from "react-native-maps";
import deltaFloorplan from "../assets/maps/delta_floorplan.json";

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

type FC = GeoJSON.FeatureCollection;

/** Display-only Delta floor plan from UHCL Indoors GeoJSON. Custom paths come later. */
export function IndoorMapScreen() {
  const [level, setLevel] = useState<LevelId>("UHCL.MAIN.DELTA.L1");

  const { walls, units, movePoints } = useMemo(() => {
    const features = (deltaFloorplan.features as GeoJSON.Feature[]).filter(
      (f) => (f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID === level,
    );
    const wallFeats: GeoJSON.Feature[] = [];
    const unitFeats: GeoJSON.Feature[] = [];
    const moveFeats: GeoJSON.Feature[] = [];
    for (const f of features) {
      const t = f.geometry?.type;
      if(f.properties?.USE_TYPE === "movePoint" && (t === "Polygon" || t === "MultiPolygon" || t === "Point")) {
        moveFeats.push(f);
        console.log(`\n\n YERRRRRRRRRRRRRRRRRRR ${f.properties?.NAME}`);
      }
      else if (t === "Polygon" || t === "MultiPolygon" || t === "Point") {
        unitFeats.push(f);
      } else if (
        t === "LineString" ||
        t === "MultiLineString"
      ) {
        if(f.properties?.USE_TYPE === 'movePoint'){
          console.log(`ERROR: ${f} inside of 'walls'`);
        }
        wallFeats.push(f);
      }
    }
    return {
      walls: { type: "FeatureCollection", features: wallFeats } as FC,
      units: { type: "FeatureCollection", features: unitFeats } as FC,
      movePoints: { type: "FeatureCollection", features: moveFeats } as FC,
    };
  }, [level]);

  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Delta floor plan</Text>
        <Text style={styles.bannerSub}>
          UHCL Indoors extract — paths/routing later
        </Text>
        <View style={styles.levelRow}>
          {LEVELS.map((l) => {
            const on = level === l.id;
            return (
              <Pressable
                key={l.id}
                style={[styles.levelBtn, on && styles.levelBtnOn]}
                onPress={() => setLevel(l.id)}
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
      >
        // Points
        <Geojson
          geojson={units}
          strokeColor="#1E3A8A"
          strokeWidth={1}
          fillColor="rgba(147, 197, 253, 0.35)"
          color= "#9094a0"
        />
        {/* UNCOMMENT THIS TO VIEW MOVEPOINTS
        <Geojson
          geojson={movePoints}
          strokeColor="#021209"
          strokeWidth={1.5}
          fillColor= "transparent"
        />
        */}
        <Geojson
          geojson={walls}
          strokeColor="#33553a"
          strokeWidth={1.5}
          fillColor="transparent"
        />
      </MapView>
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
  bannerTitle: { fontWeight: "700" },
  bannerSub: { fontSize: 12, color: "#555" },
  levelRow: { flexDirection: "row", gap: 8, marginTop: 4 },
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
});
