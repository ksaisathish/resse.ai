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
import { useRef } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, createVisionPresenceChecker } from "@resse/presence";
import { BACKEND_ORIGIN } from "@/config";

export const ENABLE_FACE_PRESENCE = process.env.EXPO_PUBLIC_ENABLE_FACE_PRESENCE === "true";

export function PresenceTrigger({
  onPresent,
  intervalMs = 4000,
}: {
  onPresent: () => void;
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
