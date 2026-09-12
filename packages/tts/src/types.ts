export type TtsMode = "robotic" | "realistic";

export interface TextToSpeechConfig {
  /**
   * "robotic" (default): expo-speech, on-device, free, zero network latency,
   * works fully offline. Sounds like a standard OS TTS voice.
   *
   * "realistic": calls a backend endpoint for a cloud-synthesized voice
   * (OpenAI TTS by default — see apps/web/src/app/api/tts/route.ts), then
   * plays the returned audio. Costs a small amount per character; falls back
   * to "robotic" automatically on any failure so the avatar never goes silent.
   */
  mode?: TtsMode;
  /** Endpoint used only in "realistic" mode. Defaults to "/api/tts". */
  endpoint?: string;
  /** Backend host; required if `endpoint` is relative. */
  baseUrl?: string;
  /** Provider-specific voice name, passed through to the backend as-is. */
  voice?: string;
}

export interface UseTextToSpeechOptions extends TextToSpeechConfig {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
  /** Called when "realistic" mode fails and playback fell back to "robotic". */
  onFallback?: (error: Error) => void;
}

export interface UseTextToSpeechResult {
  isSpeaking: boolean;
  speak: (text: string) => Promise<void>;
  stop: () => void;
}
