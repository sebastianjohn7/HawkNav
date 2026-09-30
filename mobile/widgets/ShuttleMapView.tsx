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

type Props = {
  shuttleLat?: number | null;
  shuttleLng?: number | null;
};

/** Standard campus map; plots the live shuttle when coords are present. */
export function ShuttleMapView({ shuttleLat, shuttleLng }: Props) {
  const mapRef = useRef<MapView>(null);
  const hasShuttle =
    typeof shuttleLat === "number" &&
    typeof shuttleLng === "number" &&
    Number.isFinite(shuttleLat) &&
    Number.isFinite(shuttleLng);

  useEffect(() => {
    if (!hasShuttle || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: shuttleLat!,
        longitude: shuttleLng!,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      },
      400,
    );
  }, [hasShuttle, shuttleLat, shuttleLng]);

  return (
    <View style={styles.wrap}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={UHCL_REGION}
        mapType="standard"
      >
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
  wrap: {
    height: 220,
    borderRadius: 8,
    overflow: "hidden",
    marginHorizontal: 12,
    marginTop: 8,
  },
  map: { flex: 1 },
});
