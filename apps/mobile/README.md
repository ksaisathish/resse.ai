# Resse.ai — mobile kiosk app

**OpenAI or OpenRouter + CopilotKit React Native**

The front desk itself: reads the business's visible state (hours, services, today's appointment queue), renders native cards in chat, and waits for a tap before changing any appointment's status. Sample data — a small dental office — stands in for a real business until onboarding (Exa scrape of a business URL) is wired up.

This app is deliberately not an npm workspace member. React Native pins its own `react`, `react-native`, and Expo versions, and hoisting those into the root workspace can break the web app.

## Get started

Complete the [root clone/install steps](../../README.md#get-started), then choose one model provider in the root `.env`.

For OpenAI:

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your-key
MODEL=gpt-5.6-sol
```

For OpenRouter, choose an available model with tool support:

```dotenv
MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=your-key
MODEL=openai/gpt-5.6-sol
```

Start the runtime from the repository root:

```bash
npm run dev:web
```

In a second terminal, run the mobile app:

```bash
cd apps/mobile
npm ci
npm start
```

Press `i` for the iOS Simulator or `a` for Android. For a physical device, first make the mobile runtime reachable from the device with a deliberate host or deployment, then scan the Expo code.

## Sign in with Google

The app now opens on a splash screen, then a Google sign-in screen, then a dashboard with a **Start front desk** button — the appointment flow above is the `FrontDesk` screen at the end of that stack.

Since this runs in plain Expo Go (no dev client / EAS build), Google can't redirect straight back into the app — Expo Go doesn't own a custom URL scheme or an arbitrary https redirect the way a real installed app does. So the flow uses a small redirect bridge instead: Google → a route on this backend → that route bounces the phone's browser to the app's own `exp://` link (via `Linking`), which Expo Go *does* own. See the comment at the top of [src/use-google-auth.ts](src/use-google-auth.ts) for the full reasoning, and [.../api/auth/google/callback/route.ts](../web/src/app/api/auth/google/callback/route.ts) for the bridge itself.

**Google rejects a bare LAN IP as a redirect URI** ("must end with a public top-level domain", "must use a domain that is a valid Top private domain") — a "Web application" client requires either `http://localhost` or an HTTPS URL with a real domain. A LAN IP is neither, and plain `localhost` won't actually work here anyway (Google would redirect the *phone's* browser to the phone's own loopback, which has nothing listening on it). So this needs a tunnel: a temporary public HTTPS URL that forwards to your local `:3100`.

1. Install a tunnel (one-time): [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) needs no signup for a quick tunnel — `winget install --id Cloudflare.cloudflared`. (`ngrok` works too, but its free tier now requires signing up for an authtoken.)
2. With the backend running (`npm run dev:web`), start the tunnel in another terminal: `cloudflared tunnel --url http://localhost:3100`. It prints a `https://<random>.trycloudflare.com` URL — that's your tunnel origin. It changes every time you restart the tunnel, so re-do the steps below whenever you do.
3. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client of type **Web application** (not iOS/Android — those need a package name + SHA-1 fingerprint from a real signed build, which Expo Go doesn't have).
4. Add an **Authorized redirect URI**: `<tunnel-url>/api/auth/google/callback`.
5. On the OAuth consent screen, add the Calendar scope and add yourself as a test user — an unverified app works fine for a hackathon demo as long as your account is listed as a tester.
6. Set:
   - `apps/mobile/.env` → `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (the client ID) and `EXPO_PUBLIC_GOOGLE_REDIRECT_ORIGIN` (the tunnel URL, no trailing slash)
   - root `.env` → `GOOGLE_CLIENT_ID` (same client ID — the backend needs it to exchange the code, see [.../api/auth/google/route.ts](../web/src/app/api/auth/google/route.ts))
7. A "Web application" client normally has a secret. If Google shows you one, put it in root `.env` → `GOOGLE_CLIENT_SECRET`; if you'd rather not hold a secret at all, that's fine too — the exchange route only sends it when it's set.

Everything else (the CopilotKit chat traffic, the token-exchange call itself) still goes over the LAN IP in `EXPO_PUBLIC_RUNTIME_URL` as before — only the OAuth redirect needs the tunnel, since that's the one hop Google's server controls directly.

**Caveat:** this hasn't been tested against a real Google client yet (no credentials in this dev environment). If sign-in doesn't return to the app after the Google consent screen, check in order: (1) the redirect URI registered in Google Cloud Console matches `EXPO_PUBLIC_GOOGLE_REDIRECT_ORIGIN` + `/api/auth/google/callback` exactly, (2) the backend logs show the callback route being hit with a `code`, (3) the bridge's 302 target (visible in those same logs) looks like a plausible `exp://<your-LAN-IP>:8081/--/auth-callback?code=...` URL. See [RESSE_IDEATION_CONTEXT.md](../../RESSE_IDEATION_CONTEXT.md) for more.

Calendar access is requested at sign-in (so the granted token exists), but nothing calls the Calendar API yet — that's still ahead, same as onboarding and persistence below.

## Runtime URL

The default endpoint is `http://localhost:3100/api/mobile-copilotkit`, served by `apps/web`. On a real phone, `localhost` means the phone, not your laptop.

| Target | `EXPO_PUBLIC_RUNTIME_URL` |
| --- | --- |
| iOS Simulator | `http://localhost:3100/api/mobile-copilotkit` |
| Android emulator | `http://10.0.2.2:3100/api/mobile-copilotkit` |
| Physical device | A deliberately exposed or deployed runtime URL, for example `http://<your-laptop-LAN-IP>:3100/api/mobile-copilotkit` only after starting Next.js on a LAN interface you trust |

Put the override in `apps/mobile/.env`. The default `npm run dev:web` binds Next.js to loopback, so a physical device will need an explicitly exposed host, a tunnel/deployment, or a separate runtime start command with the security boundary you intend.

## Try the flow

Ask:

```text
What are your hours?
```

Expected: `get_business_info` renders a business-info card.

Ask:

```text
Show today's appointments.
```

Expected: `list_appointments` renders the queue with each appointment's status.

Ask:

```text
Check in Priya Nair.
```

Expected: `check_in_appointment` renders an approval card. Tapping **Approve** updates the local in-memory appointment status. Tapping **Cancel** changes nothing.

Ask something that should fail, to see the guard rail:

```text
Mark Jordan Blake's appointment as checked in.
```

Expected: the approval card shows the appointment can't transition (it's already `completed`) and **Approve** stays disabled — this is the one built-in failure/cancellation path.

## Customize these files

| Piece | File |
| --- | --- |
| App shell + navigation stack | [App.tsx](App.tsx) |
| Splash / login / dashboard screens | [src/splash-screen.tsx](src/splash-screen.tsx), [src/login-screen.tsx](src/login-screen.tsx), [src/dashboard-screen.tsx](src/dashboard-screen.tsx) |
| Google sign-in (PKCE) | [src/use-google-auth.ts](src/use-google-auth.ts), backend exchange at [../web/src/app/api/auth/google/route.ts](../web/src/app/api/auth/google/route.ts) |
| Session storage (SecureStore) | [src/auth.ts](src/auth.ts) |
| Headless chat | [src/chat.tsx](src/chat.tsx) |
| Reception sample state + status-transition rules | [src/reception.ts](src/reception.ts) |
| CopilotKit tools and app context | [src/tools.tsx](src/tools.tsx) |
| Runtime/backend URLs, Google client ID | [src/config.ts](src/config.ts) |
| Mobile runtime endpoint | [../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts](../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts) |
| Mobile prompt | [../../packages/agent-core/src/reception-prompt.ts](../../packages/agent-core/src/reception-prompt.ts) |

Imports come from `@copilotkit/react-native/headless` so the app avoids optional native peers from the prebuilt chat UI. `index.js` imports `react-native-get-random-values` before CopilotKit polyfills, then registers the Expo app.

`metro.config.js` routes the transitive `jose` dependency through its browser export for native bundles. This is intentionally narrow: it does not stub Node built-ins or mask missing native functionality.

## What's still missing

- **Voice.** This app is currently text-chat only. The backend has a working browser voice reference (`apps/web/src/app/voice`, OpenAI Realtime over WebRTC), but that transport doesn't exist on Expo out of the box. Options being evaluated: `react-native-webrtc` (needs an EAS dev build), WebSocket streaming to the Realtime API, or a push-to-talk record → STT → agent turn → TTS loop. See [RESSE_IDEATION_CONTEXT.md](../../RESSE_IDEATION_CONTEXT.md).
- **Google sign-in is untested against a real client** — see the caveat above about Expo Go vs. an EAS dev build for the OAuth redirect.
- **Calendar sync.** The sign-in flow requests Calendar scope and the backend receives an access token, but nothing calls the Calendar API yet.
- **Business onboarding.** No Exa-scrape-and-confirm flow yet; `initialReception` in `src/reception.ts` is hand-written sample data.
- **Persistence.** Appointment state lives in RN memory and resets on reload — fine for a demo, not for a kiosk that needs to survive a restart. There's also no multi-tenant data model yet: every signed-in account currently sees the same shared sample business/appointments, not their own. A real datastore behind `apps/web` is the next step before this is a real product.
- **Camera/presence detection, payments, reviews.** Out of scope for now — see the ideation doc for the reasoning.

## Verify and limits

Run `npm test`, `npm run typecheck`, `npm run bundle:ios`, and `npm run bundle:android` from `apps/mobile` before recording. The app changes local sample state only. It does not connect to a calendar, payment service, or messaging provider yet.

## Upstream source

This app started from CopilotKit's `agents-everywhere-starter-kit` React Native template (itself inspired by CopilotKit PR [#5430](https://github.com/CopilotKit/CopilotKit/pull/5430)), which shipped a personal-finance sample domain. Resse.ai replaced that domain with the front-desk/appointment domain above; the app shell, headless chat pattern, and CopilotKit wiring are otherwise unchanged.
