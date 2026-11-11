import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { PanoramaScreen } from "./PanoramaScreen";

/** Standalone root for trying the 360 viewer: EXPO_PUBLIC_PANORAMA_DEMO=1 npx expo start */
export default function PanoramaDemo() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar style="light" />
        <PanoramaScreen calibrate />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
