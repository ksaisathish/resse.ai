/**
 * A small animated badge showing mic state: a pulsing red dot while
 * actively listening, a solid amber dot while transcribing/thinking, and a
 * brief green "Got it" confirmation for ~1.4s right after it stops — so
 * stopping is an event you actually see, not just the badge silently
 * vanishing. Used by both chat.tsx (alongside the manual mic button) and
 * receptionist-screen.tsx (where there's no button at all, so this is the
 * only listening feedback that exists).
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Text, View } from "react-native";
import { C, styles } from "@/styles";

export type ListeningStatus = "idle" | "listening" | "thinking";

export function ListeningIndicator({ status }: { status: ListeningStatus }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const [justStopped, setJustStopped] = useState(false);
  const wasListening = useRef(false);

  useEffect(() => {
    if (status !== "listening") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  useEffect(() => {
    if (wasListening.current && status !== "listening") {
      setJustStopped(true);
      const timer = setTimeout(() => setJustStopped(false), 1400);
      wasListening.current = false;
      return () => clearTimeout(timer);
    }
    wasListening.current = status === "listening";
  }, [status]);

  if (status === "idle" && !justStopped) return null;

  const label =
    status === "listening" ? "Listening…" : status === "thinking" ? "Thinking…" : "Got it ✓";
  const dotColor = status === "listening" ? C.danger : status === "thinking" ? C.amber : C.accent;

  return (
    <View style={[styles.presenceBadge, styles.listeningBadgeRow]}>
      <Animated.View
        style={[styles.listeningDot, { backgroundColor: dotColor, opacity: status === "listening" ? pulse : 1 }]}
      />
      <Text style={styles.presenceBadgeText}>{label}</Text>
    </View>
  );
}
