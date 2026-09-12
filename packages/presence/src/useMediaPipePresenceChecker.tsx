import { useCallback, useRef, useState } from "react";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
// See createVisionPresenceChecker.ts for why this is /legacy: SDK 54's
// expo-file-system root export dropped readAsStringAsync/EncodingType.
import * as FileSystem from "expo-file-system/legacy";
import { MEDIAPIPE_FACE_HTML } from "./mediapipeFaceHtml";
import type { PresenceChecker, PresenceCheckResult } from "./types";

interface PendingCheck {
  resolve: (result: PresenceCheckResult) => void;
  reject: (error: Error) => void;
}

export interface UseMediaPipePresenceCheckerResult {
  /** Pass this straight to useFacePresence's `checkPresence` option. */
  checkPresence: PresenceChecker;
  /** Render this once, anywhere in the tree (it's a hidden 1x1 WebView) —
   * checkPresence talks to it over postMessage, so it must be mounted before
   * any check runs. */
  element: React.ReactElement;
  /** True once the in-page MediaPipe model has finished loading. checkPresence
   * rejects while this is false. */
  isReady: boolean;
}

/**
 * On-device face detection via MediaPipe Tasks Vision, run inside a hidden
 * WebView (see mediapipeFaceHtml.ts) — no native module, so this stays Expo
 * Go compatible, and no per-frame network call, unlike
 * createVisionPresenceChecker's OpenAI round trip.
 *
 * Only one check runs at a time: checkPresence rejects if a previous check's
 * response hasn't come back yet, matching useFacePresence's own
 * one-check-per-interval-tick usage.
 */
export function useMediaPipePresenceChecker(): UseMediaPipePresenceCheckerResult {
  const webviewRef = useRef<WebView>(null);
  const pendingRef = useRef<PendingCheck | null>(null);
  const [isReady, setIsReady] = useState(false);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    let data: { type?: string; count?: number; error?: string };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (data.type === "ready") {
      setIsReady(true);
      return;
    }

    const pending = pendingRef.current;
    if (data.type === "result") {
      pendingRef.current = null;
      const count = typeof data.count === "number" && data.count >= 0 ? Math.floor(data.count) : 0;
      pending?.resolve({ count, present: count > 0 });
    } else if (data.type === "error") {
      pendingRef.current = null;
      pending?.reject(new Error(data.error ?? "MediaPipe presence check failed."));
    }
  }, []);

  const checkPresence: PresenceChecker = useCallback(
    async (photoUri: string) => {
      if (!isReady) {
        throw new Error("MediaPipe face detector is still loading — try again shortly.");
      }
      if (pendingRef.current) {
        throw new Error("A MediaPipe presence check is already in flight.");
      }

      const imageBase64 = await FileSystem.readAsStringAsync(photoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return new Promise<PresenceCheckResult>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        webviewRef.current?.postMessage(JSON.stringify({ type: "frame", imageBase64 }));
      });
    },
    [isReady],
  );

  const element = (
    <WebView
      ref={webviewRef}
      source={{ html: MEDIAPIPE_FACE_HTML }}
      onMessage={handleMessage}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      style={{ width: 1, height: 1, opacity: 0 }}
    />
  );

  return { checkPresence, element, isReady };
}
