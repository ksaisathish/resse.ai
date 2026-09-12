# @resse/tts

Text-to-speech for the Resse.ai kiosk app, with a **robotic/realistic flag**.
Expo Go compatible in both modes — no custom native modules.

> **Status:** written, not yet run inside the Expo app. Verify the
> `expo-speech` and `expo-audio` playback APIs (`Speech.speak` options,
> `createAudioPlayer`, the `playbackStatusUpdate` event name) against
> whatever SDK versions are installed at integration time.

## The flag

```ts
useTextToSpeech({ mode: "robotic" })   // default — free, on-device, offline
useTextToSpeech({ mode: "realistic" }) // cloud voice, small per-character cost
```

- **`robotic`** (default): [`expo-speech`](https://docs.expo.dev/versions/latest/sdk/speech/),
  the OS's built-in TTS engine. Free, zero network latency, works with no
  internet connection, Expo-Go compatible with no setup. Sounds robotic —
  fine for demoing the interaction loop before investing in voice quality.
- **`realistic`**: posts the text to a backend endpoint (`POST /api/tts` by
  default) which calls a cloud TTS provider and returns synthesized audio,
  played back via `expo-audio`. Reference backend at
  [`apps/web/src/app/api/tts/route.ts`](../../apps/web/src/app/api/tts/route.ts)
  uses OpenAI's `tts-1` model — cheap (a few dollars per million characters),
  good-enough quality for a kiosk receptionist. If the network call fails for
  any reason, this package **automatically falls back to `robotic`** so the
  avatar is never silent — wire `onFallback` if you want to surface that in
  the UI.

Recommended default for a hackathon demo: start with `robotic` while you get
the STT → LLM → tool-call → TTS loop working end to end, then flip the flag
to `realistic` once that loop is solid — no code changes elsewhere, just the
one prop.

## Installation

```bash
cd apps/mobile
npm install ../../packages/tts
npm install expo-speech expo-audio expo-file-system
```

Same Metro `watchFolders` note as `@resse/talking-avatar` applies.

## Usage

```tsx
import { useRef } from "react";
import { useTextToSpeech } from "@resse/tts";
import { TalkingAvatar } from "@resse/talking-avatar";
import type { TalkingAvatarHandle } from "@resse/talking-avatar";

function ReceptionistScreen() {
  const avatarRef = useRef<TalkingAvatarHandle>(null);

  const { speak, stop } = useTextToSpeech({
    mode: "robotic", // flip to "realistic" when ready
    baseUrl: RUNTIME_HOST, // only needed for "realistic"
    onStart: () => avatarRef.current?.talk(),
    onDone: () => avatarRef.current?.idle(),
    onFallback: (error) => console.warn("Realistic TTS failed, used robotic instead:", error.message),
  });

  // after the LLM produces a reply:
  // await speak(replyText);

  return <TalkingAvatar ref={avatarRef} idleSource={idle} talkingSource={talking} />;
}
```

This is the exact wiring point `@resse/talking-avatar`'s README describes —
`onStart`/`onDone` here replace the raw `Audio.Sound` example there.

## API

### `useTextToSpeech(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `"robotic" \| "realistic"` | `"robotic"` | The flag |
| `endpoint` | `string` | `"/api/tts"` | Realistic mode only |
| `baseUrl` | `string` | — | Required if `endpoint` is relative |
| `voice` | `string` | — | Passed through to the OS voice list (robotic) or backend (realistic) |
| `onStart` / `onDone` | `() => void` | — | Fires around playback — hook `TalkingAvatar.talk()`/`idle()` here |
| `onError` | `(error: Error) => void` | — | Robotic-mode playback errors |
| `onFallback` | `(error: Error) => void` | — | Fires when realistic mode failed and robotic was used instead |

Returns `{ isSpeaking, speak, stop }`.

## Cost note

OpenAI `tts-1` is billed per character of input text, not per second of
audio — cost scales with how much the receptionist says, not how long it
takes. Keep replies concise (which you'd want anyway for a voice UI) and
this stays cheap even running all day at a kiosk.
