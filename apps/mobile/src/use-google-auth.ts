/**
 * Google sign-in via a self-hosted redirect bridge.
 *
 * Why not the deprecated `expo-auth-session/providers/google` helper, and why
 * not the plain `useAuthRequest` + `promptAsync()` auto-detection pattern:
 * both assume the app owns a registered URL scheme the OS can route a
 * redirect back into. That's true for a real native build (EAS dev client or
 * standalone app), but Expo Go is a shared, generic container — it only owns
 * `exp://` links, not an arbitrary scheme or an arbitrary https redirect URI.
 * Google also only accepts a "Web application" OAuth client's redirect URI as
 * http/https, not a custom scheme at all.
 *
 * So the flow here goes: Google → our own backend's callback route (a real
 * https/http URL, registered as the Web client's redirect URI) → that route
 * 302s the phone's browser to this app's own `exp://.../auth-callback` link
 * (built with `Linking.createURL`, which Expo Go DOES own) → the OS hands
 * that back to this running app → a `Linking` listener here catches it and
 * finishes the code exchange. This also works unchanged from a future EAS
 * dev client, since `Linking.createURL` adapts automatically.
 *
 * The auth *request* itself (PKCE challenge, discovery) still comes from
 * `expo-auth-session` — only the browser-opening and redirect-detection are
 * done by hand instead of via `promptAsync()`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthRequest, useAutoDiscovery, ResponseType } from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { BACKEND_ORIGIN, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_ORIGIN } from "@/config";
import { saveSession, type Session } from "@/auth";

const SCOPES = [
  "openid",
  "profile",
  "email",
  "https://www.googleapis.com/auth/calendar",
];

/** Registered as the Google "Web application" client's Authorized redirect
 * URI. Uses GOOGLE_REDIRECT_ORIGIN (a tunnel, not the LAN IP) because Google
 * rejects a bare LAN IP here — see config.ts. The callback route itself is
 * reachable through both the tunnel and the LAN origin, since ngrok/cloudflared
 * just forward to the same local server. */
const CALLBACK_URL = `${GOOGLE_REDIRECT_ORIGIN}/api/auth/google/callback`;

/** Where the bridge redirects back to. Resolves to an `exp://` link inside
 * Expo Go, and to the app's own custom scheme in a dev client / standalone
 * build — no code change needed when you move off Expo Go later. */
const APP_RETURN_URL = Linking.createURL("auth-callback");

type Status = "idle" | "waiting" | "exchanging" | "error";

export function useGoogleAuth() {
  const discovery = useAutoDiscovery("https://accounts.google.com");
  const [request] = useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: SCOPES,
      redirectUri: CALLBACK_URL,
      responseType: ResponseType.Code,
      usePKCE: true,
      state: encodeURIComponent(JSON.stringify({ returnTo: APP_RETURN_URL })),
    },
    discovery,
  );
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const pendingResolve = useRef<((session: Session | null) => void) | null>(null);

  const finish = useCallback((session: Session | null) => {
    pendingResolve.current?.(session);
    pendingResolve.current = null;
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      if (!event.url.includes("auth-callback")) return;
      void WebBrowser.dismissBrowser();
      const { queryParams } = Linking.parse(event.url);
      const oauthError = queryParams?.error;
      const code = queryParams?.code;

      if (oauthError) {
        setStatus("error");
        setError(String(oauthError));
        finish(null);
        return;
      }
      if (typeof code !== "string" || !request?.codeVerifier) {
        setStatus("error");
        setError("Google redirected back without an authorization code.");
        finish(null);
        return;
      }

      setStatus("exchanging");
      fetch(`${BACKEND_ORIGIN}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, codeVerifier: request.codeVerifier, redirectUri: CALLBACK_URL }),
      })
        .then(async (exchange) => {
          const data = await exchange.json();
          if (!exchange.ok) throw new Error(data.error ?? `Token exchange failed: HTTP ${exchange.status}`);
          const session: Session = {
            idToken: data.idToken,
            accessToken: data.accessToken,
            expiresAt: Date.now() + data.expiresIn * 1000,
            profile: data.profile,
          };
          await saveSession(session);
          setStatus("idle");
          finish(session);
        })
        .catch((cause) => {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : String(cause));
          finish(null);
        });
    });
    return () => subscription.remove();
  }, [request, finish]);

  const signIn = useCallback((): Promise<Session | null> => {
    if (!GOOGLE_CLIENT_ID) {
      setStatus("error");
      setError("EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set in apps/mobile/.env.");
      return Promise.resolve(null);
    }
    if (!request || !discovery) {
      setStatus("error");
      setError("Still loading the auth request — try again in a moment.");
      return Promise.resolve(null);
    }

    setError(undefined);
    setStatus("waiting");
    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      request
        .makeAuthUrlAsync(discovery)
        .then((url) => WebBrowser.openBrowserAsync(url))
        .catch((cause) => {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : String(cause));
          finish(null);
        });
    });
  }, [request, discovery, finish]);

  return {
    signIn,
    status,
    error,
    canSignIn: Boolean(request) && Boolean(discovery) && Boolean(GOOGLE_CLIENT_ID),
  };
}
