/**
 * A standalone reachability check for the backend, independent of the
 * CopilotKit agent runtime. It fetches the backend's origin (not the
 * /api/mobile-copilotkit path itself) so a broken network/firewall/host
 * shows up immediately as its own card, instead of only surfacing once you
 * try to chat and get the generic "Could not reach the agent" error.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BACKEND_ORIGIN } from "@/config";
import { styles } from "@/styles";

type Status = "checking" | "connected" | "unreachable";

export function ConnectionStatus() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState<string>();

  const check = useCallback(async () => {
    setStatus("checking");
    setDetail(undefined);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(BACKEND_ORIGIN, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setStatus("connected");
    } catch (cause) {
      setStatus("unreachable");
      setDetail(
        cause instanceof Error && cause.name === "AbortError"
          ? "Timed out after 5s"
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <View style={styles.statusBar}>
      <View
        style={[
          styles.statusDot,
          status === "connected"
            ? styles.statusDotOk
            : status === "unreachable"
              ? styles.statusDotBad
              : null,
        ]}
      />
      <Text style={styles.statusText} numberOfLines={1}>
        {status === "checking"
          ? `Checking ${BACKEND_ORIGIN}…`
          : status === "connected"
            ? `Connected to ${BACKEND_ORIGIN}`
            : `Can't reach ${BACKEND_ORIGIN}${detail ? ` — ${detail}` : ""}`}
      </Text>
      {status !== "checking" ? (
        <Pressable onPress={() => void check()} hitSlop={8}>
          <Text style={styles.statusRetryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
