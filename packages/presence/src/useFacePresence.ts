import { useCallback, useEffect, useRef, useState } from "react";
import type { CameraView } from "expo-camera";
import type { UseFacePresenceOptions, UseFacePresenceResult } from "./types";

/**
 * Periodically captures a low-res frame from an expo-camera CameraView and
 * hands it to a pluggable `checkPresence` function. This package owns the
 * Expo-Go-compatible part (camera capture); it deliberately does NOT ship a
 * built-in face detector — see README for why, and for the recommended
 * `checkPresence` implementations (vision-LLM confirm, motion heuristic).
 */
export function useFacePresence(
  cameraRef: React.RefObject<CameraView | null>,
  options: UseFacePresenceOptions
): UseFacePresenceResult {
  const { intervalMs = 2500, checkPresence, onPresent, onAbsent, onError } = options;
  const [isPresent, setIsPresent] = useState(false);
  const [count, setCount] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wasPresent = useRef(false);

  const runCheck = useCallback(async () => {
    if (!cameraRef.current) return;
    setIsChecking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.2,
        skipProcessing: true,
        shutterSound: false,
      });
      if (!photo?.uri) return;
      const result = await checkPresence(photo.uri);
      setIsPresent(result.present);
      setCount(result.count);
      if (result.present && !wasPresent.current) onPresent?.();
      if (!result.present && wasPresent.current) onAbsent?.();
      wasPresent.current = result.present;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsChecking(false);
    }
  }, [cameraRef, checkPresence, onPresent, onAbsent, onError]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => void runCheck(), intervalMs);
    void runCheck();
    return () => clearInterval(id);
  }, [isActive, intervalMs, runCheck]);

  const start = useCallback(() => setIsActive(true), []);
  const stop = useCallback(() => {
    setIsActive(false);
    setIsPresent(false);
    setCount(0);
    wasPresent.current = false;
  }, []);

  return { isPresent, count, isChecking, start, stop };
}
