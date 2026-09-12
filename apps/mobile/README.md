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

### The hands-free flow

From the dashboard, tap **Start receptionist**. Stand in front of the camera: the person count badge goes to 1 and it starts listening on its own. Say:

```text
What time do you open on Thursday?
```

Expected: it answers out loud, the avatar's mouth moves for the whole answer, captions show both sides, and then it **listens again** without being asked. Keep going:

```text
Book me a cleaning that morning.
```

Expected: it calls `suggest_appointment_slots` for real open times (opening hours minus what's already booked, including the operator's Google Calendar), offers them out loud, and once you pick one, `book_appointment` renders an approval card — with a UPI QR if the business has a deposit configured. Tapping confirm writes the Google Calendar event.

If the camera can't see you (covered, bad angle, still loading), the button at the bottom is the fallback: **Tap to talk**, then **Stop & send** or **Stop talking** to cut a turn short.

## Customize these files

| Piece | File |
| --- | --- |
| App shell + navigation stack | [App.tsx](App.tsx) |
| Splash / login / dashboard screens | [src/splash-screen.tsx](src/splash-screen.tsx), [src/login-screen.tsx](src/login-screen.tsx), [src/dashboard-screen.tsx](src/dashboard-screen.tsx) |
| Business onboarding (URL scrape + confirm) | [src/create-org-screen.tsx](src/create-org-screen.tsx), backend at [../web/src/app/api/org/scrape/route.ts](../web/src/app/api/org/scrape/route.ts) |
| **Hands-free kiosk screen** (turn taking, captions, manual fallback) | [src/receptionist-screen.tsx](src/receptionist-screen.tsx) |
| Shared agent/voice wiring behind both screens | [src/use-reception-agent.ts](src/use-reception-agent.ts) |
| Camera presence trigger | [src/presence-trigger.tsx](src/presence-trigger.tsx), [../../packages/presence](../../packages/presence) |
| Admin surface (dashboard, clients, calendar, settings) | [src/admin-screen.tsx](src/admin-screen.tsx) and `src/admin-*.tsx` |
| Google sign-in (PKCE) | [src/use-google-auth.ts](src/use-google-auth.ts), backend exchange at [../web/src/app/api/auth/google/route.ts](../web/src/app/api/auth/google/route.ts) |
| Session storage (SecureStore) | [src/auth.ts](src/auth.ts) |
| Persisted appointments/clients and app settings | [src/reception-store.ts](src/reception-store.ts), [src/settings-store.ts](src/settings-store.ts) |
| Headless chat | [src/chat.tsx](src/chat.tsx) |
| Reception sample state + status-transition rules | [src/reception.ts](src/reception.ts) |
| Open-slot suggestion (opening hours minus what's booked) | [src/slots.ts](src/slots.ts) |
| Markdown → spoken text for TTS and captions | [src/speech-text.ts](src/speech-text.ts) |
| Google Calendar reads/writes | [src/calendar.ts](src/calendar.ts) |
| CopilotKit tools and app context | [src/tools.tsx](src/tools.tsx) |
| Runtime/backend URLs, Google client ID | [src/config.ts](src/config.ts) |
| Mobile runtime endpoint | [../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts](../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts) |
| Mobile prompt | [../../packages/agent-core/src/reception-prompt.ts](../../packages/agent-core/src/reception-prompt.ts) |

Imports come from `@copilotkit/react-native/headless` so the app avoids optional native peers from the prebuilt chat UI. `index.js` imports `react-native-get-random-values` before CopilotKit polyfills, then registers the Expo app.

`metro.config.js` routes the transitive `jose` dependency through its browser export for native bundles. This is intentionally narrow: it does not stub Node built-ins or mask missing native functionality.

## What's still missing

- **No Google token refresh.** The access token from sign-in lasts about an hour and there's no refresh flow, so calendar tools start failing with a "session expired" message until someone signs in again. Fine for a demo, wrong for a kiosk left running unattended — see the note at the top of [src/auth.ts](src/auth.ts).
- **No automatic payment verification.** The UPI QR is real, but nothing observes whether the payment landed; the operator's confirm tap *is* the check. A payment-gateway integration (Razorpay/Cashfree/PhonePe Business) is what would close this — see [../web/src/app/api/payments/qr/route.ts](../web/src/app/api/payments/qr/route.ts).
- **No reschedule or cancel tool.** `book_appointment` only creates. Moving an appointment (and updating the Google Calendar event it already made) isn't built.
- **Device-local data, single tenant.** Clients and appointments live in AsyncStorage on the device and survive restarts, but there's no server-side store and no multi-tenant model: every signed-in account on a device sees the same business. A real datastore behind `apps/web` is the next step before this is a product.
- **Reviews collection.** Not built.

## Verify and limits

Run `npm test`, `npm run typecheck`, `npm run bundle:ios`, and `npm run bundle:android` from `apps/mobile` before recording.

The unit tests cover the pure logic that's awkward to exercise by hand: appointment status transitions, slot suggestion across closed days and week boundaries ([test/slots.test.ts](test/slots.test.ts)), and markdown-to-speech conversion ([test/speech-text.test.ts](test/speech-text.test.ts)). The voice, camera and approval flows are not automated — drive those on a device.

## Upstream source

This app started from CopilotKit's `agents-everywhere-starter-kit` React Native template (itself inspired by CopilotKit PR [#5430](https://github.com/CopilotKit/CopilotKit/pull/5430)), which shipped a personal-finance sample domain. Resse.ai replaced that domain with the front-desk/appointment domain above; the app shell, headless chat pattern, and CopilotKit wiring are otherwise unchanged.
