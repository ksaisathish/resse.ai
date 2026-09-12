# Resse.ai — backend runtime

**OpenAI or OpenRouter + CopilotKit runtime**

This Next.js app has no end-user UI of its own. It exists to host the agent
backend that the Expo kiosk app (`apps/mobile`) talks to, plus a couple of
supporting routes. Visiting it in a browser shows a status page listing what
it serves.

## Routes

| Route | Purpose |
| --- | --- |
| [src/app/api/mobile-copilotkit/[[...path]]/route.ts](src/app/api/mobile-copilotkit/[[...path]]/route.ts) | The CopilotKit runtime the Expo app connects to. Builds the agent via `makeAgent` from `agent-core`, using [`RECEPTION_PROMPT`](../../packages/agent-core/src/reception-prompt.ts). |
| [src/app/api/search/route.ts](src/app/api/search/route.ts) | Exa web search, used when `EXA_API_KEY` is set. |
| [src/app/api/realtime-token/route.ts](src/app/api/realtime-token/route.ts) | Mints a short-lived OpenAI Realtime client secret so a voice client never holds the real API key. |
| [src/app/voice/page.tsx](src/app/voice/page.tsx) | A **browser** reference implementation of the voice surface (WebRTC straight to OpenAI Realtime). Useful for proving the voice prompt/tooling works — the actual kiosk needs its own transport since Expo has no built-in WebRTC. See the [mobile README](../mobile/README.md#whats-still-missing). |

## Get started

Complete the [root clone/install steps](../../README.md#get-started). Configure `.env` with a [model provider](../../using-sponsor-tools.md#openai):

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your-key
MODEL=gpt-5.6-sol
```

```bash
npm run dev:web
```

This starts the backend on `http://localhost:3100`. The mobile app is what you actually interact with — see [apps/mobile/README.md](../mobile/README.md).

## Verify and limits

Run `npm run verify` (typecheck + offline tests) from the repo root. Offline tests cover pure logic only (e.g. the realtime config defaults); they do not make live provider calls or exercise the mobile app's UI.

[CopilotKit docs](https://docs.copilotkit.ai/) · [Sponsor authentication and first calls](../../using-sponsor-tools.md)
