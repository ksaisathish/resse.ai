/**
 * Optional, flag-gated: notices someone is in front of the camera and starts
 * listening automatically instead of requiring a press-and-hold on the mic
 * button. Off by default.
 *
 * Detection runs fully on-device via MediaPipe (in a hidden WebView — see
 * packages/presence/src/mediapipeFaceHtml.ts), not a per-frame OpenAI vision
 * call: no network round trip and no per-check cost, at the cost of needing
 * the WebView's WASM runtime to spin up once on mount (see `isReady`).
 *
 * Known limitation: there's no voice-activity-detection here, so once
 * presence triggers listening it auto-stops after a fixed window
 * (`autoStopMs`) rather than detecting when the person stops talking. A
 * press-and-hold mic button (see chat.tsx) remains the reliable path; this
 * is a rough hands-free approximation on top of it.
 */
import { useEffect, useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, useMediaPipePresenceChecker } from "@resse/presence";

// Global opt-in for surfaces that only want presence as an occasional
// convenience (kept for the plain Chat screen, or anywhere the cost of an
// always-on vision call isn't wanted by default). The Receptionist screen
// doesn't gate on this — hands-free presence detection is that screen's
// whole purpose, not an optional extra.
export const ENABLE_FACE_PRESENCE = process.env.EXPO_PUBLIC_ENABLE_FACE_PRESENCE === "true";

export function PresenceTrigger({
  onPresent,
  onCountChange,
  intervalMs = 4000,
}: {
  onPresent: () => void;
  /** Fires with the latest head-count on every check, not just on the
   * present/absent edge — use this to drive a live "N detected" display. */
  onCountChange?: (count: number) => void;
  intervalMs?: number;
}) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const { checkPresence, element: mediaPipeWebView, isReady: modelReady } = useMediaPipePresenceChecker();

  const presence = useFacePresence(cameraRef, {
    checkPresence,
    intervalMs,
    onPresent,
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
        style={{ width: 1, height: 1, opacity: 0 }}
        onCameraReady={() => setCameraReady(true)}
      />
    </>
  );
}
