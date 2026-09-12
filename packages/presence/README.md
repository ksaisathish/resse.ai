# @resse/presence

Camera-based presence detection for the Resse.ai kiosk — "notice someone
walked up, then start listening." **Partially standalone**: the camera
capture loop is a real, Expo-Go-compatible implementation; the actual
face/person detection is a pluggable function, on purpose — see below.

> **Status:** two working `checkPresence` implementations are included —
> `useMediaPipePresenceChecker` (on-device, default — see below) and
> `createVisionPresenceChecker` (cloud vision-LLM fallback, kept for
> reference/comparison). Both are Expo-Go compatible.

## Why real on-device face detection looked impossible in Expo Go, and the option that isn't

You asked to stay in Expo Go — no `expo prebuild`, no dev client, no custom
native modules. That constraint rules out most real-time, on-device face
detection options:

| Option | Face detection? | Expo Go compatible? |
|---|---|---|
| `expo-face-detector` | Yes | **No** — deprecated and removed from the Expo SDK; it depended on Google ML Kit native code that Expo Go no longer bundles |
| `react-native-vision-camera` + a frame-processor face plugin | Yes, real-time, on-device | **No** — frame processors require a custom native module, which requires a dev client (`expo prebuild` / EAS build) |
| `expo-camera`'s old `onFacesDetected` prop | Yes (historically) | **No** — removed in modern Expo SDKs for the same ML-Kit-native reason |
| Periodic still-frame capture + cloud vision call | Yes, via a multimodal LLM | **Yes** — `expo-camera`'s `takePictureAsync` is a plain JS API Expo Go ships |
| **MediaPipe Tasks Vision (WASM) inside a hidden WebView** | Yes, real on-device inference, no native module | **Yes** — `react-native-webview` ships in Expo Go, and MediaPipe's web build is plain JS/WASM running inside that WebView's JS engine, not a native binding |
| Pure client-side motion/brightness diffing on captured frames | No true face detection, just "something changed" | **Yes**, but needs pixel access, which itself needs an image-decoding library — RN has no built-in raw-pixel API either |

So there are three realistic paths inside Expo Go, in order of preference:

1. **On-device MediaPipe via WebView** (what `useMediaPipePresenceChecker`
   implements, and what `presence-trigger.tsx` uses by default): capture a
   low-res photo, hand it to a hidden WebView running
   `@mediapipe/tasks-vision` (loaded from jsdelivr) + Google's public
   BlazeFace model, get a face count back over `postMessage`. Real
   on-device inference, no per-call cost, no network round trip per frame —
   only the WASM/model download on first mount costs network time. Slower
   than a true native frame processor (WebView JS/WASM, not compiled native
   code) but meaningfully faster and cheaper than a cloud call.
2. **Cloud vision confirm** (`createVisionPresenceChecker`, kept for
   reference/comparison — see `apps/web/src/app/api/vision-presence/route.ts`,
   OpenAI `gpt-4o-mini`): capture a low-res photo, send it to a
   vision-capable LLM, get a yes/no back. Simpler code path, but costs money
   per call and adds network latency (typically 0.5–2s per check).
3. **A physical trigger instead of vision**: a doorbell-style button, a
   cheap PIR motion sensor wired to a companion device, or simply "tap to
   start talking" on the kiosk screen. Zero ML, zero cost, instant, and
   arguably a *better* UX for a receptionist kiosk than always-on camera
   inference — most real kiosks (ATMs, check-in terminals) use touch, not
   vision, to start an interaction. Still worth keeping visible as a
   fallback even with option 1 wired up.

If a real dev-client build becomes viable later (post-hackathon),
`react-native-vision-camera`'s face-detection frame processor is the fastest
option and the correct next upgrade — this package's `PresenceChecker`
interface was designed so that swap doesn't change any calling code.

## `useMediaPipePresenceChecker` — on-device, default

```tsx
import { useRef } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, useMediaPipePresenceChecker } from "@resse/presence";

function KioskCamera({ onGreet }: { onGreet: () => void }) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const { checkPresence, element, isReady } = useMediaPipePresenceChecker();

  const { start } = useFacePresence(cameraRef, {
    checkPresence,
    intervalMs: 4000,
    onPresent: onGreet,
  });

  if (!permission?.granted) {
    requestPermission();
    return null;
  }

  return (
    <>
      {element /* mount the hidden MediaPipe WebView once */}
      <CameraView
        ref={cameraRef}
        style={{ width: 1, height: 1, opacity: 0 }}
        onCameraReady={() => isReady && start()}
      />
    </>
  );
}
```

Notes:
- `element` is a hidden 1×1 `<WebView>` — mount it once, anywhere in the
  tree; `checkPresence` talks to it over `postMessage` under the hood.
- `isReady` flips to `true` once the WASM runtime and model have finished
  loading in the WebView (a few hundred ms to a couple seconds on first
  mount, depending on network and device). `checkPresence` rejects while
  it's `false` — gate `start()` on it, as above, so you don't waste the
  first few interval ticks.
- Only one check runs at a time; `checkPresence` rejects if a previous
  frame's response hasn't come back yet — matches how `useFacePresence`
  already calls it (one check per interval tick).
- Requires `react-native-webview` as a dependency (see Installation).
- The detector uses Google's `blaze_face_short_range` model on the `CPU`
  delegate for broad WebView compatibility. If your target devices'
  WebViews support MediaPipe's WebGL path reliably, switching
  `mediapipeFaceHtml.ts`'s `delegate` to `"GPU"` is faster.

## What's actually implemented here

- `useFacePresence(cameraRef, options)` — a capture loop: every
  `intervalMs`, takes a low-res photo from your `expo-camera` `CameraView`
  and calls your `checkPresence` function with the photo URI. Tracks
  `isPresent`/`isChecking` and fires `onPresent`/`onAbsent` on transitions.
  This part is fully real and Expo Go compatible.
- `useMediaPipePresenceChecker()` — a ready-to-use `checkPresence` plus a
  hidden WebView `element`, running MediaPipe Tasks Vision on-device (see
  above). This is what `presence-trigger.tsx` uses by default.
- `createVisionPresenceChecker(config)` — a ready-to-use `checkPresence`
  that POSTs the frame to `/api/vision-presence` (reference backend at
  [`apps/web/src/app/api/vision-presence/route.ts`](../../apps/web/src/app/api/vision-presence/route.ts),
  OpenAI `gpt-4o-mini` vision by default) and returns its yes/no answer. Kept
  as an alternative/reference implementation.

## Installation

```bash
cd apps/mobile
npm install ../../packages/presence
npm install expo-camera expo-file-system react-native-webview
```

Same Metro `watchFolders` note as the other Resse packages applies.

## Usage (cloud vision-LLM variant)

The on-device `useMediaPipePresenceChecker` example is above; here's the
same wiring using the cloud fallback instead:

```tsx
import { useRef, useState } from "react";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFacePresence, createVisionPresenceChecker } from "@resse/presence";

const ENABLE_FACE_PRESENCE = process.env.EXPO_PUBLIC_ENABLE_FACE_PRESENCE === "true"; // flag, default off

function KioskCamera({ onGreet }: { onGreet: () => void }) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const checkPresence = createVisionPresenceChecker({ baseUrl: RUNTIME_HOST });
  const { isPresent, start } = useFacePresence(cameraRef, {
    checkPresence,
    intervalMs: 3000, // don't go much lower than this — every tick is a paid vision call
    onPresent: onGreet,
  });

  if (!ENABLE_FACE_PRESENCE) return null; // flag off: rely on tap-to-talk instead
  if (!permission?.granted) {
    requestPermission();
    return null;
  }

  return (
    <CameraView
      ref={cameraRef}
      style={{ width: 1, height: 1, opacity: 0 }} // headless capture, no preview needed
      onCameraReady={start}
    />
  );
}
```

## The flag

`ENABLE_FACE_PRESENCE` (suggested env: `EXPO_PUBLIC_ENABLE_FACE_PRESENCE`,
default `false`/unset): when off, skip mounting the camera entirely and
drive the conversation start from a tap/button instead. When on, the camera
loop runs alongside the tap affordance — either can start the interaction.
Keep it off by default; flip it on once you've confirmed the per-call cost
and latency are acceptable for how long the kiosk runs per day.

## Cost and latency, concretely

With `gpt-4o-mini` vision at a 3-second interval, a kiosk running 8 hours/day
makes ~9,600 checks/day. At low-res/cheap-tier vision pricing this is a few
dollars a day — check current OpenAI pricing before committing, and
consider widening `intervalMs` (or gating it behind a cheaper first-pass
trigger, like a hardware presence sensor or the phone's proximity/ambient
light sensor) if that's too much for your budget. Each check also adds
network latency (typically under 2s with a fast model, but on a flaky
connection — see the notes earlier in this session — it can stall), so
don't block the greeting entirely on this; a tap-to-talk button should
always be visible as the fallback.
