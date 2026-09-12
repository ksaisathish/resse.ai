import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
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
 * Auto-stops on its own in two ways, so a hands-free caller (see
 * @resse/presence) never has to babysit a fixed timer: once metering
 * (`isMeteringEnabled`) reports silence (below `silenceThresholdDb`) for
 * `autoStopSilenceMs`, or unconditionally after `autoStopMaxDurationMs` as a
 * safety cap if metering is unsupported or the room never reads as quiet.
 * A caller can still call `stopListening()` manually at any time (e.g. on
 * button release) — whichever happens first wins, and `onTranscript` fires
 * exactly once either way.
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const {
    onTranscript,
    onError,
    autoStopSilenceMs = 1500,
    autoStopMaxDurationMs = 12000,
    silenceThresholdDb = -35,
    autoStopGraceMs = 1200,
    ...config
  } = options;
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const hasPermission = useRef(false);
  const recordingStartedAt = useRef(0);
  const lastLoudAt = useRef(0);
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
    autoStopping.current = false;
    setIsRecording(true);
  }, [recorder, onError]);

  const stopListening = useCallback(async (): Promise<string | null> => {
    if (!isRecording) return null;
    setIsRecording(false);
    await recorder.stop();
    const uri = recorder.uri;
    if (!uri) {
      onError?.(new Error("Recording finished with no file URI."));
      return null;
    }

    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(uri, config);
      onTranscript?.(text);
      return text;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
      return null;
    } finally {
      setIsTranscribing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, recorder, onTranscript, onError]);

  // Silence/max-duration watchdog. Runs on every metering sample rather than
  // its own setInterval, since useAudioRecorderState is already polling the
  // recorder — piggybacking avoids a second timer racing the same state.
  useEffect(() => {
    if (!isRecording || autoStopping.current) return;
    if (autoStopSilenceMs <= 0 && autoStopMaxDurationMs <= 0) return;

    const now = Date.now();
    const metering = recorderState.metering;
    if (typeof metering === "number" && metering > silenceThresholdDb) {
      lastLoudAt.current = now;
    }

    const elapsedSinceStart = now - recordingStartedAt.current;
    const elapsedSinceLoud = now - (lastLoudAt.current || recordingStartedAt.current);

    const hitMaxDuration = autoStopMaxDurationMs > 0 && elapsedSinceStart >= autoStopMaxDurationMs;
    const hitSilence =
      autoStopSilenceMs > 0 &&
      elapsedSinceStart >= autoStopGraceMs &&
      elapsedSinceLoud >= autoStopSilenceMs;

    if (hitMaxDuration || hitSilence) {
      autoStopping.current = true;
      void stopListening();
    }
  }, [
    isRecording,
    recorderState.metering,
    autoStopSilenceMs,
    autoStopMaxDurationMs,
    silenceThresholdDb,
    autoStopGraceMs,
    stopListening,
  ]);

  return { isRecording, isTranscribing, startListening, stopListening };
}
