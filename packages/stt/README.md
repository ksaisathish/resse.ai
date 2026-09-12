# @resse/stt

Push-to-talk speech-to-text for the Resse.ai kiosk app. **Expo Go compatible**
— no custom native modules, no dev client required.

> **Status:** written, not yet run inside the Expo app. Verify the
> `expo-audio` recorder API (`useAudioRecorder`, `RecordingPresets`,
> `AudioModule.requestRecordingPermissionsAsync`) against whatever
> `expo-audio` version is installed at integration time.

## Why cloud-only

Expo Go ships a fixed set of native modules and does not include on-device
speech recognition (no `react-native-voice`, no native `SpeechRecognizer`
binding) — those require a custom dev client, which the "work in Expo Go
without building the app" constraint rules out. So the only Expo-Go-
compatible path is: **record locally with `expo-audio` → upload the clip →
transcribe in the cloud → get text back.** That's what this package does.

If the project later moves off Expo Go to a dev client, on-device STT
becomes viable (e.g. `expo-speech-recognition`), and could be added here as
an alternate `provider` without changing the calling code — the hook's
return shape (`isRecording`, `isTranscribing`, `startListening`,
`stopListening`) would stay the same.

## Installation

```bash
cd apps/mobile
npm install ../../packages/stt
npm install expo-audio   # peer dependency
```

Same Metro `watchFolders` note as `@resse/talking-avatar` applies — see that
package's README.

## Backend requirement

This package expects a backend endpoint (`POST /api/stt` by default) that
accepts a multipart `audio` file and returns `{ text: string }`. A reference
implementation using OpenAI's transcription API lives at
[`apps/web/src/app/api/stt/route.ts`](../../apps/web/src/app/api/stt/route.ts) —
it follows the same "server holds the API key, phone never does" pattern as
the existing `/api/realtime-token` and `/api/search` routes.

## Usage

```tsx
import { useSpeechToText } from "@resse/stt";
import { RUNTIME_HOST } from "@/config"; // your app's backend host, no path suffix

function VoiceButton() {
  const { isRecording, isTranscribing, startListening, stopListening } = useSpeechToText({
    baseUrl: RUNTIME_HOST, // e.g. "http://192.168.1.20:3100"
    onTranscript: (text) => {
      // feed into your agent turn, e.g. agent.addMessage({ role: "user", content: text })
    },
    onError: (error) => console.warn("STT error:", error.message),
  });

  return (
    <Pressable
      onPressIn={() => void startListening()}
      onPressOut={() => void stopListening()}
    >
      <Text>{isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Hold to talk"}</Text>
    </Pressable>
  );
}
```

Pairing with presence detection (`@resse/presence`): call `startListening()`
when presence/wake is detected instead of a press-and-hold button, and
`stopListening()` after a short silence timeout or a fixed max duration —
this package does not implement voice-activity-detection (VAD) itself; it
just handles record → upload → transcribe once you decide the start/stop
boundaries.

## API

### `useSpeechToText(options)`

| Option | Type | Description |
|---|---|---|
| `endpoint` | `string` | Defaults to `"/api/stt"` |
| `baseUrl` | `string` | Required if `endpoint` is relative |
| `onTranscript` | `(text: string) => void` | Called with the transcript once ready |
| `onError` | `(error: Error) => void` | Called on permission denial, recording, or network failure |

Returns `{ isRecording, isTranscribing, startListening, stopListening }`.
`stopListening()` also resolves with the transcript string (or `null` on
failure), so you can `await` it directly instead of only using the callback.

### `transcribeAudio(fileUri, config)`

Lower-level function if you're recording some other way and just need the
upload+transcribe step.

## Cost note

OpenAI's transcription models are billed per minute of audio (Whisper-class
pricing, a few cents per minute as of writing). A push-to-talk pattern keeps
this cheap since you're only transcribing while the button is held — avoid
always-on streaming transcription unless you've confirmed the cost profile
for a kiosk that's live all day.
