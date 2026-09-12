/**
 * Notices someone is in front of the camera and starts listening
 * automatically instead of requiring a press-and-hold on the mic button.
 * Renders a small visible front-camera preview (video-call self-view style)
 * rather than a hidden capture-only view — partly so the person can see
 * they're in frame, partly so it's obvious at a glance which camera is
 * active and that frames are actually being captured.
 *
 * Detection runs fully on-device via MediaPipe (in a hidden WebView — see
 * packages/presence/src/mediapipeFaceHtml.ts), not a per-frame OpenAI vision
 * call: no network round trip and no per-check cost, at the cost of needing
 * the WebView's WASM runtime to spin up once on mount (see `modelReady`).
 *
 * Known limitation: there's no voice-activity-detection here, so once
 * presence triggers listening it auto-stops after a fixed window
 * (`autoStopMs`) rather than detecting when the person stops talking. A
 * press-and-hold mic button (see chat.tsx) remains the reliable path; this
 * is a rough hands-free approximation on top of it.
 */
import { useEffect, useRef, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, useMediaPipePresenceChecker } from "@resse/presence";
import { styles } from "@/styles";

export function PresenceTrigger({
  onPresent,
  onAbsent,
  onCountChange,
  onError,
  intervalMs = 4000,
  paused = false,
  style,
}: {
  onPresent: () => void;
  /** Fires on the present -> absent edge, i.e. whoever was standing here
   * has walked off. The hands-free screen uses this to end the current
   * conversation rather than keeping a follow-up mic window open for
   * someone who already left. */
  onAbsent?: () => void;
  /** Fires with the latest head-count on every check, not just on the
   * present/absent edge — use this to drive a live "N detected" display. */
  onCountChange?: (count: number) => void;
  /** Every check failure was previously silently swallowed (no onError was
   * ever passed to useFacePresence), which is exactly why a broken vision
   * call showed up as "count stuck at 0" with no visible cause. Wire this up
   * to your screen's error display. */
  onError?: (error: Error) => void;
  intervalMs?: number;
  /** Suspends capture while the screen is mid-interaction (someone is
   * talking to it, or an approval card is waiting on a tap) — a capture
   * then can only burn battery and re-render the UI under the person. */
  paused?: boolean;
  /** Overrides the default bottom-right video-call-style preview position/size. */
  style?: StyleProp<ViewStyle>;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const { checkPresence, element: mediaPipeWebView, isReady: modelReady } = useMediaPipePresenceChecker();

  const presence = useFacePresence(cameraRef, {
    checkPresence,
    intervalMs,
    paused,
    onPresent,
    onAbsent,
    onError,
  });
  const { start, count } = presence;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  // Only start the capture loop once BOTH the camera and the in-page
  // MediaPipe model are ready — starting earlier just means the first few
  // checkPresence calls reject while the model finishes loading.
  useEffect(() => {
    if (cameraReady && modelReady) start();
  }, [cameraReady, modelReady, start]);

  if (!permission?.granted) {
    void requestPermission();
    return null;
  }

  return (
    <>
      {mediaPipeWebView}
      <CameraView
        ref={cameraRef}
        facing="front"
        mirror
        style={[styles.presencePreview, style]}
        onCameraReady={() => setCameraReady(true)}
      />
    </>
  );
}
