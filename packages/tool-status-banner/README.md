# @resse/tool-status-banner

A small status banner that shows what the receptionist is currently doing —
"Checking today's queue…", "Updating appointment…" — while an agent tool
call is in flight. Presentational only, no backend, no native dependencies.

## Why

The existing chat screen ([`apps/mobile/src/chat.tsx`](../../apps/mobile/src/chat.tsx))
already renders tool call *results* as native cards via `useRenderToolCall()`.
This package adds the piece that's missing: a lightweight, always-visible
indicator that a tool call is *currently running*, for the moments before its
card appears — useful once the interaction is voice-first and there's no
chat transcript on screen to imply "something is happening."

## Installation

```bash
cd apps/mobile
npm install ../../packages/tool-status-banner
```

No other peer dependencies beyond `react`/`react-native`, which the app
already has. Same Metro `watchFolders` note as the other Resse packages
applies.

## Usage

Mount `<ToolCallStatusBanner />` once, near the top of the screen, and feed
it a single `label` string derived from `agent.messages`:

```tsx
import { ToolCallStatusBanner, deriveActiveToolLabel } from "@resse/tool-status-banner";

function ChatScreen() {
  const { agent } = useAgent({ agentId: "default" });
  const activeLabel = deriveActiveToolLabel(agent.messages ?? []);

  return (
    <SafeAreaView>
      <ToolCallStatusBanner label={activeLabel} />
      {/* ...rest of the screen... */}
    </SafeAreaView>
  );
}
```

`deriveActiveToolLabel` walks `messages` for the most recent tool call that
has no matching `role: "tool"` result yet (the same "is this call still
running" signal `chat.tsx` already computes per-bubble via `toolMessage`) and
maps its name to a friendly label via `labelForToolName`. It's duck-typed —
no dependency on `@copilotkit/react-native` types — so double-check it still
matches that surface's message shape if `chat.tsx` changes.

### Custom labels

Add entries to your own label map instead of (or alongside) the built-in one
as you add tools:

```tsx
import { deriveActiveToolLabel } from "@resse/tool-status-banner";

const labels: Record<string, string> = {
  get_business_info: "Checking business info…",
  list_appointments: "Checking today's queue…",
  check_in_appointment: "Updating appointment…",
  book_appointment: "Booking your appointment…", // a tool that doesn't exist yet, as an example
};

const activeLabel = deriveActiveToolLabel(agent.messages ?? [], (name) => labels[name] ?? `Working on "${name}"…`);
```

## API

### `<ToolCallStatusBanner label={string | null} />`

Renders nothing when `label` is falsy; otherwise slides/fades in a pill with
a spinner and the label text. `animationDurationMs` (default `180`) controls
the transition speed.

### `deriveActiveToolLabel(messages, labelFn?)`

Returns the label for the most recent unresolved tool call, or `null`.

### `labelForToolName(name, args?)`

The default label function, covering the tools already defined in
`apps/mobile/src/tools.tsx`. Unmapped tool names fall back to
`Working on "<name>"…` so a new tool never silently shows nothing.
