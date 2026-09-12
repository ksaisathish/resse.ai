import { useCallback, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  useAudioRecorder,
} from "expo-audio";
import { transcribeAudio } from "./transcribeAudio";
import type { UseSpeechToTextOptions, UseSpeechToTextResult } from "./types";

/**
 * Push-to-talk speech-to-text, Expo Go compatible. Records with expo-audio
 * (no native module beyond what Expo Go ships), then uploads the clip to a
 * backend endpoint for transcription — Expo Go has no on-device speech
 * recognition API, so cloud transcription is the only option without
 * ejecting to a dev client.
 *
 * Caller drives the mic explicitly (startListening/stopListening) rather
 * than always-on wake-word listening — pair with a VAD/presence signal
 * (see @resse/presence) to decide *when* to call startListening.
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextResult {
  const { onTranscript, onError, ...config } = options;
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const hasPermission = useRef(false);

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

  return { isRecording, isTranscribing, startListening, stopListening };
}
