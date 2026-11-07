import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { panoramaImages } from "../assets/panoramas";
import panoramaData from "../assets/panoramas/panorama_nodes.json";
import { PANNELLUM_CSS, PANNELLUM_JS } from "../utils/pannellumBundle";

/**
 * One 360° photo per indoor path node (FR-4). `northOffset` is the viewer yaw, in degrees,
 * that points at map north, so the photo can be lined up with the 2D map. `links` will hold
 * the neighbouring nodes with the yaw each one is seen at.
 */
export type PanoramaNode = {
  id: string;
  building: string;
  floor: number;
  label: string;
  image: string;
  preview: string;
  /** NAMEs of the floor plan units this photo stands for (rooms, stairs, elevators). */
  floorPlanRef: string[];
  lat: number | null;
  lng: number | null;
  northOffset: number | null;
  links: { to: string; yaw: number }[];
};

export const PANORAMA_NODES = (panoramaData.nodes as unknown as PanoramaNode[])
  .filter((n) => panoramaImages[n.id])
  .sort((a, b) => a.floor - b.floor || a.label.localeCompare(b.label, undefined, { numeric: true }));

type Props = {
  /** Node to open first; defaults to the first one. */
  nodeId?: string;
  onBack?: () => void;
  /** Shows tools for measuring each photo's direction against the printed floor plan. */
  calibrate?: boolean;
};

// Bearing of "up" on the printed Delta floor plan, from the room coordinates in the floor plan GeoJSON.
const PLAN_UP_BEARING = 24.7;

function toNorthOffset(planUpYaw: number): number {
  const value = Math.round(planUpYaw - PLAN_UP_BEARING);
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

// The viewer runs in a WebView, which cannot read bundled assets, so each image is handed
// over as a data URI. Cached so switching back to a node is instant.
const dataUriCache = new Map<number, Promise<string>>();

function toDataUri(assetModule: number): Promise<string> {
  let cached = dataUriCache.get(assetModule);
  if (!cached) {
    cached = (async () => {
      const asset = await Asset.fromModule(assetModule).downloadAsync();
      const blob = await (await fetch(asset.localUri ?? asset.uri)).blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    })();
    dataUriCache.set(assetModule, cached);
    cached.catch(() => dataUriCache.delete(assetModule));
  }
  return cached;
}

function buildHtml(preview: string, image: string, yaw: number): string {
  const js = PANNELLUM_JS.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${PANNELLUM_CSS}
html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}</style>
</head><body><div id="p"></div>
<script>${js}</script>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
try{
var v=pannellum.viewer('p',{type:'equirectangular',panorama:${JSON.stringify(image)},preview:${JSON.stringify(preview)},
autoLoad:true,yaw:${yaw},pitch:0,hfov:100,minHfov:50,maxHfov:120,minPitch:-75,showControls:false,compass:false});
var last=null;
v.on('load',function(){post({type:'load'})});
v.on('error',function(e){post({type:'error',message:String(e)})});
setInterval(function(){var y=Math.round(v.getYaw());if(y!==last){last=y;post({type:'yaw',yaw:y})}},250);
}catch(e){post({type:'error',message:String(e)})}
</script></body></html>`;
}

export function PanoramaScreen({ nodeId, onBack, calibrate }: Props) {
  const [currentId, setCurrentId] = useState(nodeId ?? PANORAMA_NODES[0]?.id);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [html, setHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaw, setYaw] = useState(0);

  const node = useMemo(() => PANORAMA_NODES.find((n) => n.id === currentId), [currentId]);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    setHtml(null);
    setLoaded(false);
    setError(null);
    setYaw(node.northOffset ?? 0);
    const files = panoramaImages[node.id];
    Promise.all([toDataUri(files.preview), toDataUri(files.image)])
      .then(([preview, image]) => {
        if (!cancelled) setHtml(buildHtml(preview, image, node.northOffset ?? 0));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [node]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "load") setLoaded(true);
      else if (msg.type === "yaw") setYaw(msg.yaw);
      else if (msg.type === "error") setError(msg.message);
    } catch {
      // Ignore anything the viewer did not send.
    }
  }

  if (!node) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No 360° photos found. Run mobile/scripts/process_panoramas.ps1.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        )}
        <View style={styles.titleBox}>
          <Text style={styles.title}>{node.label}</Text>
          <Text style={styles.subtitle}>
            {node.building} · Floor {node.floor}
          </Text>
        </View>
      </View>

      <View style={styles.viewer}>
        {html && !error && (
          <WebView
            key={node.id}
            source={{ html }}
            originWhitelist={["*"]}
            javaScriptEnabled
            scrollEnabled={false}
            bounces={false}
            overScrollMode="never"
            style={styles.web}
            onMessage={onMessage}
          />
        )}
        {!loaded && !error && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color="#fff" />
          </View>
        )}
        {error && (
          <View style={styles.overlay}>
            <Text style={styles.errorText}>Could not show this panorama.</Text>
            <Text style={styles.muted}>{error}</Text>
          </View>
        )}
      </View>

      <Text style={styles.readout} selectable>
        yaw {yaw}° · northOffset in panorama_nodes.json: {node.northOffset ?? "not set"}
      </Text>

      {calibrate && (
        <View style={styles.calibrate}>
          <Pressable
            style={styles.markButton}
            onPress={() => setMarks((m) => ({ ...m, [node.id]: yaw }))}
          >
            <Text style={styles.markText}>
              {marks[node.id] != null
                ? `Marked ${marks[node.id]}° (tap to redo)`
                : "Mark: top of the printed plan is straight ahead"}
            </Text>
          </Pressable>
          <Text style={styles.readout} selectable>
            {PANORAMA_NODES.filter((n) => marks[n.id] != null)
              .map((n) => `${n.id.replace("delta-l2-", "")}: yaw ${marks[n.id]} → northOffset ${toNorthOffset(marks[n.id])}`)
              .join("\n") || "No marks yet"}
          </Text>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chips}
      >
        {PANORAMA_NODES.map((n) => (
          <Pressable
            key={n.id}
            onPress={() => setCurrentId(n.id)}
            style={[styles.chip, n.id === node.id && styles.chipActive]}
          >
            <Text style={[styles.chipText, n.id === node.id && styles.chipTextActive]}>
              {marks[n.id] != null ? "✓ " : ""}
              {n.floor} · {n.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingVertical: 10 },
  back: { color: "#fff", fontSize: 18 },
  titleBox: { flex: 1 },
  title: { color: "#fff", fontSize: 18, fontWeight: "600" },
  subtitle: { color: "#aaa", fontSize: 13 },
  viewer: { flex: 1, backgroundColor: "#000" },
  web: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { color: "#fff", fontSize: 16, marginBottom: 6 },
  muted: { color: "#aaa", fontSize: 13, textAlign: "center" },
  readout: { color: "#aaa", fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  calibrate: { paddingTop: 8 },
  markButton: { marginHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: "#1e6bd6", alignItems: "center" },
  markText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "#222" },
  chipActive: { backgroundColor: "#fff" },
  chipText: { color: "#ddd", fontSize: 14 },
  chipTextActive: { color: "#000", fontWeight: "600" },
});
