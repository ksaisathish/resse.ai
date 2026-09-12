/**
 * Redirect bridge for Google sign-in from Expo Go.
 *
 * Registered as the Google "Web application" client's Authorized redirect
 * URI. Google lands here with `?code=...&state=...`; this route's only job
 * is to bounce the phone's browser onward to the app's own `exp://` (or, in
 * a future dev client, custom-scheme) link, which the OS *can* route back
 * into the running app — unlike this route's own http(s) URL, which Expo Go
 * has no way to claim. `state` carries that return address, set by the app
 * itself before starting the flow (see src/use-google-auth.ts).
 *
 * This route never sees a client secret and never talks to Google's token
 * endpoint — it only forwards `code`. The actual exchange happens in
 * ../route.ts, called by the app after it receives the code back.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");

  let returnTo: string | null = null;
  if (state) {
    try {
      returnTo = JSON.parse(decodeURIComponent(state)).returnTo ?? null;
    } catch {
      returnTo = null;
    }
  }

  if (!returnTo) {
    return Response.json(
      { error: "Missing or invalid state — could not determine where to return." },
      { status: 400 },
    );
  }

  const target = new URL(returnTo);
  if (error) target.searchParams.set("error", error);
  if (code) target.searchParams.set("code", code);

  return new Response(null, { status: 302, headers: { Location: target.toString() } });
}
