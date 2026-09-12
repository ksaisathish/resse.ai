import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { TalkingAvatarHandle, TalkingAvatarProps, TalkingAvatarState } from "./types";

/**
 * Two-layer video avatar: a looping idle clip sits underneath a one-shot
 * talking clip. Calling `talk()` crossfades the talking layer in and plays
 * it; when it finishes it automatically crossfades back to idle. Mirrors the
 * dual-layer crossfade pattern proven out in talkingpoc/index.html, ported
 * to expo-video for React Native.
 */
export const TalkingAvatar = forwardRef<TalkingAvatarHandle, TalkingAvatarProps>(
  (
    {
      idleSource,
      talkingSource,
      aspectRatio,
      crossfadeDurationMs = 200,
      style,
      onStateChange,
    },
    ref
  ) => {
    const [state, setState] = useState<TalkingAvatarState>("idle");
    const talkingOpacity = useRef(new Animated.Value(0)).current;

    const idlePlayer = useVideoPlayer(idleSource, (player) => {
      player.loop = true;
      player.muted = true;
      player.play();
    });

    // Loops for as long as the avatar is in the talking state. Speech length
    // is decided by the TTS engine at runtime and is almost never the same
    // as this clip's length, so a one-shot clip stops the mouth moving
    // partway through a long answer. `idle()` (called on TTS end) is what
    // ends talking, not the clip's own duration.
    const talkingPlayer = useVideoPlayer(talkingSource, (player) => {
      player.loop = true;
      player.muted = true;
    });

    // `player.play()`/`player.loop` in the setup callbacks above are the
    // documented pattern, but for a local `require(...)` asset the player can
    // still be mid-load at that exact synchronous moment and silently drop
    // them instead of queuing — the idle clip then plays through once and
    // stops dead, or never starts at all. Re-asserting both once the player
    // reports ready is the one point they're guaranteed to take.
    useEffect(() => {
      const subscription = idlePlayer.addListener("statusChange", ({ status }) => {
        // Harmless to call even if the talking layer is currently on top —
        // the idle player sits invisibly underneath either way.
        if (status === "readyToPlay") {
          idlePlayer.loop = true;
          idlePlayer.play();
        }
      });
      return () => subscription.remove();
    }, [idlePlayer]);

    // Belt and braces for the same class of bug: if `loop` still didn't take
    // (seen when the asset finishes loading between the setup callback and
    // the first readyToPlay), restart the idle clip by hand rather than
    // leaving the avatar frozen on its last frame.
    useEffect(() => {
      const subscription = idlePlayer.addListener("playToEnd", () => {
        idlePlayer.currentTime = 0;
        idlePlayer.play();
      });
      return () => subscription.remove();
    }, [idlePlayer]);

    useEffect(() => {
      const subscription = talkingPlayer.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay") talkingPlayer.loop = true;
      });
      return () => subscription.remove();
    }, [talkingPlayer]);

    const goIdle = useCallback(() => {
      Animated.timing(talkingOpacity, {
        toValue: 0,
        duration: crossfadeDurationMs,
        useNativeDriver: true,
      }).start(() => {
        talkingPlayer.pause();
      });
      // Deliberately NOT rewinding to 0: the idle layer has been looping
      // underneath the whole time, so seeking it back to the first frame is
      // a visible jump at exactly the moment the crossfade is trying to hide
      // the transition. Just make sure it's still running.
      idlePlayer.play();
      setState("idle");
      onStateChange?.("idle");
    }, [talkingOpacity, crossfadeDurationMs, talkingPlayer, idlePlayer, onStateChange]);

    const goTalking = useCallback(() => {
      talkingPlayer.currentTime = 0;
      talkingPlayer.play();
      Animated.timing(talkingOpacity, {
        toValue: 1,
        duration: crossfadeDurationMs,
        useNativeDriver: true,
      }).start();
      setState("talking");
      onStateChange?.("talking");
    }, [talkingPlayer, talkingOpacity, crossfadeDurationMs, onStateChange]);

    useImperativeHandle(
      ref,
      () => ({
        talk: goTalking,
        idle: goIdle,
        getState: () => state,
      }),
      [goTalking, goIdle, state]
    );

    return (
      <View style={[styles.container, aspectRatio ? { aspectRatio } : null, style]}>
        <VideoView
          player={idlePlayer}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          pointerEvents="none"
        />
        <Animated.View style={[styles.video, { opacity: talkingOpacity }]} pointerEvents="none">
          <VideoView
            player={talkingPlayer}
            style={styles.video}
            contentFit="cover"
            nativeControls={false}
          />
        </Animated.View>
      </View>
    );
  }
);

TalkingAvatar.displayName = "TalkingAvatar";

const styles = StyleSheet.create({
  container: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  video: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
});
