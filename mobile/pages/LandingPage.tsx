import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  onGetStarted: () => void;
};

export function LandingPage({ onGetStarted }: Props) {
  const { width, height } = useWindowDimensions();

  return (
    <View style={styles.root}>
      <View style={{ height: height / 5 }} />
      <Image
        source={require("../assets/img/odyssey.jpg")}
        style={{
          width: width * 0.9,
          height: width * 0.9,
          alignSelf: "center",
        }}
        resizeMode="contain"
      />
      <View style={{ height: height / 15 }} />
      <Pressable
        style={[styles.cta, { width: width * 0.85 }]}
        onPress={onGetStarted}
      >
        <Text style={styles.ctaText}>Get Started</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  cta: {
    height: 60,
    backgroundColor: "#BBDEFB",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#90CAF9",
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
