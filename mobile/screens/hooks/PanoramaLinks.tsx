import React, { useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { PanoramaScreen } from "../PanoramaScreen";
import { panoramasForUnit, viewLabel } from "../../utils/panoramaLookup";

function ModalBody({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>{children}</View>;
}

/**
 * "View in 360°" buttons for the map's location card: one per photo of the selected unit
 * (outside/hallway and inside the room), opening the viewer full screen. Renders nothing when
 * the unit has no photo.
 */
export default function PanoramaLinks({ object }: { object: GeoJSON.Feature }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const photos = panoramasForUnit(object.properties?.LEVEL_ID, object.properties?.NAME);
  if (photos.length === 0) return null;

  return (
    <>
      <View style={styles.box}>
        {photos.map((p) => (
          <Pressable key={p.id} style={styles.button} onPress={() => setOpenId(p.id)}>
            <Text style={styles.buttonText}>360° · {viewLabel(p)}</Text>
          </Pressable>
        ))}
      </View>
      <Modal visible={openId !== null} animationType="slide" onRequestClose={() => setOpenId(null)}>
        {/* A Modal is its own native window, so it needs its own safe-area provider and insets. */}
        <SafeAreaProvider>
          <ModalBody>
            {openId && <PanoramaScreen nodeId={openId} onBack={() => setOpenId(null)} />}
          </ModalBody>
        </SafeAreaProvider>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Sits directly under the location card (top 100, height 17% of the screen).
  box: {
    position: "absolute",
    alignSelf: "center",
    top: 100 + Dimensions.get("window").height * 0.17 + 6,
    right: 10,
    width: "55%",
    gap: 6,
    zIndex: 999,
    elevation: 50,
  },
  button: {
    backgroundColor: "#1D4ED8",
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  buttonText: { color: "white", fontWeight: "600", fontSize: 12 },
  modal: { flex: 1, backgroundColor: "#000" },
});
