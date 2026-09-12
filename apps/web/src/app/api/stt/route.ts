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

  // Reject an effectively empty clip here rather than paying for a round
  // trip that comes back as "Audio file might be corrupted or unsupported".
  if (audio.size < 1024) {
    return Response.json(
      { error: `Audio clip was too small to transcribe (${audio.size} bytes).` },
      { status: 400 },
    );
  }

  // Keep the uploaded filename so the extension still matches the actual
  // container — renaming everything to .m4a makes the transcription API
  // reject correctly-formatted audio that just isn't m4a.
  const filename = audio instanceof File && audio.name ? audio.name : "clip.m4a";

  const upstream = new FormData();
  upstream.append("file", audio, filename);
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
