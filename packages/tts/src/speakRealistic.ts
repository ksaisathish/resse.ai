// SDK 54's expo-file-system root export is the new Paths/File/Directory API;
// cacheDirectory/writeAsStringAsync/EncodingType still exist, but only under
// the /legacy subpath.
import * as FileSystem from "expo-file-system/legacy";
import { createAudioPlayer } from "expo-audio";
import type { TextToSpeechConfig } from "./types";

function resolveUrl({ endpoint, baseUrl }: TextToSpeechConfig): string {
  const path = endpoint ?? "/api/tts";
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) {
    throw new Error(
      "@resse/tts: `endpoint` is relative but no `baseUrl` was provided. Pass baseUrl or an absolute endpoint."
    );
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/** Handed to the caller so playback already in flight can be cut short —
 * expo-audio plays through its own player here, which `Speech.stop()` has no
 * knowledge of, so without this a "stop talking" control silently does
 * nothing in realistic mode. */
export interface RealisticSpeechController {
  /** Stops playback and resolves the pending speakRealistic() promise. */
  cancel: () => void;
}

/**
 * Calls the backend TTS proxy, writes the returned audio to a temp file
 * (expo-audio plays from a file/URI source, not raw bytes), and plays it.
 * Resolves once playback finishes or is cancelled.
 */
export async function speakRealistic(
  text: string,
  config: TextToSpeechConfig,
  callbacks: {
    onStart?: () => void;
    onDone?: () => void;
    onController?: (controller: RealisticSpeechController) => void;
  } = {}
): Promise<void> {
  const url = resolveUrl(config);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: config.voice }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`TTS request failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const { audioBase64 } = (await response.json()) as { audioBase64?: string };
  if (!audioBase64) {
    throw new Error("TTS endpoint did not return `{ audioBase64 }`.");
  }

  const fileUri = `${FileSystem.cacheDirectory}resse-tts-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const player = createAudioPlayer({ uri: fileUri });

  await new Promise<void>((resolve, reject) => {
    // Both endings (played out, cancelled) have to release exactly once —
    // release() on an already-released player throws, and a double-resolve
    // would hide a later error.
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      subscription.remove();
      try {
        player.release();
      } catch {
        // Already released; nothing left to clean up.
      }
      resolve();
    };

    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        callbacks.onDone?.();
        finish();
      }
    });

    callbacks.onController?.({
      cancel: () => {
        try {
          player.pause();
        } catch {
          // Player already gone — finishing is all that's left to do.
        }
        finish();
      },
    });

    callbacks.onStart?.();
    try {
      player.play();
    } catch (error) {
      settled = true;
      subscription.remove();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
