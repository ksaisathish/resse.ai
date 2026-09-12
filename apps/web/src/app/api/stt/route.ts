/**
 * Speech-to-text proxy for @resse/stt.
 *
 * The phone records a clip and uploads it here as multipart form data; this
 * route holds OPENAI_API_KEY (never sent to the client) and relays the audio
 * to OpenAI's transcription API. Same "server holds the key" pattern as
 * /api/realtime-token and /api/search.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }

  const incoming = await request.formData();
  const audio = incoming.get("audio");
  if (!(audio instanceof Blob)) {
    return Response.json({ error: "Expected a multipart `audio` field." }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.append("file", audio, "clip.m4a");
  upstream.append("model", "gpt-4o-mini-transcribe");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      { error: `Transcription failed: ${detail.slice(0, 300)}` },
      { status: response.status },
    );
  }

  const data = (await response.json()) as { text?: string };
  return Response.json({ text: data.text ?? "" });
}
