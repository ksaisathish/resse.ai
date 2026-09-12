// See packages/tts/src/speakRealistic.ts for why this is /legacy: SDK 54's
// expo-file-system root export dropped readAsStringAsync/EncodingType.
import * as FileSystem from "expo-file-system/legacy";
import type { PresenceChecker } from "./types";

export interface VisionPresenceCheckerConfig {
  /** Defaults to "/api/vision-presence". */
  endpoint?: string;
  baseUrl?: string;
}

function resolveUrl({ endpoint, baseUrl }: VisionPresenceCheckerConfig): string {
  const path = endpoint ?? "/api/vision-presence";
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) {
    throw new Error(
      "@resse/presence: `endpoint` is relative but no `baseUrl` was provided."
    );
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/**
 * Reference `checkPresence` implementation: sends the captured frame to a
 * vision-capable LLM (see apps/web/src/app/api/vision-presence/route.ts,
 * OpenAI gpt-4o-mini by default) and asks it to count the people facing the
 * camera. This is the most reliable option available without a
 * dev client, but it costs a small amount per call — see README's cost
 * section before wiring this up to run continuously at kiosk scale. Prefer
 * pairing it with a cheap client-side trigger (e.g. a hardware presence
 * sensor, a tap-to-start button, or your own motion heuristic) so this only
 * fires when something has already changed, rather than on a fixed
 * interval all day.
 */
export function createVisionPresenceChecker(
  config: VisionPresenceCheckerConfig = {}
): PresenceChecker {
  const url = resolveUrl(config);

  return async (photoUri: string) => {
    const base64 = await FileSystem.readAsStringAsync(photoUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64 }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Presence check failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const data = (await response.json()) as { count?: number };
    const count = typeof data.count === "number" && data.count >= 0 ? Math.floor(data.count) : 0;
    return { count, present: count > 0 };
  };
}
