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
import { initialReception } from "@/reception";
import { createUserMessageId } from "@/message-id";
import { BACKEND_ORIGIN } from "@/config";
import { loadOrg } from "@/org";

// Flag: "robotic" (default, free, on-device) vs "realistic" (cloud voice via
// /api/tts, small per-character cost). Set EXPO_PUBLIC_TTS_MODE=realistic in
// apps/mobile/.env to flip it — see packages/tts/README.md.
const TTS_MODE = process.env.EXPO_PUBLIC_TTS_MODE === "realistic" ? "realistic" : "robotic";

export function useReceptionAgent() {
  const avatarRef = useRef<TalkingAvatarHandle>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const { agent, isReady } = useAgent({ agentId: "default" });
  const { copilotkit } = useCopilotKit();
  const [reception, setReception] = useState(initialReception);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const { speak } = useTextToSpeech({
    mode: TTS_MODE,
    baseUrl: BACKEND_ORIGIN,
    onStart: () => avatarRef.current?.talk(),
    onDone: () => avatarRef.current?.idle(),
    onFallback: (fallbackError) =>
      console.warn("Realistic TTS failed, used robotic instead:", fallbackError.message),
  });

  // Business info scraped during org onboarding (see create-org-screen.tsx)
  // overrides the bundled demo data once it exists.
  useEffect(() => {
    void loadOrg().then((org) => {
      if (!org) return;
      setReception((current) => ({
        ...current,
        business: {
          name: org.name,
          hours: org.hours,
          services: org.services,
          phone: org.phone,
          email: org.email,
          address: org.address,
          website: org.website,
          description: org.description,
          upiId: org.upiId,
          bookingDepositAmount: org.bookingDepositAmount,
        },
      }));
    });
  }, []);

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
    messages,
    conversationMessages,
    activeToolLabel,
  };
}
