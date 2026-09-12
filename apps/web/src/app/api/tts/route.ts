/**
 * Text-to-speech proxy for @resse/tts's "realistic" mode.
 *
 * Takes { text, voice? }, calls OpenAI's TTS API, and returns the audio as
 * base64 JSON (simpler for the Expo client to consume than streaming bytes —
 * it writes the base64 straight to a temp file via expo-file-system). Same
 * "server holds the key" pattern as the other routes in this directory.
 */
const DEFAULT_VOICE = "alloy";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }

  const body = (await request.json()) as { text?: unknown; voice?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "A non-empty `text` string is required." }, { status: 400 });
  }
  const voice = typeof body.voice === "string" && body.voice ? body.voice : DEFAULT_VOICE;

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      { error: `TTS request failed: ${detail.slice(0, 300)}` },
      { status: response.status },
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuffer).toString("base64");
  return Response.json({ audioBase64 });
}
