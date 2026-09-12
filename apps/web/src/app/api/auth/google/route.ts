/**
 * Exchanges a Google authorization code (from the mobile app's PKCE flow)
 * for tokens, server-side.
 *
 * Kept off the device on purpose: if GOOGLE_CLIENT_SECRET is ever set (a
 * "Web application" Google client type), it must never reach the app bundle.
 * A native "iOS"/"Android" Google client type has no secret at all — PKCE
 * (the codeVerifier the app sends) is what proves this request came from the
 * same app that started the flow, and this route still holds the exchange so
 * the resulting refresh token (once refresh is wired up) has a server-side
 * home instead of living in phone storage indefinitely.
 */
function decodeIdTokenProfile(idToken: string) {
  const payload = idToken.split(".")[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return {
      name: typeof claims.name === "string" ? claims.name : claims.email,
      email: claims.email as string,
      picture: typeof claims.picture === "string" ? claims.picture : undefined,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "GOOGLE_CLIENT_ID is not set on the server." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const code = body?.code;
  const codeVerifier = body?.codeVerifier;
  const redirectUri = body?.redirectUri;
  if (typeof code !== "string" || typeof codeVerifier !== "string" || typeof redirectUri !== "string") {
    return Response.json({ error: "code, codeVerifier, and redirectUri are required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (process.env.GOOGLE_CLIENT_SECRET) {
    params.set("client_secret", process.env.GOOGLE_CLIENT_SECRET);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    return Response.json(
      { error: `Google rejected the exchange: ${detail.slice(0, 300)}` },
      { status: response.status },
    );
  }

  const tokens = (await response.json()) as {
    id_token?: string;
    access_token?: string;
    expires_in?: number;
  };
  if (!tokens.id_token || !tokens.access_token) {
    return Response.json({ error: "Google's response was missing a token." }, { status: 502 });
  }

  const profile = decodeIdTokenProfile(tokens.id_token);
  if (!profile) {
    return Response.json({ error: "Could not read profile from the ID token." }, { status: 502 });
  }

  return Response.json({
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    expiresIn: tokens.expires_in ?? 3600,
    profile,
  });
}
