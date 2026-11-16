import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

type Props = {
  /** Mount Sign In underneath so the black veil can fade over it. */
  onReveal: () => void;
  /** Unmount the intro after the black fade finishes. */
  onFinished: () => void;
};

/**
 * Intro: hawk flies in → title below → title fades → hawk fades →
 * black veil fades out over Sign In (veil only — not the whole screen tree).
 */
export function LandingPage({ onReveal, onFinished }: Props) {
  const { width, height } = useWindowDimensions();
  const reveal = useRef(onReveal);
  const finish = useRef(onFinished);
  reveal.current = onReveal;
  finish.current = onFinished;

  const hawkX = useRef(new Animated.Value(width * 0.85)).current;
  const hawkY = useRef(new Animated.Value(-height * 0.2)).current;
  const hawkOpacity = useRef(new Animated.Value(0)).current;
  const hawkScale = useRef(new Animated.Value(0.65)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(16)).current;
  // Fade this veil only — keeps a solid black plane, then reveals Sign In evenly.
  const veilOpacity = useRef(new Animated.Value(1)).current;
  const done = useRef(false);

  const hawkSize = Math.min(width * 0.72, 320);

  useEffect(() => {
    const anim = Animated.sequence([
      // 1. Hawk flies in.
      Animated.parallel([
        Animated.timing(hawkOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(hawkX, {
          toValue: 0,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(hawkY, {
          toValue: 0,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(hawkScale, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(280),
      // 2. Title appears below the hawk.
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(titleY, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(700),
      // 3. Title fades away.
      Animated.timing(titleOpacity, {
        toValue: 0,
        duration: 650,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(200),
      // 4. Hawk slowly fades.
      Animated.timing(hawkOpacity, {
        toValue: 0,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.delay(150),
    ]);

    anim.start(({ finished: ok }) => {
      if (!ok || done.current) return;
      // Sign In is full-screen white underneath; fade the black veil only.
      reveal.current();
      Animated.timing(veilOpacity, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished: faded }) => {
        if (faded && !done.current) {
          done.current = true;
          finish.current();
        }
      });
    });

    return () => anim.stop();
  }, [
    hawkOpacity,
    hawkScale,
    hawkX,
    hawkY,
    titleOpacity,
    titleY,
    veilOpacity,
  ]);

  return (
    <View
      style={styles.root}
      accessibilityLabel="HawkNav intro"
      pointerEvents="auto"
    >
      <StatusBar style="light" />
      <Animated.View
        style={[styles.veil, { opacity: veilOpacity }]}
        pointerEvents="none"
      />
      <View style={styles.stage} pointerEvents="none">
        {/* Only the hawk is flex-centered; title hangs below so it doesn't push the hawk up. */}
        <View style={{ width: hawkSize, height: hawkSize }}>
          <Animated.View
            style={[
              styles.hawkWrap,
              {
                width: hawkSize,
                height: hawkSize,
                opacity: hawkOpacity,
                transform: [
                  { translateX: hawkX },
                  { translateY: hawkY },
                  { scale: hawkScale },
                ],
              },
            ]}
          >
            <Image
              source={require("../assets/img/hawk_full_color.png")}
              style={{ width: hawkSize, height: hawkSize }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.titleWrap,
              {
                top: hawkSize + 16,
                width,
                left: -(width - hawkSize) / 2,
                opacity: titleOpacity,
                // Small X nudge offsets skew so the wordmark still reads centered.
                transform: [
                  { translateY: titleY },
                  { translateX: 10 },
                  { skewX: "-8deg" },
                ],
              },
            ]}
          >
            <Text style={styles.title} accessibilityRole="header">
              <Text style={styles.brandHawk}>Hawk</Text>
              <Text style={styles.brandNav}>Nav</Text>
            </Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  veil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  hawkWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  // Athletic UHCL-style wordmark: heavy, tight, slight lean.
  title: {
    fontFamily: "DMSans_900Black",
    fontSize: 56,
    letterSpacing: -2.2,
    textAlign: "center",
  },
  brandHawk: { color: "#1565C0" },
  brandNav: { color: "#43A047" },
});
