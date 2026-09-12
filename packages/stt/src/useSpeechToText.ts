import { useCallback, useEffect, useRef, useState } from "react";
import { AudioModule, RecordingPresets, useAudioRecorder } from "expo-audio";
import { transcribeAudio } from "./transcribeAudio";
import type { UseSpeechToTextOptions, UseSpeechToTextResult } from "./types";

const METERING_POLL_MS = 200;

/**
 * Push-to-talk speech-to-text, Expo Go compatible. Records with expo-audio
 * (no native module beyond what Expo Go ships), then uploads the clip to a
 * backend endpoint for transcription — Expo Go has no on-device speech
 * recognition API, so cloud transcription is the only option without
 * ejecting to a dev client.
 *
 * Auto-stops on its own so a hands-free caller (see @resse/presence) never
 * has to babysit a timer: after `autoStopSilenceMs` of metered silence, or
 * unconditionally at `autoStopMaxDurationMs`. A caller can still call
 * `stopListening()` manually (e.g. button release) — whichever happens
 * first wins, and `onTranscript` fires exactly once either way.
 *
 * Two things this deliberately does NOT do, both learned the hard way:
 *
 * 1. It never polls recorder state into React state. `useAudioRecorderState`
 *    re-renders its consumer on every sample, forever — which, in a screen
 *    that also hosts video/camera/WebView surfaces, shows up as constant
 *    visible flicker. Metering is sampled into refs instead, so the
 *    watchdog costs zero renders.
 * 2. It never silence-stops on metering it hasn't actually seen. If a device
 *    reports `metering: undefined`, treating that as "silent" cuts every
 *    clip off at the silence threshold (~1.5s) no matter what the person is
 *    saying. Silence-stopping only arms once a real numeric sample arrives;
 *    otherwise the max-duration cap is the only stop.
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const {
    onTranscript,
    onError,
    onNoSpeech,
    autoStopSilenceMs = 1500,
    autoStopMaxDurationMs = 12000,
    silenceThresholdDb = -35,
    autoStopGraceMs = 1200,
    minDurationMs = 700,
    ...config
  } = options;
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const hasPermission = useRef(false);
  const recordingStartedAt = useRef(0);
  const lastLoudAt = useRef(0);
  const sawMetering = useRef(false);
  const autoStopping = useRef(false);

  const startListening = useCallback(async () => {
    if (!hasPermission.current) {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError?.(new Error("Microphone permission was not granted."));
        return;
      }
      hasPermission.current = true;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
    recordingStartedAt.current = Date.now();
    lastLoudAt.current = 0;
    sawMetering.current = false;
    autoStopping.current = false;
    setIsRecording(true);
  }, [recorder, onError]);

  const stopListening = useCallback(async (): Promise<string | null> => {
    if (!isRecording) return null;
    setIsRecording(false);

    const heldForMs = Date.now() - recordingStartedAt.current;
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      onError?.(new Error("Recording finished with no file URI."));
      return null;
    }
    // Anything this short is mic warm-up, not speech. Uploading it either
    // fails at the transport layer (an effectively empty file) or comes back
    // as an empty transcript, so stop here — as "nobody spoke", not as an
    // error, since a hands-free caller opens the mic speculatively and this
    // is its normal empty outcome.
    if (heldForMs < minDurationMs) {
      onNoSpeech?.();
      return null;
    }

    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(uri, config);
      // A clip of pure silence/room noise transcribes to "" (or whitespace).
      // Passing that on as a transcript would send an empty turn to the
      // agent; it's the same "nobody spoke" outcome as a too-short clip.
      if (!text.trim()) {
        onNoSpeech?.();
        return null;
      }
      onTranscript?.(text);
      return text;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      setIsTranscribing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, recorder, onTranscript, onError, onNoSpeech, minDurationMs]);

  // Keeps the watchdog interval from being torn down and rebuilt every time
  // stopListening's identity changes.
  const stopListeningRef = useRef(stopListening);
  stopListeningRef.current = stopListening;

  // Silence / max-duration watchdog. Its own interval, running only while
  // recording, reading metering straight off the recorder into refs — no
  // component state, so no re-render per sample.
  useEffect(() => {
    if (!isRecording) return;
    if (autoStopSilenceMs <= 0 && autoStopMaxDurationMs <= 0) return;

    const timer = setInterval(() => {
      if (autoStopping.current) return;

      const now = Date.now();
      let metering: number | undefined;
      try {
        metering = recorder.getStatus().metering;
      } catch {
        metering = undefined;
      }

      if (typeof metering === "number" && Number.isFinite(metering)) {
        sawMetering.current = true;
        if (metering > silenceThresholdDb) lastLoudAt.current = now;
      }

      const elapsedSinceStart = now - recordingStartedAt.current;
      const hitMaxDuration =
        autoStopMaxDurationMs > 0 && elapsedSinceStart >= autoStopMaxDurationMs;

      // Only trust silence when this device actually reports levels, and
      // only after we've heard at least one loud sample — otherwise a quiet
      // start would end the clip before the person begins speaking.
      const hitSilence =
        autoStopSilenceMs > 0 &&
        sawMetering.current &&
        lastLoudAt.current > 0 &&
        elapsedSinceStart >= autoStopGraceMs &&
        now - lastLoudAt.current >= autoStopSilenceMs;

      if (hitMaxDuration || hitSilence) {
        autoStopping.current = true;
        void stopListeningRef.current();
      }
    }, METERING_POLL_MS);

    return () => clearInterval(timer);
  }, [
    isRecording,
    recorder,
    autoStopSilenceMs,
    autoStopMaxDurationMs,
    silenceThresholdDb,
    autoStopGraceMs,
  ]);

  return { isRecording, isTranscribing, startListening, stopListening };
}
