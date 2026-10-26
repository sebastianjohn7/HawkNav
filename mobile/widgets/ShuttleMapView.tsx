import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";

/** UHCL Bayou area — campus overview (same default as the Flutter ArcGIS map). */
export const UHCL_REGION = {
  latitude: 29.5775,
  longitude: -95.1037,
  latitudeDelta: 0.012,
  longitudeDelta: 0.012,
};

export type MapStop = {
  stop_id: string;
  name: string;
  lat: number;
  lng: number;
};

type Props = {
  shuttleLat?: number | null;
  shuttleLng?: number | null;
  stops?: MapStop[];
  selectedStopId?: string | null;
  /** Stop to frame. `focusNonce` changes on every tap, including a repeat tap. */
  focusStopId?: string | null;
  focusNonce?: number;
  /** Share of the map hidden by the open sidebar, measured from layout. */
  obscuredFraction?: number;
};

/** Standard campus map; plots the live shuttle when coords are present. */
export function ShuttleMapView({
  shuttleLat,
  shuttleLng,
  stops = [],
  selectedStopId,
  focusStopId,
  focusNonce = 0,
  obscuredFraction = 0,
}: Props) {
  const mapRef = useRef<MapView>(null);
  const hasShuttle =
    typeof shuttleLat === "number" &&
    typeof shuttleLng === "number" &&
    Number.isFinite(shuttleLat) &&
    Number.isFinite(shuttleLng);

  const lookingAtStop = focusNonce > 0;

  useEffect(() => {
    if (!hasShuttle || lookingAtStop || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: shuttleLat!,
        longitude: shuttleLng!,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      400,
    );
  }, [hasShuttle, shuttleLat, shuttleLng, lookingAtStop]);

  // Until a shuttle is plotting, frame the stop pins so they are on screen.
  useEffect(() => {
    if (hasShuttle || lookingAtStop || stops.length === 0 || !mapRef.current) {
      return;
    }
    mapRef.current.fitToCoordinates(
      stops.map((stop) => ({ latitude: stop.lat, longitude: stop.lng })),
      {
        edgePadding: { top: 80, right: 48, bottom: 220, left: 48 },
        animated: true,
      },
    );
  }, [hasShuttle, lookingAtStop, stops]);

  useEffect(() => {
    if (!focusStopId || focusNonce === 0 || !mapRef.current) return;
    const stop = stops.find((item) => item.stop_id === focusStopId);
    if (!stop) return;
    // Keep the zoom tight, then shift west so the pin sits in the strip
    // beside the sidebar instead of underneath it.
    const longitudeDelta = 0.006;
    const covered = Math.min(Math.max(obscuredFraction, 0), 1);
    const visibleCenter = covered + (1 - covered) / 2;
    mapRef.current.animateToRegion(
      {
        latitude: stop.lat,
        longitude: stop.lng + (0.5 - visibleCenter) * longitudeDelta,
        latitudeDelta: longitudeDelta,
        longitudeDelta,
      },
      450,
    );
  }, [focusStopId, focusNonce, obscuredFraction, stops]);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={UHCL_REGION}
        mapType="standard"
      >
        {stops.map((stop) => (
          <Marker
            key={stop.stop_id}
            coordinate={{ latitude: stop.lat, longitude: stop.lng }}
            title={stop.name}
            pinColor={stop.stop_id === selectedStopId ? "#1565C0" : "#C45C26"}
          />
        ))}
        {hasShuttle && (
          <Marker
            coordinate={{ latitude: shuttleLat!, longitude: shuttleLng! }}
            title="Shuttle"
            pinColor="#0B6E4F"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  map: { flex: 1 },
});
