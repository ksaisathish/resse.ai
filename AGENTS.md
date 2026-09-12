# Notes for coding agents

Resse.ai is a physical front-desk kiosk agent: an Expo/React Native app
(`apps/mobile`) talking to a CopilotKit runtime backend (`apps/web`), sharing
one agent definition in `packages/agent-core`. Forked from the CopilotKit
`agents-everywhere-starter-kit`; see [RESSE_IDEATION_CONTEXT.md](RESSE_IDEATION_CONTEXT.md)
for the planning history and open decisions.

The mobile app has its own install and environment; follow its
[README](apps/mobile/README.md) for setup and checks. `apps/web` has no
end-user UI of its own — it only hosts the agent backend, the Exa search
route, and the OpenAI Realtime token route.

Hard-won rules that are easy to get wrong here:

- **`@ag-ui/client` must stay deduped.** The root `package.json` pins it via
  `overrides` to the exact version `@copilotkit/runtime` declares. If you bump
  `@copilotkit/runtime`, re-check `npm ls @ag-ui/client` and update the override.
- **Files containing JSX must be `.tsx`.**
- **`maxSteps` defaults to 1** on `BuiltInAgent` (see `packages/agent-core/src/agent.ts`).
  Any agent with tools needs more, or it calls one tool and stops before seeing
  the result. Currently set to 10.
- **Handlers return `void`.** `thread.post()`-style helpers return values, so a
  concise arrow body can fail under `strict`. Use a block body and `await`
  where the surface expects one.
- **Never invent a CopilotKit component, hook, or prop.** Check the installed
  `@copilotkit/react-native` / `@copilotkit/runtime` version's actual exports.
- **Two orchestration tracks, not one.** The tool-calling/appointment flow runs
  through `CopilotRuntime` + `BuiltInAgent` (`apps/web/src/app/api/mobile-copilotkit`).
  Voice is separate — `@openai/agents/realtime`, token-minted via
  `apps/web/src/app/api/realtime-token`. The kit's voice reference
  (`apps/web/src/app/voice/page.tsx`) uses **browser** WebRTC, which does not
  exist on Expo out of the box — the mobile voice transport is still an open
  decision (WebRTC via `react-native-webrtc` + EAS dev build, WebSocket
  streaming, or a push-to-talk STT/TTS loop). Don't assume it's solved.
- Run `npm run typecheck` before claiming anything works.
