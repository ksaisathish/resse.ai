# Resse.ai

**An AI front-desk agent that runs on a physical kiosk — an old phone or tablet mounted where customers actually walk in.**

Built for AI Tinkerers' **Agents, Everywhere** hackathon (Sept 12–13, 2026), forked from the [CopilotKit starter kit](https://github.com/CopilotKit/agents-everywhere-starter-kit). See [RESSE_IDEATION_CONTEXT.md](RESSE_IDEATION_CONTEXT.md) for the full planning history, feasibility notes, and open decisions.

## What it is

A small business owner points Resse.ai at their business, and the kiosk takes over the front desk: greeting customers, checking them in for appointments, answering basic questions about the business, and tracking no-shows — the context that's lost the moment you replace the kiosk with a generic chatbot on a laptop.

## Status

This is early — a working backend + mobile scaffold, not the finished kiosk. Currently working:

- A CopilotKit agent backend (`apps/web`) that the Expo app talks to
- A React Native front-desk app (`apps/mobile`) with sample appointment data, a business-info card, and an approval-gated status-change flow (check-in / no-show / cancel / complete)
- Shared prompt + model adapter (`packages/agent-core`)

Not yet wired up (see [RESSE_IDEATION_CONTEXT.md](RESSE_IDEATION_CONTEXT.md) for the plan):

- Business onboarding via Exa scrape (paste a URL, confirm scraped details)
- Live voice on the actual Expo app — the transport is unresolved; the backend has a working *browser* voice reference (`/voice`) but Expo has no built-in WebRTC
- Real calendar sync, payments, reviews collection

## Get started

Use Node.js 22+:

```bash
git clone https://github.com/ksaisathish/resse.ai.git
cd resse.ai
npm ci
cp .env.example .env
```

Set your model provider in `.env` (OpenAI or OpenRouter — see [using-sponsor-tools.md](using-sponsor-tools.md#openai)), then:

```bash
npm run dev:web
```

In a second terminal, run the mobile app:

```bash
cd apps/mobile
npm ci
npm start
```

Press `i` for iOS Simulator or `a` for Android. See [apps/mobile/README.md](apps/mobile/README.md) for physical-device networking and [apps/web/README.md](apps/web/README.md) for the backend routes.

## Repository layout

| Path | What it is |
|---|---|
| [apps/mobile](apps/mobile/) | The Expo/React Native kiosk app — the actual product surface |
| [apps/web](apps/web/) | Backend only: hosts the CopilotKit runtime, Exa search route, and OpenAI Realtime token route. No end-user UI. |
| [packages/agent-core](packages/agent-core/) | Shared model adapter, prompt, and capabilities (search, workplace/MCP) every surface points at |

`apps/mobile` is deliberately **not** an npm workspace member — Expo pins its own React Native version stack, and hoisting that into the root workspace breaks it. It has its own install; see its README.

## Inherited vs. built

This repo started from the CopilotKit `agents-everywhere-starter-kit` (kept in git history). Inherited: the monorepo wiring, the CopilotKit runtime/model-adapter plumbing, the Expo app shell and its human-in-the-loop tool pattern, the OpenAI Realtime voice reference page. Built for Resse.ai: the front-desk domain (business info, appointments, status transitions), the reception prompt, and the mobile UI built on top of that domain. The event's judging criteria require distinguishing these — see [hackathon-rules.md](hackathon-rules.md).

## Reference docs kept from the starter kit

These describe the original hackathon and sponsor setup and are still accurate for tooling/config, even though the sample scenario they mention (an on-call incident bot) isn't what Resse.ai builds:

- [hackathon-overview.md](hackathon-overview.md) — the event, surfaces, and judging rubric
- [hackathon-rules.md](hackathon-rules.md) — eligibility and required deliverables
- [using-sponsor-tools.md](using-sponsor-tools.md) — OpenAI/CopilotKit/OpenRouter/Exa/Auth0/Ambiguous AI setup
- [SUBMISSION.md](SUBMISSION.md) — the submission checklist
- [AGENTS.md](AGENTS.md) — repository conventions for a coding agent working in this repo
- [dev-docs/](dev-docs/) — model switching, deployment, troubleshooting

## Verify

```bash
npm run verify
```

Runs typechecks and offline tests for the web backend. The mobile app has its own checks — see [apps/mobile/README.md](apps/mobile/README.md#verify-and-limits).
