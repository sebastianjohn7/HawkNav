import React, { useState } from "react";
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { PanoramaScreen } from "../PanoramaScreen";
import { panoramasForUnit, viewLabel } from "../../utils/panoramaLookup";

function ModalBody({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>{children}</View>;
}

/** The 360° viewer full screen over the map. Open when `nodeId` is set; `onClose` dismisses it. */
export function PanoramaModal({
  nodeId,
  allowedIds,
  onClose,
}: {
  nodeId: string | null;
  /** While a route is active: the only photos the viewer can move between. */
  allowedIds?: ReadonlySet<string> | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={nodeId !== null} animationType="slide" onRequestClose={onClose}>
      {/* A Modal is its own native window, so it needs its own safe-area provider and insets. */}
      <SafeAreaProvider>
        <ModalBody>
          {nodeId && <PanoramaScreen nodeId={nodeId} allowedIds={allowedIds} onBack={onClose} />}
        </ModalBody>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * "View in 360°" buttons for the map's location card: one per photo of the selected unit
 * (outside/hallway and inside the room), opening the viewer full screen. Renders nothing when
 * the unit has no photo.
 */
export default function PanoramaLinks({
  object,
  top = 100,
  allowedIds,
}: {
  object: GeoJSON.Feature;
  top?: number;
  /** While a route is active: only these photos get a button and can be walked to. */
  allowedIds?: ReadonlySet<string> | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const photos = panoramasForUnit(object.properties?.LEVEL_ID, object.properties?.NAME).filter(
    (p) => !allowedIds || allowedIds.has(p.id),
  );
  if (photos.length === 0) return null;

  return (
    <>
      <View style={[styles.box, { top: top + Dimensions.get("window").height * 0.17 + 6 }]}>
        {photos.map((p) => (
          <Pressable key={p.id} style={styles.button} onPress={() => setOpenId(p.id)}>
            <Text style={styles.buttonText}>360° · {viewLabel(p)}</Text>
          </Pressable>
        ))}
      </View>
      <PanoramaModal nodeId={openId} allowedIds={allowedIds} onClose={() => setOpenId(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  // Sits directly under the location card (height 17% of the screen); `top` is set at render.
  box: {
    position: "absolute",
    alignSelf: "center",
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
