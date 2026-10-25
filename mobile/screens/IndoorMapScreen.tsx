import { useMemo, useState, useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Geojson, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import deltaFloorplan from "../assets/maps/delta_floorplan_copy.json";
import { buildGraphFromGeoJson, findShortestPath } from "../utils/aStarRouting.ts";
import DisplayPointInfo from "./hooks/displayPointInfo.tsx";
import StartRoomSelectionTesting from "./hooks/startRoomSelectionTesting.tsx";

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


//const deltaGraph = buildGraphFromGeoJson(deltaFloorplan);

/*
console.log("Start Node:", startNode);
console.log("Start Node Edges:", deltaGraph.edges.get(startNode ?? ""));
console.log("End Node:", endNode);
console.log("End Node Edges:", deltaGraph.edges.get(endNode ?? ""));
*/
//console.log(deltaGraph);
//const pathLine: LatLng[] = findShortestPath(deltaFloorplan, "133", "145").map(([longitude, latitude]) => ({latitude, longitude}));
//console.log(pathLine);

type FC = GeoJSON.FeatureCollection;

/** Display-only Delta floor plan from UHCL Indoors GeoJSON. Custom paths come later. */
export function IndoorMapScreen({tab} : {tab: string}) {
  const [displayInfo, setDisplayInfo] = useState<GeoJSON.Feature | null>(null);
  const [displayStartOptions, setDisplayStartOptions] = useState<Boolean>(false);
  const [startNode, setStartNode] = useState<string | null>("205");
  const [endNode, setEndNode] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>("UHCL.MAIN.DELTA.L1");

  const { walls, units, hallways } = useMemo(() => {
    const features = (deltaFloorplan.features as GeoJSON.Feature[]).filter(
      (f) => (f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID === level,
    );
    const wallFeats: GeoJSON.Feature[] = [];
    const unitFeats: GeoJSON.Feature[] = [];
    const moveFeats: GeoJSON.Feature[] = [];
    const hallwayFeats: GeoJSON.Feature[] = [];
    for (const f of features) {
      const t = f.geometry?.type;
      if(f.properties?.USE_TYPE === "movePoint" && (t === "Polygon" || t === "MultiPolygon" || t === "Point")) {
        moveFeats.push(f);
        //console.log(`\n\n YERRRRRRRRRRRRRRRRRRR ${f.properties?.NAME}`);
      }
      if(f.properties?.USE_TYPE === "HALLWAY"){
        hallwayFeats.push(f);
      }
      else if (t === "Polygon" || t === "MultiPolygon" || t === "Point") {
        //console.log(`${f.properties?.NAME} pushed into UNITS`);
        unitFeats.push(f);
      } else if (
        t === "LineString" ||
        t === "MultiLineString"
      ) {
        if(f.properties?.USE_TYPE === 'movePoint'){
        }
        wallFeats.push(f);
      }
    }
    console.log("\n\n\nData Loaded\n\n\n");
    //console.log("Hallways: ", hallwayFeats);

    return {
      walls: { type: "FeatureCollection", features: wallFeats } as FC,
      units: { type: "FeatureCollection", features: unitFeats } as FC,
      movePoints: { type: "FeatureCollection", features: moveFeats } as FC,
      hallways: { type: "FeatureCollection", features: hallwayFeats } as FC,
    };
  }, [level]);

  const rooms: string[] = [];
  for(const f of deltaFloorplan.features){
    const name = f.properties?.NAME;
    if(name && !rooms.includes(name)) rooms.push(f.properties?.NAME);
  }

  // Check for endNode selection, if non-null -> begin routing using current position and endNode
    const pathLine = useMemo(() => {
      console.log("EndNode", endNode);
      if(endNode) return findShortestPath(deltaFloorplan, startNode, endNode).map(([longitude, latitude]) => ({latitude, longitude}));
    }, [endNode]);

    if(!pathLine) console.log("PATHLINE NOT CREATED");

  return (tab === "find" && (
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
        {/* Points*/}
        <Geojson
          geojson={units}
          strokeColor="#1E3A8A"
          strokeWidth={1}
          fillColor="rgba(147, 197, 253, 0.35)"
          color= "#9094a0"
          onPress={(object) => {
            setDisplayInfo(object.feature);
            console.log("Object", object.feature.properties?.NAME);
            //console.log("\n Object Type: ", typeof object);
          }}
        />
        {
        <Geojson
          geojson={hallways}
          strokeColor="#f4f9f6"
          strokeWidth={1.5}
          fillColor= "transparent"
        />
        }
        <Geojson
          geojson={walls}
          strokeColor="#33553a"
          strokeWidth={1.5}
          fillColor="transparent"
        />
        {pathLine && (<Polyline
          coordinates={pathLine}
          strokeColor="#2563EB"
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          zIndex={10}
      />)}
      </MapView>
      {displayStartOptions && (
        <>
        <StartRoomSelectionTesting rooms={rooms} setDisplayStartOptions={setDisplayStartOptions} setStartNode={setStartNode} />
        <Pressable 
        style={styles.backdrop}
        onPress={() => setDisplayStartOptions(false)}
        ></Pressable>
        </>
      )}
      {displayInfo && (
        <>
        <Pressable 
        style={styles.backdrop}
        onPress={() => setDisplayInfo(null)}
        ></Pressable>
        <DisplayPointInfo object={displayInfo} setEndNode={setEndNode}/>
        </>)}
      <View style={styles.startSelectionBox}>
        <Text>Purely For Testing, Removal Imminent</Text>
        <Pressable style={styles.routeButton}
          onPress={() => setDisplayStartOptions(true)}><Text>Select Start Node</Text></Pressable>
      </View>
    </View>
  ));
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
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    height: '100%',
    width: '100%',
    opacity: 0.1,
    zIndex: 997
  },
  startSelectionBox: {
    height: '10%',
    width: '40%',
    backgroundColor: 'white',
    outlineStyle: 'solid',
    outlineWidth: 5,
    outlineColor: 'black',
    bottom: 90,
    alignSelf: 'flex-end',
    zIndex: 997
  },
  routeButton: {
        marginTop: 5,
        justifyContent: 'center',
        alignItems: 'center',
        height: '30%',
        width: '80%',
        backgroundColor: '#784be8',
        borderRadius: 10
    }
});
