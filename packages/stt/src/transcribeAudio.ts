import type { SpeechToTextConfig } from "./types";

function resolveUrl({ endpoint, baseUrl }: SpeechToTextConfig): string {
  const path = endpoint ?? "/api/stt";
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) {
    throw new Error(
      "@resse/stt: `endpoint` is relative but no `baseUrl` was provided. Pass baseUrl (e.g. the host behind EXPO_PUBLIC_RUNTIME_URL) or an absolute endpoint."
    );
  }
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

/**
 * Uploads a recorded clip to the backend transcription endpoint. The backend
 * is expected to proxy a cloud STT provider (Whisper, Deepgram, etc.) and
 * return `{ text }` — see apps/web/src/app/api/stt/route.ts for the reference
 * implementation (OpenAI Whisper).
 */
export async function transcribeAudio(
  fileUri: string,
  config: SpeechToTextConfig = {}
): Promise<string> {
  const url = resolveUrl(config);

  const formData = new FormData();
  formData.append("audio", {
    uri: fileUri,
    name: "clip.m4a",
    type: "audio/m4a",
  } as unknown as Blob);

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Transcription failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await response.json()) as { text?: string };
  if (typeof data.text !== "string") {
    throw new Error("Transcription endpoint did not return `{ text }`.");
  }
  return data.text;
}
