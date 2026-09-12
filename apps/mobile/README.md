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
| App shell | [App.tsx](App.tsx) |
| Headless chat | [src/chat.tsx](src/chat.tsx) |
| Reception sample state + status-transition rules | [src/reception.ts](src/reception.ts) |
| CopilotKit tools and app context | [src/tools.tsx](src/tools.tsx) |
| Runtime URL | [src/config.ts](src/config.ts) |
| Mobile runtime endpoint | [../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts](../web/src/app/api/mobile-copilotkit/[[...path]]/route.ts) |
| Mobile prompt | [../../packages/agent-core/src/reception-prompt.ts](../../packages/agent-core/src/reception-prompt.ts) |

Imports come from `@copilotkit/react-native/headless` so the app avoids optional native peers from the prebuilt chat UI. `index.js` imports `react-native-get-random-values` before CopilotKit polyfills, then registers the Expo app.

`metro.config.js` routes the transitive `jose` dependency through its browser export for native bundles. This is intentionally narrow: it does not stub Node built-ins or mask missing native functionality.

## What's still missing

- **Voice.** This app is currently text-chat only. The backend has a working browser voice reference (`apps/web/src/app/voice`, OpenAI Realtime over WebRTC), but that transport doesn't exist on Expo out of the box. Options being evaluated: `react-native-webrtc` (needs an EAS dev build), WebSocket streaming to the Realtime API, or a push-to-talk record → STT → agent turn → TTS loop. See [RESSE_IDEATION_CONTEXT.md](../../RESSE_IDEATION_CONTEXT.md).
- **Business onboarding.** No Exa-scrape-and-confirm flow yet; `initialReception` in `src/reception.ts` is hand-written sample data.
- **Persistence.** Appointment state lives in RN memory and resets on reload — fine for a demo, not for a kiosk that needs to survive a restart. A real datastore behind `apps/web` is the next step before this is a real product.
- **Camera/presence detection, payments, reviews, real calendar sync.** Out of scope for now — see the ideation doc for the reasoning.

## Verify and limits

Run `npm test`, `npm run typecheck`, `npm run bundle:ios`, and `npm run bundle:android` from `apps/mobile` before recording. The app changes local sample state only. It does not connect to a calendar, payment service, or messaging provider yet.

## Upstream source

This app started from CopilotKit's `agents-everywhere-starter-kit` React Native template (itself inspired by CopilotKit PR [#5430](https://github.com/CopilotKit/CopilotKit/pull/5430)), which shipped a personal-finance sample domain. Resse.ai replaced that domain with the front-desk/appointment domain above; the app shell, headless chat pattern, and CopilotKit wiring are otherwise unchanged.
