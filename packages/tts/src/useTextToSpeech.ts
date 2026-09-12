import { useCallback, useRef, useState } from "react";
import * as Speech from "expo-speech";
import { speakRealistic } from "./speakRealistic";
import type { UseTextToSpeechOptions, UseTextToSpeechResult } from "./types";

/**
 * Text-to-speech with a robotic/realistic flag.
 *
 * - "robotic" (default): expo-speech, free, on-device, works offline, Expo
 *   Go compatible out of the box. Sounds like a standard OS voice.
 * - "realistic": cloud-synthesized voice via a backend proxy (see
 *   apps/web/src/app/api/tts/route.ts, OpenAI TTS by default — a few dollars
 *   per million characters, cheap for kiosk-scale usage). Falls back to
 *   robotic automatically if the network call fails, so the avatar is never
 *   silent.
 */
export function useTextToSpeech(options: UseTextToSpeechOptions = {}): UseTextToSpeechResult {
  const { mode = "robotic", onStart, onDone, onError, onFallback, ...config } = options;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Set while realistic playback is in flight. Speech.stop() only knows
  // about expo-speech, so without this handle a stop() in realistic mode
  // would flip isSpeaking to false while the cloud audio kept playing.
  const cancelRealistic = useRef<(() => void) | null>(null);

  const speak = useCallback(
    async (text: string) => {
      setIsSpeaking(true);
      if (modeRef.current === "robotic") {
        await new Promise<void>((resolve) => {
          Speech.speak(text, {
            voice: config.voice,
            onStart: () => onStart?.(),
            onDone: () => {
              onDone?.();
              resolve();
            },
            onStopped: () => resolve(),
            onError: (error) => {
              onError?.(error instanceof Error ? error : new Error(String(error)));
              resolve();
            },
          });
        });
        setIsSpeaking(false);
        return;
      }

      try {
        await speakRealistic(text, config, {
          onStart,
          onDone,
          onController: (controller) => {
            cancelRealistic.current = controller.cancel;
          },
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onFallback?.(err);
        // Fall back to robotic so the receptionist is never silent.
        await new Promise<void>((resolve) => {
          Speech.speak(text, {
            onStart,
            onDone: () => {
              onDone?.();
              resolve();
            },
            onStopped: () => resolve(),
            onError: () => resolve(),
          });
        });
      } finally {
        cancelRealistic.current = null;
        setIsSpeaking(false);
      }
    },
    [config, onStart, onDone, onError, onFallback]
  );

  const stop = useCallback(() => {
    Speech.stop();
    cancelRealistic.current?.();
    cancelRealistic.current = null;
    setIsSpeaking(false);
  }, []);

  return { isSpeaking, speak, stop };
}
