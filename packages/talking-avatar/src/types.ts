import type { ViewStyle } from "react-native";
import type { VideoSource } from "expo-video";

export type TalkingAvatarState = "idle" | "talking";

export interface TalkingAvatarHandle {
  /** Switch to the talking clip. Call this the instant your TTS audio starts playing. */
  talk: () => void;
  /** Switch back to the idle loop. Call this on audio end or on interrupt. */
  idle: () => void;
  /** Current state, read imperatively (e.g. to avoid double-triggering). */
  getState: () => TalkingAvatarState;
}

export interface TalkingAvatarProps {
  /** Looping resting-state clip. A `require(...)` asset or a remote/local URI. */
  idleSource: VideoSource;
  /** One-shot talking clip, played once then auto-reverts to idle. */
  talkingSource: VideoSource;
  /** width / height of the avatar frame. Defaults to 9/16 (portrait kiosk). */
  aspectRatio?: number;
  /** Crossfade duration in ms between idle and talking layers. Defaults to 200. */
  crossfadeDurationMs?: number;
  style?: ViewStyle;
  /** Fires whenever the avatar's internal state changes, including the automatic talking -> idle transition. */
  onStateChange?: (state: TalkingAvatarState) => void;
}
