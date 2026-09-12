/**
 * Vision-based presence check for @resse/presence's `createVisionPresenceChecker`.
 *
 * Takes { imageBase64 }, asks a cheap vision-capable model a strict yes/no
 * "is a person facing the camera" question, and returns { present }. This is
 * the fallback used only because Expo Go has no on-device face detector
 * available (see packages/presence/README.md) — it costs a small amount per
 * call, so keep the client-side polling interval reasonable (a few seconds,
 * not sub-second) and prefer gating it behind a flag rather than always on.
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }

  const body = (await request.json()) as { imageBase64?: unknown };
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  if (!imageBase64) {
    return Response.json({ error: "`imageBase64` is required." }, { status: 400 });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Is there a person's face visible in this image, facing roughly toward the camera? Reply with exactly one word: yes or no.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      { error: `Presence check failed: ${detail.slice(0, 300)}` },
      { status: response.status },
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const answer = data.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
  return Response.json({ present: answer.startsWith("yes") });
}
