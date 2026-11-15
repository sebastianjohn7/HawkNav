import { useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
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
  /** Name shown to visitors (header and marker labels); falls back to label. */
  title?: string;
  image: string;
  preview: string;
  /** NAMEs of the floor plan units this photo stands for (rooms, stairs, elevators). */
  floorPlanRef: string[];
  lat: number | null;
  lng: number | null;
  northOffset: number | null;
  /** Neighbouring photos: yaw/pitch are where the marker sits in THIS photo. */
  links: { to: string; yaw: number; pitch?: number; label?: string }[];
};

export const PANORAMA_NODES = (panoramaData.nodes as unknown as PanoramaNode[])
  .filter((n) => panoramaImages[n.id])
  .sort((a, b) => a.floor - b.floor || a.label.localeCompare(b.label, undefined, { numeric: true }));

type Props = {
  /** Node to open first; defaults to the first one. */
  nodeId?: string;
  onBack?: () => void;
  /**
   * When set, only these photos can be reached: links to any other photo are hidden. Used while a
   * route is active so the viewer can't wander off the route.
   */
  allowedIds?: ReadonlySet<string> | null;
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
      // The dev server (especially over a tunnel) sometimes drops an asset download; retry before giving up.
      let asset = Asset.fromModule(assetModule);
      for (let attempt = 1; ; attempt++) {
        try {
          asset = await asset.downloadAsync();
          break;
        } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, 600 * attempt));
        }
      }
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

/** A marker pinned on the photo that leads to a neighbouring photo. yaw/pitch are viewer angles in this photo. */
type Hotspot = { to: string; label: string; yaw: number; pitch: number };

const isRoomPhoto = (id: string) => id.includes("-room-");

function buildHtml(preview: string, image: string, yaw: number, hotspots: Hotspot[]): string {
  const js = PANNELLUM_JS.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${PANNELLUM_CSS}
html,body,#p{margin:0;width:100%;height:100%;background:#000;overflow:hidden}
.hs{width:0;height:0}
.hs .dot{position:absolute;left:-26px;top:-26px;width:52px;height:52px;box-sizing:border-box;border-radius:50%;
background:rgba(30,107,214,.88);border:3px solid #fff;color:#fff;font:700 30px/44px sans-serif;text-align:center;
box-shadow:0 0 0 0 rgba(255,255,255,.7);animation:pulse 1.8s infinite}
.hs .lbl{position:absolute;left:-90px;width:180px;top:32px;text-align:center;color:#fff;background:rgba(0,0,0,.72);
border-radius:12px;padding:5px 8px;font:600 15px sans-serif;display:none}
.hs.near .lbl{display:block}
@keyframes pulse{70%{box-shadow:0 0 0 14px rgba(255,255,255,0)}100%{box-shadow:0 0 0 0 rgba(255,255,255,0)}}
</style>
</head><body><div id="p"></div>
<script>${js}</script>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
try{
var els={}, data={};
function mk(div,h){
  div.className+=' hs';
  div.innerHTML='<div class="dot">&#8250;</div><div class="lbl"></div>';
  div.querySelector('.lbl').textContent=h.label;
  els[h.to]=div;
}
function spot(h){
  data[h.to]=h;
  return {id:h.to,pitch:h.pitch,yaw:h.yaw,type:'custom',cssClass:'hs',createTooltipFunc:mk,createTooltipArgs:h,
    clickHandlerFunc:function(e,a){post({type:'goto',id:a.to,yaw:v.getYaw()})},clickHandlerArgs:h};
}
var v=pannellum.viewer('p',{type:'equirectangular',panorama:${JSON.stringify(image)},preview:${JSON.stringify(preview)},
autoLoad:true,yaw:${yaw},pitch:0,hfov:100,minHfov:50,maxHfov:120,minPitch:-75,showControls:false,compass:false,
hotSpots:${JSON.stringify(hotspots)}.map(spot)});
window.updateSpot=function(h){v.removeHotSpot(h.to);v.addHotSpot(spot(h))};
window.placing=null;
var down=null;
document.addEventListener('pointerdown',function(e){down={x:e.clientX,y:e.clientY,t:Date.now()}});
document.addEventListener('pointerup',function(e){
  if(!down||!window.placing)return;
  if(Math.hypot(e.clientX-down.x,e.clientY-down.y)<10&&Date.now()-down.t<500){
    var c=v.mouseEventToCoords({clientX:e.clientX,clientY:e.clientY});
    post({type:'place',to:window.placing,pitch:Math.round(c[0]),yaw:Math.round(c[1])});
  }
  down=null;
});
function diff(a,b){var d=((a-b+540)%360)-180;return Math.abs(d)}
var last=null;
v.on('load',function(){post({type:'load'})});
v.on('error',function(e){post({type:'error',message:String(e)})});
setInterval(function(){
  var y=v.getYaw(),p=Math.round(v.getPitch()),ry=Math.round(y);
  if(ry!==last){last=ry;post({type:'yaw',yaw:ry,pitch:p})}
  var best=null,bd=28;for(var id in els){var h=data[id];if(h){var d=diff(y,h.yaw);if(d<bd){bd=d;best=id}}}
  for(var id in els)els[id].classList.toggle('near',id===best)
},250);
}catch(e){post({type:'error',message:String(e)})}
</script></body></html>`;
}

export function PanoramaScreen({ nodeId, onBack, calibrate, allowedIds }: Props) {
  const [currentId, setCurrentId] = useState(nodeId ?? PANORAMA_NODES[0]?.id);
  const [marks, setMarks] = useState<Record<string, number>>({});
  // Calibrate mode: link positions placed by hand, keyed "from>to".
  const [linkMarks, setLinkMarks] = useState<Record<string, { yaw: number; pitch: number }>>({});
  const [activeLink, setActiveLink] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const web = useRef<ComponentRef<typeof WebView>>(null);
  // Where to start looking in the next photo, so a tap keeps the direction you were facing.
  const startYaw = useRef<number | null>(null);

  const node = useMemo(() => PANORAMA_NODES.find((n) => n.id === currentId), [currentId]);

  const hotspots = useMemo<Hotspot[]>(() => {
    if (!node) return [];
    const out: Hotspot[] = [];
    for (const l of node.links ?? []) {
      if (allowedIds && !allowedIds.has(l.to)) continue;
      const target = PANORAMA_NODES.find((n) => n.id === l.to);
      if (!target) continue;
      const label = l.label
        ? l.label
        : isRoomPhoto(node.id) && !isRoomPhoto(target.id)
          ? "Hallway outside"
          : (target.title ?? target.label);
      out.push({ to: l.to, label, yaw: l.yaw, pitch: l.pitch ?? 0 });
    }
    return out;
  }, [node, allowedIds]);

  useEffect(() => {
    if (!node) return;
    let cancelled = false;
    setHtml(null);
    setLoaded(false);
    setError(null);
    setActiveLink(null);
    const start = startYaw.current ?? node.northOffset ?? 0;
    startYaw.current = null;
    setYaw(start);
    const files = panoramaImages[node.id];
    Promise.all([toDataUri(files.preview), toDataUri(files.image)])
      .then(([preview, image]) => {
        if (!cancelled) setHtml(buildHtml(preview, image, start, hotspots));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [node, hotspots]);

  function goTo(id: string, fromYaw: number) {
    const to = PANORAMA_NODES.find((n) => n.id === id);
    if (node && to && node.northOffset != null && to.northOffset != null) {
      // Same compass heading in the next photo: heading = yaw - northOffset.
      startYaw.current = Math.round(fromYaw - node.northOffset + to.northOffset);
    }
    setCurrentId(id);
  }

  function onMessage(event: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "load") setLoaded(true);
      else if (msg.type === "yaw") {
        setYaw(msg.yaw);
        setPitch(msg.pitch ?? 0);
      } else if (msg.type === "goto" && !calibrate) goTo(msg.id, msg.yaw);
      else if (msg.type === "place" && calibrate) placeLink(msg.to, { yaw: msg.yaw, pitch: msg.pitch });
      else if (msg.type === "error") setError(msg.message);
    } catch {
      // Ignore anything the viewer did not send.
    }
  }

  function selectLink(to: string | null) {
    setActiveLink(to);
    web.current?.injectJavaScript(`window.placing=${JSON.stringify(to)};true;`);
  }

  function placeLink(to: string, spot: { yaw: number; pitch: number }) {
    if (!node) return;
    setLinkMarks((m) => ({ ...m, [`${node.id}>${to}`]: spot }));
    selectLink(null);
    const h = hotspots.find((x) => x.to === to);
    if (h) web.current?.injectJavaScript(`window.updateSpot(${JSON.stringify({ ...h, ...spot })});true;`);
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
          <Text style={styles.title}>{node.title ?? node.label}</Text>
          <Text style={styles.subtitle}>
            {node.building} · Floor {node.floor}
          </Text>
        </View>
      </View>

      <View style={styles.viewer}>
        {html && !error && (
          <WebView
            ref={web}
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

      {calibrate && (
        <>
          <Text style={styles.readout} selectable>
            yaw {yaw}° pitch {pitch}° · northOffset in panorama_nodes.json: {node.northOffset ?? "not set"}
          </Text>
          <View style={styles.calibrate}>
            <Pressable style={styles.markButton} onPress={() => setMarks((m) => ({ ...m, [node.id]: yaw }))}>
              <Text style={styles.markText}>
                {marks[node.id] != null
                  ? `Marked ${marks[node.id]}° (tap to redo)`
                  : "Mark: top of the printed plan is straight ahead"}
              </Text>
            </Pressable>
            {hotspots.length > 0 && (
              <View style={styles.linkRow}>
                {hotspots.map((h) => {
                  const placed = linkMarks[`${node.id}>${h.to}`];
                  const on = activeLink === h.to;
                  return (
                    <Pressable
                      key={h.to}
                      onPress={() => selectLink(on ? null : h.to)}
                      style={[styles.linkChip, on && styles.linkChipOn, placed && styles.linkChipDone]}
                    >
                      <Text style={styles.chipText}>
                        {on ? "Tap the photo where it goes: " : placed ? "✓ " : ""}
                        {h.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.readout} selectable>
              {[
                ...PANORAMA_NODES.filter((n) => marks[n.id] != null).map(
                  (n) => `${n.id}: yaw ${marks[n.id]} → northOffset ${toNorthOffset(marks[n.id])}`,
                ),
                ...Object.entries(linkMarks).map(([k, v]) => `link ${k}: yaw ${v.yaw} pitch ${v.pitch}`),
              ].join("\n") || "No marks yet"}
            </Text>
          </View>
        </>
      )}

      {calibrate && (
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
      )}
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
  linkRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  linkChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "#333" },
  linkChipOn: { backgroundColor: "#1e6bd6" },
  linkChipDone: { backgroundColor: "#1f6f3a" },
  chipScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: "#222" },
  chipActive: { backgroundColor: "#fff" },
  chipText: { color: "#ddd", fontSize: 14 },
  chipTextActive: { color: "#000", fontWeight: "600" },
});
