/**
 * Optional, flag-gated: notices someone is in front of the camera and starts
 * listening automatically instead of requiring a press-and-hold on the mic
 * button. Off by default — see packages/presence/README.md for why this
 * isn't a real on-device face detector (Expo Go has no native face-detection
 * module) and what it costs to run: a cloud vision call every `intervalMs`.
 *
 * Known limitation: there's no voice-activity-detection here, so once
 * presence triggers listening it auto-stops after a fixed window
 * (`autoStopMs`) rather than detecting when the person stops talking. A
 * press-and-hold mic button (see chat.tsx) remains the reliable path; this
 * is a rough hands-free approximation on top of it.
 */
import { useEffect, useRef } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, createVisionPresenceChecker } from "@resse/presence";
import { BACKEND_ORIGIN } from "@/config";

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
  // Created once, not per-render — useFacePresence's interval restarts
  // whenever `checkPresence` changes identity.
  const checkPresenceRef = useRef(createVisionPresenceChecker({ baseUrl: BACKEND_ORIGIN }));

  const presence = useFacePresence(cameraRef, {
    checkPresence: checkPresenceRef.current,
    intervalMs,
    onPresent,
  });

  useEffect(() => {
    onCountChange?.(presence.count);
  }, [presence.count, onCountChange]);

  if (!permission?.granted) {
    void requestPermission();
    return null;
  }

  return (
    <CameraView
      ref={cameraRef}
      style={{ width: 1, height: 1, opacity: 0 }}
      onCameraReady={presence.start}
    />
  );
}
