import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text } from "react-native";

export interface ToolCallStatusBannerProps {
  /** The current status label to show, or null/undefined to hide the banner. */
  label?: string | null;
  /** Slide/fade duration in ms. Defaults to 180. */
  animationDurationMs?: number;
}

/**
 * A slim status banner for "the receptionist is doing something" moments —
 * mount it once near the top of your chat/kiosk screen and drive it with a
 * single `label` string derived from in-flight tool calls (see README for
 * exactly how to compute that from CopilotKit's message/toolCall shapes).
 * Renders nothing when `label` is null/undefined; animates in/out on change.
 */
export function ToolCallStatusBanner({ label, animationDurationMs = 180 }: ToolCallStatusBannerProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const [mountedLabel, setMountedLabel] = React.useState<string | null>(label ?? null);

  useEffect(() => {
    if (label) {
      setMountedLabel(label);
      Animated.timing(progress, {
        toValue: 1,
        duration: animationDurationMs,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: animationDurationMs,
        useNativeDriver: true,
      }).start(() => setMountedLabel(null));
    }
  }, [label, animationDurationMs, progress]);

  if (!mountedLabel) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [-12, 0],
              }),
            },
          ],
        },
      ]}
    >
      <ActivityIndicator size="small" color="#2f6fed" />
      <Text style={styles.text}>{mountedLabel}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#eaf0fe",
  },
  text: {
    fontSize: 13,
    color: "#2f4b8f",
    fontWeight: "500",
  },
});
