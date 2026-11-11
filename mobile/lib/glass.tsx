import { type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ColorValue,
} from "react-native";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";

/** Soft white wash for map chrome (toggle, sidebars, handles). */
export const GLASS_WHITE_TINT = "rgba(255, 255, 255, 0.45)";

/** Real Liquid Glass only when the binary + device both support it (iOS 26+). */
export function canUseLiquidGlass(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/** Circular control — GlassView on iOS 26+, plain circle otherwise. */
export function GlassCircleButton({
  children,
  onPress,
  disabled,
  accessibilityLabel,
  size = 36,
  /** Soft color wash on Liquid Glass (iOS 26+ only). */
  tintColor,
}: {
  children: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  size?: number;
  tintColor?: ColorValue;
}) {
  const liquidGlass = canUseLiquidGlass();
  const circleStyle = [
    styles.circle,
    { width: size, height: size, borderRadius: size / 2 },
  ];
  const hit = (
    <Pressable
      style={styles.hit}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </Pressable>
  );

  if (liquidGlass) {
    return (
      <GlassView
        style={circleStyle}
        glassEffectStyle="regular"
        isInteractive
        tintColor={tintColor}
      >
        {hit}
      </GlassView>
    );
  }

  return (
    <View
      style={[circleStyle, styles.circleFallback, disabled && styles.circleOff]}
    >
      {hit}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: "center",
    justifyContent: "center",
  },
  circleFallback: {
    backgroundColor: "#eceff1",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  circleOff: { opacity: 0.45 },
  hit: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
});
