/**
 * Shared agent/voice wiring behind both the plain Chat screen and the
 * hands-free Receptionist screen. Pulled out so the two screens can render
 * completely different UI (a normal message list + composer vs. a
 * full-screen avatar with no visible chat at all) without duplicating the
 * CopilotKit/TTS/STT plumbing between them.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent, useCopilotKit } from "@copilotkit/react-native/headless";
import type { TalkingAvatarHandle } from "@resse/talking-avatar";
import { useTextToSpeech } from "@resse/tts";
import { useSpeechToText } from "@resse/stt";
import { deriveActiveToolLabel } from "@resse/tool-status-banner";
import { initialReception, type ReceptionSnapshot } from "@/reception";
import { createUserMessageId } from "@/message-id";
import { BACKEND_ORIGIN } from "@/config";
import { loadReceptionSnapshot, saveReceptionSnapshot } from "@/reception-store";
import { loadSettings, type TtsMode } from "@/settings-store";

export interface ReceptionAgentOptions {
  /** Called when a listening window closed without anyone actually speaking.
   * Distinct from an error — see @resse/stt's onNoSpeech. The hands-free
   * screen uses it to end a conversation quietly instead of showing a
   * banner. */
  onNoSpeech?: () => void;
}

export function useReceptionAgent(options: ReceptionAgentOptions = {}) {
  const { onNoSpeech } = options;
  const avatarRef = useRef<TalkingAvatarHandle>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const { agent, isReady } = useAgent({ agentId: "default" });
  const { copilotkit } = useCopilotKit();
  const [reception, setReception] = useState<ReceptionSnapshot>(initialReception);
  const [ttsMode, setTtsMode] = useState<TtsMode>("robotic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // Distinguishes "haven't loaded the persisted snapshot yet" from "user
  // cleared everything" — without it, the very first render's setReception
  // effect below would immediately overwrite whatever loadReceptionSnapshot
  // returns with the still-default `reception` state.
  const hasLoadedReception = useRef(false);

  const { speak, stop: stopSpeaking, isSpeaking } = useTextToSpeech({
    mode: ttsMode,
    baseUrl: BACKEND_ORIGIN,
    onStart: () => avatarRef.current?.talk(),
    onDone: () => avatarRef.current?.idle(),
    onFallback: (fallbackError) =>
      console.warn("Realistic TTS failed, used robotic instead:", fallbackError.message),
  });

  // The avatar's talking clip now loops until it's explicitly told to stop
  // (see @resse/talking-avatar), so a speech that ends without firing
  // onDone — interrupted by stopSpeaking(), or an engine error path —
  // would otherwise leave it mouthing silently forever. isSpeaking going
  // false is the one signal that covers every one of those endings.
  useEffect(() => {
    if (!isSpeaking) avatarRef.current?.idle();
  }, [isSpeaking]);

  // Loads the persisted reception snapshot (business/clients/appointments,
  // already layered with any saved org override — see reception-store.ts)
  // and the user's voice preference (admin-settings.tsx) once on mount.
  useEffect(() => {
    void loadReceptionSnapshot().then((snapshot) => {
      hasLoadedReception.current = true;
      setReception(snapshot);
    });
    void loadSettings().then((settings) => setTtsMode(settings.ttsMode));
  }, []);

  // Persists every change (a booking, a check-in, an admin edit) so it
  // survives navigation and app restarts, and shows up in the admin screens.
  useEffect(() => {
    if (!hasLoadedReception.current) return;
    void saveReceptionSnapshot(reception);
  }, [reception]);

  const sendText = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || busy) return;
      if (!isReady) {
        setError("Still connecting to the local CopilotKit runtime. Try again in a moment.");
        return;
      }
      setError(undefined);
      setBusy(true);

      try {
        agent.addMessage({
          id: createUserMessageId(),
          role: "user",
          content: text,
        });
        await copilotkit.runAgent({ agent });

        const latestAssistantMessage = [...agent.messages]
          .reverse()
          .find((message) => message.role === "assistant");
        const replyText =
          latestAssistantMessage && typeof latestAssistantMessage.content === "string"
            ? latestAssistantMessage.content
            : "";
        if (
          latestAssistantMessage &&
          replyText &&
          lastSpokenMessageId.current !== latestAssistantMessage.id
        ) {
          lastSpokenMessageId.current = latestAssistantMessage.id;
          void speak(replyText);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setBusy(false);
      }
    },
    [agent, copilotkit, busy, isReady, speak],
  );

  // onTranscript (not a manual "await stopListening() then send") is what
  // actually sends — stopListening() can now be triggered either by a caller
  // (button release) or by the hook's own silence/max-duration watchdog, and
  // onTranscript is the one path both go through, so this is the single
  // place a transcript turns into an agent turn regardless of which one
  // fired.
  const { isRecording, isTranscribing, startListening, stopListening } = useSpeechToText({
    baseUrl: BACKEND_ORIGIN,
    onTranscript: (text) => void sendText(text),
    onNoSpeech,
    onError: (sttError) => setError(sttError.message),
  });

  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onError: (event) => {
        if (event.context?.agentId !== "default" && event.context?.agentId) return;
        const message = event.error instanceof Error ? event.error.message : String(event.error);
        setError(message);
        setBusy(false);
      },
    });
    return () => subscription.unsubscribe();
  }, [copilotkit]);

  const messages = agent.messages ?? [];
  const conversationMessages = messages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const activeToolLabel = deriveActiveToolLabel(messages);

  return {
    reception,
    setReception,
    agent,
    isReady,
    busy,
    error,
    setError,
    avatarRef,
    sendText,
    isRecording,
    isTranscribing,
    startListening,
    stopListening,
    /** True while TTS is actually playing. The hands-free screen must not
     * open the mic during this or it records — and then transcribes — the
     * avatar's own voice. */
    isSpeaking,
    stopSpeaking,
    messages,
    conversationMessages,
    activeToolLabel,
  };
}
