import { useMemo, useState, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Geojson, Polyline, Marker, LatLng, PROVIDER_DEFAULT } from "react-native-maps";
import deltaFloorplan from "../assets/maps/delta_floorplan_copy.json";
import { findShortestPath } from "../utils/aStarRouting.ts";
import DisplayPointInfo from "./hooks/displayPointInfo.tsx";
import StartRoomSelectionTesting from "./hooks/startRoomSelectionTesting.tsx";
import * as Location from 'expo-location';


type LevelId = "UHCL.MAIN.DELTA.L1" | "UHCL.MAIN.DELTA.L2";

const LEVELS: Array<{ id: LevelId; label: string }> = [
  { id: "UHCL.MAIN.DELTA.L1", label: "Level 1" },
  { id: "UHCL.MAIN.DELTA.L2", label: "Level 2" },
];

const rooms: string[] = [];
  for(const f of deltaFloorplan.features){
    const name = f.properties?.NAME;
    if(name && !rooms.includes(name)) rooms.push(f.properties?.NAME);
  }

/** Fit map to extracted Delta bbox (lng/lat → MapView region). */
const bbox = deltaFloorplan.bbox as [number, number, number, number];
const DELTA_REGION = {
  latitude: (bbox[1] + bbox[3]) / 2,
  longitude: (bbox[0] + bbox[2]) / 2,
  latitudeDelta: Math.max((bbox[3] - bbox[1]) * 1.6, 0.001),
  longitudeDelta: Math.max((bbox[2] - bbox[0]) * 1.6, 0.001),
};

type FC = GeoJSON.FeatureCollection;

function floorDataEval(levelId: string) {
  // hallways is used for viewing hallway pathlines
    const wallFeats: GeoJSON.Feature[] = [];
    const unitFeats: GeoJSON.Feature[] = [];
    const hallwayFeats: GeoJSON.Feature[] = [];

    for (const f of deltaFloorplan.features) {
      // Skip unnecessary floors
      if((f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID !== levelId) continue;

      const t = f.geometry?.type;
      if(f.properties?.USE_TYPE === "HALLWAY"){
        hallwayFeats.push(f);
      }
      else if (t === "Polygon" || t === "MultiPolygon" || t === "Point") {
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

    return {
      walls: { type: "FeatureCollection", features: wallFeats } as FC,
      units: { type: "FeatureCollection", features: unitFeats } as FC,
      hallways: { type: "FeatureCollection", features: hallwayFeats } as FC,
    };
}

const Floor_Data = {
  "UHCL.MAIN.DELTA.L1": floorDataEval("UHCL.MAIN.DELTA.L1"),
  "UHCL.MAIN.DELTA.L2": floorDataEval("UHCL.MAIN.DELTA.L2")
};

/** Display-only Delta floor plan from UHCL Indoors GeoJSON. Custom paths come later. */
export function IndoorMapScreen({tab} : {tab: string}) {
  const [displayInfo, setDisplayInfo] = useState<GeoJSON.Feature | null>(null);
  const [displayStartOptions, setDisplayStartOptions] = useState<Boolean>(false);
  const [startNode, setStartNode] = useState<string | null>("205");
  const [endNode, setEndNode] = useState<string | null>(null);
  const [level, setLevel] = useState<LevelId>("UHCL.MAIN.DELTA.L1");

  const [location, setLocation] = useState<Location.LocationObject>({
    coords: {
      latitude: DELTA_REGION.latitude,
      longitude: DELTA_REGION.longitude,
      altitude: 0,
      accuracy: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 0, // Initial epoch fallback
  });
    coords: {
      latitude: DELTA_REGION.latitude,
      longitude: DELTA_REGION.longitude,
      altitude: 0,
      accuracy: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: 0, // Initial epoch fallback
  });

  /*
  const { walls, units, hallways } = useMemo(() => {
    // hallways is used for viewing hallway pathlines
    const features = (deltaFloorplan.features as GeoJSON.Feature[]).filter(
      (f) => (f.properties as { LEVEL_ID?: string } | null)?.LEVEL_ID === level,
    );
    const wallFeats: GeoJSON.Feature[] = [];
    const unitFeats: GeoJSON.Feature[] = [];
    const hallwayFeats: GeoJSON.Feature[] = [];
    for (const f of features) {
      const t = f.geometry?.type;
      if(f.properties?.USE_TYPE === "HALLWAY"){
        hallwayFeats.push(f);
      }
      else if (t === "Polygon" || t === "MultiPolygon" || t === "Point") {
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

    return {
      walls: { type: "FeatureCollection", features: wallFeats } as FC,
      units: { type: "FeatureCollection", features: unitFeats } as FC,
      hallways: { type: "FeatureCollection", features: hallwayFeats } as FC,
    };
  }, [level]);
  */


  // Check for endNode selection, if non-null -> begin routing using current position and endNode
    const [pathLine1, pathLine2] = useMemo(() => {
      // Add checking portion to differentiate floor filtered nodes
      //console.log("EndNode", endNode);
      if(!endNode) {
        //console.log("\nThere is no endNode!\n");
        return [];
      }
      // Current user position will be updated by displayPointInfo --> Push new user location into delta_Floorplan features
        if(location){
          //deltaFloorplan = deltaFloorplan.features.map((f) => f.properties?.NAME.includes("USER") ? ({}))
        }
        const fullPath = findShortestPath(deltaFloorplan, startNode, endNode);
        const pathL1: LatLng[] = [];
        const pathL2: LatLng[] = [];
        for (const point of fullPath) {
          //console.log(`Current point's level:`, point.level);
          const targetArray = point.level.includes("L1")
            ? pathL1
            : point.level.includes("L2")
              ? pathL2
              : null;
          
          if(targetArray){
            const [longitude, latitude] = point.coords;
            targetArray.push({latitude: latitude,
              longitude: longitude
            });
          }
          else console.log("\n\nTargetArray not selected\n\n");
        }
        return [pathL1, pathL2];
    }, [endNode]);

  // Custom Room Marker 
  const RoomMarker = () => (
    <View style={styles.markerContainer}>
      <Text style={styles.roomMarkerText}>R</Text>
    </View>
  );

  const currentFloor = Floor_Data[level];

  return (tab === "find" && (
    <View style={styles.container}>
      {/*Parent Container */}
      <View style={styles.banner}>
        {/*Screen Header*/}
        <Text style={styles.bannerTitle}>Delta</Text>
        <View style={styles.levelRow}>
          {LEVELS.map((l) => {
            const on = level === l.id;
            return (
              <Pressable
                key={l.id}
                style={[styles.levelBtn, on && styles.levelBtnOn]}
                onPress={() => {
                  setLevel(l.id)
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
        appleLogoInsets={{ left: 8, bottom: 8, right: 0, top: 0 }}
        legalLabelInsets={{ top: 0, right: 0, bottom: 8, left: 8 }}
      >
        { /* Hallways LineString Display
        <Geojson
          key={`${level}-hallways`}
          geojson={layers.hallways}
          strokeColor="#f4f9f6"
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />
        */}
        
        {/* Points*/}
        {<Geojson
          geojson={currentFloor.units}
          strokeColor={"#1E3A8A"}
          strokeWidth={1}
          fillColor={"rgba(147, 197, 253, 0.35)"}
          color= {"#9094a0"}
          onPress={(object) => setDisplayInfo(object.feature)}
        />}
        <Geojson
          geojson={currentFloor.walls}
          strokeColor={"#33553a"}
          strokeWidth={1.5}
          fillColor="transparent"
          tappable={false}
        />

        {/* Only the active floor's leg of the route is mounted. */}
        {pathLine1 && level.includes("L1") ? (
          <Polyline
            coordinates={pathLine1}
            strokeColor="#2563EB"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={10}
          />
        ) : null}

        {pathLine2 && level.includes("L2") ? (
          <Polyline
            coordinates={pathLine2}
            strokeColor="#2563EB"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
            zIndex={10}
          />
        ) : null}
      </MapView>

      {displayStartOptions && (
        <>
          <StartRoomSelectionTesting rooms={ROOMS} setDisplayStartOptions={setDisplayStartOptions} setStartNode={setStartNode} />
          <Pressable
            style={styles.backdrop}
            onPress={() => setDisplayStartOptions(false)}
          ></Pressable>
        </>
      )}
      { /* Displays Current Selected room info to users */}
      {displayInfo && (
        <>
        <Pressable 
        style={styles.backdrop}
        onPress={() => setDisplayInfo(null)}
        ></Pressable>
        <DisplayPointInfo object={displayInfo} setEndNode={setEndNode} setDisplayInfo={setDisplayInfo}/>
        </>
      )}
      <View style={styles.startSelectionBox}>
        <Text>Purely For Testing, Removal Imminent</Text>
        <Pressable style={styles.routeButton}
          onPress={() => setDisplayStartOptions(true)}>
            <Text>Select Start Node</Text>
        </Pressable>
      </View>
    </View>
  ));
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
  },
  markerContainer: {
    backgroundColor: '#573dec',
    padding: 10,
    borderRadius: 20,
    borderColor: '#fff',
    borderWidth: 1
  },
  roomMarkerText: {
    fontSize: 15,
    color: '#fff'
  }
});
