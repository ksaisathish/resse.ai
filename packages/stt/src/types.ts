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
  /** Auto-stop recording after this many ms of continuous silence (metering
   * below `silenceThresholdDb`). Set to 0 to disable silence-based
   * auto-stop — `stopListening()` then only stops on manual/explicit call.
   * @default 1500 */
  autoStopSilenceMs?: number;
  /** Hard safety cap: stop recording after this many ms regardless of
   * silence detection, in case metering is unsupported on the platform or
   * the room never reads as quiet (background noise, etc). Set to 0 to
   * disable.
   * @default 12000 */
  autoStopMaxDurationMs?: number;
  /** Metering level in dBFS (typically -160 silence to 0 max) below which
   * audio counts as "silence" for auto-stop purposes. Tune this down (more
   * negative) if quiet speech is being cut off, or up if background noise
   * prevents auto-stop from ever triggering.
   * @default -35 */
  silenceThresholdDb?: number;
  /** Grace period after startListening() before silence-based auto-stop
   * starts counting, so a person who takes a moment to start speaking isn't
   * cut off immediately.
   * @default 1200 */
  autoStopGraceMs?: number;
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
