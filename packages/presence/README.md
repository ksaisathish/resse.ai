# @resse/presence

Camera-based presence detection for the Resse.ai kiosk — "notice someone
walked up, then start listening." **Partially standalone**: the camera
capture loop is a real, Expo-Go-compatible implementation; the actual
face/person detection is a pluggable function, on purpose — see below.

> **Status:** capture loop written, not yet run inside the Expo app.
> Detection is intentionally left to you to plug in (a reference
> vision-LLM checker is included) — this is the one component of the
> voice/CV ask that couldn't be handed over as a finished, working feature
> under the "Expo Go only" constraint. Read the whole README before wiring
> this in; the honest answer is more useful than a component that looks
> finished but isn't.

## Why this isn't a real face detector, and why that's a constraint, not an oversight

You asked to stay in Expo Go — no `expo prebuild`, no dev client, no custom
native modules. That constraint rules out every real-time, on-device face
detection option:

| Option | Face detection? | Expo Go compatible? |
|---|---|---|
| `expo-face-detector` | Yes | **No** — deprecated and removed from the Expo SDK; it depended on Google ML Kit native code that Expo Go no longer bundles |
| `react-native-vision-camera` + a frame-processor face plugin | Yes, real-time, on-device | **No** — frame processors require a custom native module, which requires a dev client (`expo prebuild` / EAS build) |
| `expo-camera`'s old `onFacesDetected` prop | Yes (historically) | **No** — removed in modern Expo SDKs for the same ML-Kit-native reason |
| Periodic still-frame capture + cloud vision call | Yes, via a multimodal LLM | **Yes** — `expo-camera`'s `takePictureAsync` is a plain JS API Expo Go ships |
| Pure client-side motion/brightness diffing on captured frames | No true face detection, just "something changed" | **Yes**, but needs pixel access, which itself needs an image-decoding library — RN has no built-in raw-pixel API either |

So inside Expo Go, the only two realistic paths are:

1. **Cloud vision confirm** (what `createVisionPresenceChecker` implements):
   capture a low-res photo every few seconds, send it to a vision-capable LLM
   asking "is a person facing the camera," get a yes/no back. Real face
   presence detection, but costs money per call and has network latency
   (typically 0.5–2s per check with a fast/cheap model).
2. **A physical trigger instead of vision**: a doorbell-style button, a
   cheap PIR motion sensor wired to a companion device, or simply "tap to
   start talking" on the kiosk screen. Zero ML, zero cost, instant, and
   arguably a *better* UX for a receptionist kiosk than always-on camera
   inference — most real kiosks (ATMs, check-in terminals) use touch, not
   vision, to start an interaction.

**Recommendation:** ship with option 2 (a visible "tap to talk" affordance)
for the demo, and layer option 1 on top as a flag-gated enhancement — camera
presence *suggests* someone's there and can pre-warm the greeting, but
don't make it the only way to start a conversation. If a real dev-client
build becomes viable later (post-hackathon), `react-native-vision-camera`'s
face-detection frame processor is the correct replacement for
`createVisionPresenceChecker` and would run continuously on-device for
free — this package's `PresenceChecker` interface was designed so that
swap doesn't change any calling code.

## What's actually implemented here

- `useFacePresence(cameraRef, options)` — a capture loop: every
  `intervalMs`, takes a low-res photo from your `expo-camera` `CameraView`
  and calls your `checkPresence` function with the photo URI. Tracks
  `isPresent`/`isChecking` and fires `onPresent`/`onAbsent` on transitions.
  This part is fully real and Expo Go compatible.
- `createVisionPresenceChecker(config)` — a ready-to-use `checkPresence`
  that POSTs the frame to `/api/vision-presence` (reference backend at
  [`apps/web/src/app/api/vision-presence/route.ts`](../../apps/web/src/app/api/vision-presence/route.ts),
  OpenAI `gpt-4o-mini` vision by default) and returns its yes/no answer.

## Installation

```bash
cd apps/mobile
npm install ../../packages/presence
npm install expo-camera expo-file-system
```

Same Metro `watchFolders` note as the other Resse packages applies.

## Usage

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
