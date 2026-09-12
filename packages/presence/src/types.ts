export interface PresenceCheckResult {
  /** How many people the checker detected. */
  count: number;
  /** Convenience — equivalent to `count > 0`. */
  present: boolean;
  /** Optional confidence/debug info the checker chose to surface. */
  detail?: unknown;
}

/** Pluggable detector: given a captured frame's local file URI, decide if a person is present. */
export type PresenceChecker = (photoUri: string) => Promise<PresenceCheckResult>;

export interface UseFacePresenceOptions {
  /** How often to capture a frame while active, in ms. Defaults to 2500. */
  intervalMs?: number;
  /** Temporarily suspends capture without resetting what's already been
   * detected (unlike stop()). Use it while the surface is mid-interaction —
   * someone is talking to it, or is being asked to approve something — when
   * another capture can only cost battery and churn state under them. */
  paused?: boolean;
  /** Required — see README for the built-in `createVisionPresenceChecker` or write your own. */
  checkPresence: PresenceChecker;
  onPresent?: () => void;
  onAbsent?: () => void;
  onError?: (error: Error) => void;
}

export interface UseFacePresenceResult {
  isPresent: boolean;
  /** How many people the most recent check detected. 0 before the first
   * check completes. */
  count: number;
  isChecking: boolean;
  /** Start the capture loop. Requires a mounted, ready expo-camera CameraView ref. */
  start: () => void;
  stop: () => void;
}
