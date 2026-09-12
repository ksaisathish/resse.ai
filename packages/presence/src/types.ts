export interface PresenceCheckResult {
  present: boolean;
  /** Optional confidence/debug info the checker chose to surface. */
  detail?: unknown;
}

/** Pluggable detector: given a captured frame's local file URI, decide if a person is present. */
export type PresenceChecker = (photoUri: string) => Promise<PresenceCheckResult>;

export interface UseFacePresenceOptions {
  /** How often to capture a frame while active, in ms. Defaults to 2500. */
  intervalMs?: number;
  /** Required — see README for the built-in `createVisionPresenceChecker` or write your own. */
  checkPresence: PresenceChecker;
  onPresent?: () => void;
  onAbsent?: () => void;
  onError?: (error: Error) => void;
}

export interface UseFacePresenceResult {
  isPresent: boolean;
  isChecking: boolean;
  /** Start the capture loop. Requires a mounted, ready expo-camera CameraView ref. */
  start: () => void;
  stop: () => void;
}
