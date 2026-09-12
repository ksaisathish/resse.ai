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

    const talkingPlayer = useVideoPlayer(talkingSource, (player) => {
      player.loop = false;
      player.muted = true;
    });

    // `player.play()` in the setup callback above is the documented pattern,
    // but for a local `require(...)` asset the player can still be mid-load
    // at that exact synchronous moment, and silently drop the call instead of
    // queuing it — the idle loop then never starts until something else
    // (e.g. the first goIdle() after talking) happens to re-trigger it. This
    // re-asserts play() once the player actually reports ready, which is the
    // one point playback is guaranteed to actually take.
    useEffect(() => {
      const subscription = idlePlayer.addListener("statusChange", ({ status }) => {
        // Harmless to call even if the talking layer is currently on top —
        // the idle player sits invisibly underneath either way.
        if (status === "readyToPlay") idlePlayer.play();
      });
      return () => subscription.remove();
    }, [idlePlayer]);

    const goIdle = useCallback(() => {
      Animated.timing(talkingOpacity, {
        toValue: 0,
        duration: crossfadeDurationMs,
        useNativeDriver: true,
      }).start(() => {
        talkingPlayer.pause();
      });
      idlePlayer.currentTime = 0;
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

    useEffect(() => {
      const subscription = talkingPlayer.addListener("playToEnd", () => {
        goIdle();
      });
      return () => subscription.remove();
    }, [talkingPlayer, goIdle]);

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
