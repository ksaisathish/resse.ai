import { useCallback, useMemo, useRef, useState } from "react";
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

// Module constants, not inline literals: a new object identity for `source`
// makes react-native-webview reload the document, which here means
// re-downloading and re-initializing the whole MediaPipe runtime.
const MEDIAPIPE_SOURCE = { html: MEDIAPIPE_FACE_HTML } as const;
const ORIGIN_WHITELIST = ["*"];
const HIDDEN_WEBVIEW_STYLE = { width: 1, height: 1, opacity: 0 } as const;

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

  // Memoized as a whole, with `source` and `style` hoisted to module
  // constants. react-native-webview treats a new `source` object as a new
  // document and reloads the page — so rebuilding this inline on every
  // render of the host screen made the WebView tear down and re-fetch the
  // MediaPipe WASM bundle and model continuously. That showed up as the
  // kiosk flickering, `isReady` flapping back to false mid-conversation,
  // and presence checks rejecting with "detector is still loading".
  const element = useMemo(
    () => (
      <WebView
        ref={webviewRef}
        source={MEDIAPIPE_SOURCE}
        onMessage={handleMessage}
        originWhitelist={ORIGIN_WHITELIST}
        javaScriptEnabled
        domStorageEnabled
        // A zero-size WebView is skipped/suspended on some Android builds,
        // so it stays 1x1 and fully transparent rather than `display: none`.
        style={HIDDEN_WEBVIEW_STYLE}
      />
    ),
    [handleMessage],
  );

  return { checkPresence, element, isReady };
}
