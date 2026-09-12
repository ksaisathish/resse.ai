# @resse/talking-avatar

A plug-and-play idle/talking video avatar component for the Resse.ai kiosk
app. Ports the dual-layer crossfade pattern proven out in
[`talkingpoc/index.html`](../../talkingpoc/index.html) to React
Native/Expo, using [`expo-video`](https://docs.expo.dev/versions/latest/sdk/video/).

Two video layers are stacked: a looping **idle** clip underneath, and a
one-shot **talking** clip on top. Calling `talk()` crossfades the talking
layer in and plays it; when it ends, the component automatically crossfades
back to idle. No black flash, no src-swap jump — same idea as the web POC.

> **Status:** written and reviewed, but **not yet run inside the Expo app**
> (per the current integration plan, `apps/mobile` isn't being touched until
> this lib is finalized). Sanity-check the `expo-video` API calls below
> against whatever SDK version is installed at integration time — the
> `playToEnd` event name and `useVideoPlayer` setup-callback shape have
> shifted across `expo-video` releases.

## Why this exists

See [`RESSE_IDEATION_CONTEXT.md`](../../RESSE_IDEATION_CONTEXT.md) — the
receptionist kiosk needs a talking avatar synced to TTS output. This package
is the *presentation* layer only: it does not generate video, run TTS, or
know anything about your agent/voice pipeline. You feed it two video sources
and call `talk()`/`idle()` at the right moments.

For how the idle/talking clips themselves were generated (and how to
generate better ones, or wire in real per-utterance lip-sync later via
SadTalker/Wav2Lip), see [`talkingpoc/prompt`](../../talkingpoc/prompt).

## Installation (when you're ready to integrate)

This package is **not** part of the root npm workspace's mobile story —
`apps/mobile` is intentionally excluded from the workspace (see
`RESSE_IDEATION_CONTEXT.md`, "Architecture decision" section) because Expo
pins its own React Native version stack. To pull this package into the
mobile app:

```bash
cd apps/mobile
npm install ../../packages/talking-avatar
npm install expo-video   # peer dependency, if not already present
```

Because this package ships TypeScript source directly (no build step), make
sure Metro is configured to transpile it rather than treat it as a plain
`node_modules` package. In `apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, "../../packages/talking-avatar")];
module.exports = config;
```

(Exact wiring may need adjustment depending on how `npm install <local path>`
resolves it — symlink vs. copy. Verify with `expo start` once wired in.)

## Usage

```tsx
import { useRef } from "react";
import { TalkingAvatar, defaultIdleSource, defaultTalkingSource } from "@resse/talking-avatar";
import type { TalkingAvatarHandle } from "@resse/talking-avatar";

function ReceptionistScreen() {
  const avatarRef = useRef<TalkingAvatarHandle>(null);

  async function speak(ttsAudioUri: string) {
    avatarRef.current?.talk();
    const { sound } = await Audio.Sound.createAsync({ uri: ttsAudioUri });
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        avatarRef.current?.idle();
      }
    });
  }

  return (
    <TalkingAvatar
      ref={avatarRef}
      idleSource={defaultIdleSource}
      talkingSource={defaultTalkingSource}
      onStateChange={(state) => console.log("avatar state:", state)}
    />
  );
}
```

Swap `defaultIdleSource`/`defaultTalkingSource` (sample POC clips bundled in
`assets/`) for your own `require("./assets/idle.mp4")` or a remote URI once
production clips are ready — same prop shape either way (`expo-video`'s
`VideoSource` type accepts both).

## API

### `<TalkingAvatar />` props

| Prop | Type | Default | Description |
|---|---|---|---|
| `idleSource` | `VideoSource` | — (required) | Looping resting-state clip |
| `talkingSource` | `VideoSource` | — (required) | One-shot talking clip; auto-reverts to idle on end |
| `aspectRatio` | `number` | unset | Locks the frame to a fixed ratio. Leave unset to fill whatever size `style` gives the container (e.g. `StyleSheet.absoluteFillObject` for a full-screen background) — `contentFit="cover"` crops to fill regardless of the source clips' own aspect ratio, so this isn't required. The bundled sample clips are landscape (672×448 / 1280×720), not portrait. |
| `crossfadeDurationMs` | `number` | `200` | Fade duration between layers |
| `style` | `ViewStyle` | — | Extra styling on the outer container |
| `onStateChange` | `(state: 'idle' \| 'talking') => void` | — | Fires on every state transition, including the automatic talking→idle one |

### Ref handle (`TalkingAvatarHandle`)

| Method | Description |
|---|---|
| `talk()` | Crossfade to the talking clip and play it. Call this the instant your TTS audio starts. |
| `idle()` | Crossfade back to idle immediately — use this on audio end, or to hard-interrupt (e.g. user talks over the avatar). |
| `getState()` | Returns current `'idle' \| 'talking'`, read imperatively if you need to guard against double-triggering. |

## Integration checklist (for when this gets wired into the app)

1. `npm install ../../packages/talking-avatar` + `expo-video` from `apps/mobile`.
2. Wire Metro's `watchFolders` (see above) so the TS source transpiles correctly.
3. Drop `<TalkingAvatar />` into the receptionist screen, driven by refs as shown above.
4. Hook `talk()`/`idle()` into your actual voice pipeline's audio start/end events (see the "Voice track" section of `RESSE_IDEATION_CONTEXT.md` for how audio playback is expected to work on Expo).
5. Replace the bundled sample clips with production-quality idle/talking video — regenerate using the prompts in `talkingpoc/prompt`, keeping the same 9:16 framing/posture/background so the crossfade stays seamless.
6. If/when real per-utterance lip-sync is needed (audio-matched mouth movement instead of a generic talking loop), see the SadTalker section of `talkingpoc/prompt` — that becomes the source for `talkingSource` instead of a static bundled clip.
