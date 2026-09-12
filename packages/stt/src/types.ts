export interface SpeechToTextConfig {
  /**
   * Absolute or relative endpoint that accepts a multipart audio upload and
   * returns `{ text: string }`. Relative paths are resolved against `baseUrl`.
   * Defaults to "/api/stt".
   */
  endpoint?: string;
  /**
   * Backend host, e.g. the same host used for EXPO_PUBLIC_RUNTIME_URL
   * (see apps/mobile/src/config.ts) minus its `/api/mobile-copilotkit` path.
   * Required if `endpoint` is relative.
   */
  baseUrl?: string;
}

export interface UseSpeechToTextOptions extends SpeechToTextConfig {
  onTranscript?: (text: string) => void;
  onError?: (error: Error) => void;
}

export interface UseSpeechToTextResult {
  /** True while the mic is actively recording. */
  isRecording: boolean;
  /** True while the recorded clip is uploading/transcribing. */
  isTranscribing: boolean;
  /** Begin recording. Requests mic permission on first call. */
  startListening: () => Promise<void>;
  /** Stop recording, upload, and resolve with the transcript (or null on failure). */
  stopListening: () => Promise<string | null>;
}
