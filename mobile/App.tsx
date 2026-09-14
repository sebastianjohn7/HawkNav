import { useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DriverScreen } from "./screens/DriverScreen";
import { RiderScreen } from "./screens/RiderScreen";

type Mode = "rider" | "driver";

export default function App() {
  const [mode, setMode] = useState<Mode>("rider");

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, mode === "rider" && styles.tabOn]}
          onPress={() => setMode("rider")}
        >
          <Text style={styles.tabText}>Rider</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === "driver" && styles.tabOn]}
          onPress={() => setMode("driver")}
        >
          <Text style={styles.tabText}>Driver</Text>
        </Pressable>
      </View>
      {mode === "rider" ? <RiderScreen /> : <DriverScreen />}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  tabs: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 8, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  tabOn: { backgroundColor: "#cfe8dc" },
  tabText: { fontWeight: "600" },
});
