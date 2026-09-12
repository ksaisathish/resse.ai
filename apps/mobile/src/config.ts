/**
 * The runtime endpoint.
 *
 * `localhost` on a phone means the PHONE, not your laptop. Options:
 *   - iOS Simulator      → http://localhost:3100/api/mobile-copilotkit
 *   - Android emulator   → http://10.0.2.2:3100/api/mobile-copilotkit
 *   - Physical device    → http://<your-laptop-LAN-IP>:3100/api/mobile-copilotkit,
 *                          using the LAN URL printed by `npm run dev:web`, or after deploying the runtime
 *
 * Set EXPO_PUBLIC_RUNTIME_URL in apps/mobile/.env to override.
 */
export const RUNTIME_URL =
  process.env.EXPO_PUBLIC_RUNTIME_URL ??
  "http://localhost:3100/api/mobile-copilotkit";

/** The backend's origin, derived from RUNTIME_URL (strips the CopilotKit path).
 * Used for plain reachability checks and the Google auth exchange route —
 * anything that isn't the CopilotKit protocol itself. */
export const BACKEND_ORIGIN = RUNTIME_URL.replace(/\/api\/.*$/, "");

/**
 * Google OAuth client ID (public — safe to ship in the app). Create one in
 * Google Cloud Console as a "Web application" type — Android/iOS types need a
 * package name + SHA-1 from a real signed build, which plain Expo Go doesn't
 * have. Set EXPO_PUBLIC_GOOGLE_CLIENT_ID in apps/mobile/.env.
 */
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/**
 * Origin used for the Google OAuth redirect URI specifically — kept separate
 * from BACKEND_ORIGIN because Google's "Web application" client type rejects
 * a bare LAN IP as a redirect URI (needs a public TLD, and HTTPS except for
 * localhost). Point this at a tunnel (e.g. `cloudflared tunnel --url
 * http://localhost:3100`) that forwards to the same backend; everything else
 * (chat, the token exchange call itself) keeps using BACKEND_ORIGIN/LAN
 * directly — only the redirect Google sends the phone's browser to needs to
 * be the tunnel's public HTTPS URL. Set EXPO_PUBLIC_GOOGLE_REDIRECT_ORIGIN in
 * apps/mobile/.env; falls back to BACKEND_ORIGIN so nothing breaks once this
 * backend has a real public HTTPS deployment instead of a dev tunnel.
 */
export const GOOGLE_REDIRECT_ORIGIN =
  process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_ORIGIN ?? BACKEND_ORIGIN;
