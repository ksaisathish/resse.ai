# Resse.ai — ideation context

Carry-over notes from the starter-kit ideation session, for continuity once work
continues in the forked `resse.ai` repo. This is a planning artifact, not part of
the hackathon submission itself.

## Event context

- Hackathon: AI Tinkerers "Agents, Everywhere" — Sept 12–13, 2026.
- Base repo: `CopilotKit/agents-everywhere-starter-kit`, forked (not rebuilt from
  scratch) so the commit history against upstream documents what was inherited
  vs. built during the event — required for eligibility (see `hackathon-rules.md`
  and `SUBMISSION.md` in the base repo).
- Judging rubric (4 criteria, 1–5 each): Core Requirements & Functionality,
  Innovation & Theme Alignment, Technical Execution & Integration, Usefulness &
  Agentic Experience. Sponsor/surface count is explicitly *not* a scoring
  criterion — depth over breadth.

## The idea

**Resse.ai** — an AI receptionist that runs on a physical device (an old
phone/tablet) mounted in a business lobby. Frontend is Expo/React Native
(the user's strongest stack). Fits the "In the room" surface: physical
presence, walk-up interaction, voice — the context that's lost if you strip
the physical device away.

### Flow as originally scoped

1. **Business owner onboarding** (setup-time, done once by the business owner):
   - Owner provides their company's web page as input.
   - Exa scrapes it for business details: hours, services, what the business
     does, etc.
   - Info is presented back to the owner for confirmation.
   - Calendar: either integrate an existing calendar or build a lightweight
     one in-app.
2. **Live receptionist duties** (the customer-facing loop, via camera + mic):
   - Greet customer
   - Manage appointments
   - Allow live/walk-in appointments
   - Track missed appointments, follow up / reschedule
   - Answer business queries
   - Collect reviews and feedback
   - Maintain a live queue (handles reprioritization, not just fixed order)
   - Collect payments

### Feasibility assessment (given event is ~24–36 hrs)

Building all of the above is too much — one deep, verified workflow beats
broad shallow coverage per the rubric. Per-piece read:

| Piece | Feasibility | Notes |
|---|---|---|
| Exa scrape + confirm business details | Easy | Kit already does this shape for Slack; just repoint at one URL |
| Business Q&A from scraped context | Easy | Same context-injection pattern, no new plumbing |
| Appointments / queue / no-show tracking | Easy–Medium | Local state like the finance sample, but see persistence note below |
| Reviews/feedback collection | Easy | One tool call + stored record |
| Calendar integration (real OAuth) | Medium–High | Build a simple in-app calendar instead of fighting Google/Outlook OAuth in the time available |
| Camera/vision (presence detection) | Medium–High | A button or QR check-in gets the same demo beat for far less cost; true vision is its own project |
| **Live two-way voice on Expo** | **Unresolved — the make-or-break risk** | Nothing in the kit proves this on React Native; see Voice section below. Spike this first. |
| Payment collection | Cut for MVP | No payment sponsor in this kit; real money handling is out of scope for a hackathon demo |

**Recommended demo spine (one flow, not eight):** customer walks up → kiosk
greets by voice → checks them in or reschedules a real appointment → confirms
result on screen → include one failure/cancellation path (e.g. a no-show or a
declined action) since that's its own judging criterion. Treat payments,
reviews, and full priority-queue logic as roadmap/description items unless
time allows building them for real — don't fake a result that didn't execute.

## Architecture decision: fork, not fresh repo

Keep this exact monorepo shape rather than rebuilding wiring from scratch:

- `packages/agent-core` — shared model adapter, prompt, capabilities. Reuse
  `resolveModel()` as-is (OpenAI/OpenRouter/etc. via env, no new code needed).
- `apps/web` — becomes the **backend**. Strip the incident/finance-specific
  UI pages; keep the API route pattern (Next.js hosting a Hono-based
  CopilotKit runtime handler).
- `apps/mobile` — the Expo frontend. Note: **deliberately excluded from the
  root npm workspaces** in the original kit (`package.json` only lists
  `packages/*`, `apps/channel`, `apps/web`) because Expo pins its own React
  Native version stack and conflicts with hoisted workspace deps. Keep it
  installed separately — don't pull it into the shared workspace.
- `apps/channel` (Slack) — not needed for this idea, safe to delete.

Forking (vs. a brand-new repo) makes the "what we built vs. inherited"
eligibility requirement trivial: the diff against upstream is the evidence.

## Orchestration — how the pieces actually talk to each other

Two separate tracks, not one:

### 1. Structured/tool-calling track (text, cards, appointment actions)

Round trip, file by file:

1. Expo client points at the backend — `apps/mobile/src/config.ts` sets
   `RUNTIME_URL` (localhost for simulator, LAN IP for a physical device, or
   `10.0.2.2` for Android emulator).
2. RN screen sends a turn via `@copilotkit/react-native/headless`:
   `agent.addMessage(...)` then `copilotkit.runAgent({ agent })`
   (see `apps/mobile/src/chat.tsx`).
3. Next.js route receives it —
   `apps/web/src/app/api/mobile-copilotkit/[[...path]]/route.ts` builds a
   `CopilotRuntime` whose `agents()` factory calls `makeAgent(...)`, wrapped
   in `createCopilotHonoHandler` and exported as the route's GET/POST.
4. `makeAgent` (`packages/agent-core/src/agent.ts`) is the actual
   orchestrator: builds a `BuiltInAgent` with `model: resolveModel()`, a
   system prompt, `maxSteps: 10` (tool-call loop budget — defaults to 1,
   which breaks any agent with tools if left unset), and `mcpServers` (empty
   unless a workplace/backend MCP server is wired in).
5. The tool-call loop runs entirely server-side; results stream back to the
   phone, where `useRenderToolCall()` matches each tool call to a native card
   renderer.

**For Resse.ai:** replace `MOBILE_FINANCE_PROMPT` with a receptionist prompt;
replace the finance tools with appointment/queue/business-FAQ tools. Decide
early where appointment data actually lives — the finance sample's state is
RN-memory-only (lost on reload), which is fine for a demo but wrong for a
kiosk that needs appointments to survive an app/tablet restart. Put real
appointment data behind the backend (Postgres/SQLite/Supabase/whatever's
fastest) as CopilotKit backend actions or a small MCP server, same shape as
the kit's existing `workplaceMcpServers()` pattern.

### 2. Voice track (separate from the above — not `BuiltInAgent`)

- Uses `@openai/agents/realtime` (`RealtimeAgent`/`RealtimeSession`), not the
  CopilotKit runtime.
- The Next.js backend's only job is minting a short-lived OpenAI Realtime
  token so the phone never holds the real API key
  (`apps/web/src/app/api/realtime-token/route.ts` — reusable as-is).
- The kit's existing sample (`apps/web/src/app/voice/page.tsx`) connects with
  `transport: "webrtc"` using **browser** WebRTC APIs — this does not exist
  on Expo out of the box.

**Open question to spike immediately, before committing further:** how does
voice actually work on the Expo app? Options, roughly in order of effort:

1. `react-native-webrtc` for the same WebRTC transport — requires an EAS dev
   build, no Expo Go.
2. WebSocket transport to the Realtime API, streaming audio buffers captured
   via `expo-av`/`expo-audio` — no native module needed, but you own the
   chunking/streaming logic.
3. Fallback: push-to-talk loop — record a clip, server does STT (Whisper),
   run it through the existing `BuiltInAgent` turn, TTS the reply, play it
   back. Not full-duplex, but reuses the existing backend with plain HTTP and
   no native dependency at all. Lowest risk, easiest to demo reliably.

This decision gates the whole product's interaction model — spike it before
building anything else.

## Naming

Went with **Resse.ai**. Earlier brainstormed alternatives (Tamil-rooted,
paired with the receptionist/voice concept, kept here in case naming comes up
again — e.g. sub-brand, agent persona name, etc.):

| Name | Root | Meaning |
|---|---|---|
| Kural | குரல் | voice |
| Vasal | வாசல் | doorway/threshold |
| Thunai | துணை | companion/support/aid |
| Vanakkam | வணக்கம் | greeting/hello |
| Suvagatham | சுவாகதம் | formal welcome |
| Mugam | முகம் | face |
| Nalam | நலம் | well-being |

## Next steps

1. Spike the voice transport on Expo (the one unresolved risk above).
2. ~~Strip `apps/channel`, repurpose `apps/web` as the backend, gut the
   finance-specific parts of `apps/mobile`.~~ Done.
3. ~~Pick the demo spine (one flow) and build outward from there: onboarding
   (Exa scrape + confirm) → appointment data model → greet/check-in/
   reschedule → visible result → one failure/cancellation path.~~ The
   appointment flow (minus Exa onboarding) is built and verified live:
   business info, appointment queue, check-in/no-show/cancel with an
   approval card, and a working reject case (re-checking-in a completed
   visit).
4. Decide and stand up the persistent datastore for appointments before
   wiring the agent tools that touch it. Now more urgent: sign-in exists,
   but there is no multi-tenant data model yet — every account currently
   sees the same shared sample business.
5. **Auth/navigation shell added:** Splash → Google sign-in (PKCE, requests
   Calendar scope) → Dashboard → FrontDesk (the existing chat flow). See
   `apps/mobile/README.md#sign-in-with-google` for Google Cloud Console
   setup. Untested against a real Google client so far (no credentials in
   this dev environment).

   Chose the redirect-bridge approach over an EAS dev client, since the app
   is still being tested through plain Expo Go (no local Android/iOS build
   set up yet): a "Web application" Google OAuth client points at a new
   backend route, `apps/web/.../api/auth/google/callback`, which 302s the
   phone's browser to the app's own `exp://` link (built with
   `Linking.createURL`, which Expo Go — unlike an arbitrary https URL or
   custom scheme — actually owns). A `Linking` listener in
   `use-google-auth.ts` catches that and finishes the code exchange. This
   is more moving parts than a native redirect (the LAN IP must stay
   stable, there's a real server hop in the middle), but needs no native
   build. If a local Android/iOS dev client becomes available later
   (`npx expo run:android`), switching the Google client to a native
   "Android"/"iOS" type with a real SHA-1 and pointing `redirectUri`
   straight at the app's own scheme would be the more robust path — revisit
   then.
6. Calendar scope is requested at sign-in, but nothing calls the Calendar
   API yet — that's still a separate, unbuilt step.
