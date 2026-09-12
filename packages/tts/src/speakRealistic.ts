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

/**
 * Calls the backend TTS proxy, writes the returned audio to a temp file
 * (expo-audio plays from a file/URI source, not raw bytes), and plays it.
 * Resolves once playback finishes.
 */
export async function speakRealistic(
  text: string,
  config: TextToSpeechConfig,
  callbacks: { onStart?: () => void; onDone?: () => void } = {}
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
    callbacks.onStart?.();
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        player.release();
        callbacks.onDone?.();
        resolve();
      }
    });
    try {
      player.play();
    } catch (error) {
      subscription.remove();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
