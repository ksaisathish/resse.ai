/**
 * A headless chat screen.
 *
 * The prebuilt `<CopilotChat>` lives on the root/components entry points and
 * brings native peers (bottom-sheet, reanimated, gesture-handler) with it. This
 * screen is deliberately hand-rolled on the headless surface so the app has no
 * native dependencies beyond Expo's own.
 *
 * The part worth copying: tool calls are rendered through `useRenderToolCall()`,
 * which resolves the right renderer AND supplies `respond` for a
 * human-in-the-loop tool. Walking the render registry by hand is a known trap —
 * the local `useRenderTool` registry passes only `{ args, status }` with no
 * `respond`, so approvals silently cannot be answered.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  useAgent,
  useCopilotKit,
  useRenderToolCall,
  type ToolCall,
} from "@copilotkit/react-native/headless";
import {
  TalkingAvatar,
  defaultIdleSource,
  defaultTalkingSource,
  type TalkingAvatarHandle,
} from "@resse/talking-avatar";
import { useTextToSpeech } from "@resse/tts";
import { useSpeechToText } from "@resse/stt";
import { ToolCallStatusBanner, deriveActiveToolLabel } from "@resse/tool-status-banner";
import { Tools } from "@/tools";
import { ConnectionStatus } from "@/connection-status";
import { C, styles } from "@/styles";
import { initialReception, upcomingAppointments } from "@/reception";
import { createUserMessageId } from "@/message-id";
import { AssistantMarkdown } from "@/assistant-markdown";
import { BACKEND_ORIGIN } from "@/config";
import { loadOrg } from "@/org";
import { ENABLE_FACE_PRESENCE, PresenceTrigger } from "@/presence-trigger";

// How long a presence-triggered listen stays open before auto-sending —
// there's no voice-activity-detection, so this is a fixed window, not a
// silence detector. See presence-trigger.tsx.
const PRESENCE_AUTO_STOP_MS = 6000;

// Flag: "robotic" (default, free, on-device) vs "realistic" (cloud voice via
// /api/tts, small per-character cost). Set EXPO_PUBLIC_TTS_MODE=realistic in
// apps/mobile/.env to flip it — see packages/tts/README.md.
const TTS_MODE = process.env.EXPO_PUBLIC_TTS_MODE === "realistic" ? "realistic" : "robotic";

export function ChatScreen() {
  const listRef = useRef<FlatList>(null);
  const avatarRef = useRef<TalkingAvatarHandle>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const { agent, isReady } = useAgent({ agentId: "default" });
  const { copilotkit } = useCopilotKit();
  const renderToolCall = useRenderToolCall();
  const [reception, setReception] = useState(initialReception);
  const [draft, setDraft] = useState("");
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

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || busy) return;
    if (!isReady) {
      setError(
        "Still connecting to the local CopilotKit runtime. Try again in a moment.",
      );
      return;
    }
    setDraft("");
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
  }, [agent, copilotkit, busy, isReady, speak]);

  const send = useCallback(() => sendText(draft), [sendText, draft]);

  const { isRecording, isTranscribing, startListening, stopListening } = useSpeechToText({
    baseUrl: BACKEND_ORIGIN,
    onError: (sttError) => setError(sttError.message),
  });

  const stopListeningAndSend = useCallback(async () => {
    const transcript = await stopListening();
    if (transcript) void sendText(transcript);
  }, [stopListening, sendText]);

  const handlePresenceDetected = useCallback(() => {
    if (busy || isRecording || isTranscribing) return;
    void startListening();
    setTimeout(() => void stopListeningAndSend(), PRESENCE_AUTO_STOP_MS);
  }, [busy, isRecording, isTranscribing, startListening, stopListeningAndSend]);

  useEffect(() => {
    const subscription = copilotkit.subscribe({
      onError: (event) => {
        if (event.context?.agentId !== "default" && event.context?.agentId)
          return;

        const message =
          event.error instanceof Error
            ? event.error.message
            : String(event.error);
        setError(message);
        setBusy(false);
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [copilotkit]);

  const messages = agent.messages ?? [];
  const conversationMessages = messages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );
  const isSendDisabled = busy || !isReady;
  const activeToolLabel = deriveActiveToolLabel(messages);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Tools reception={reception} setReception={setReception} />

      <ConnectionStatus />

      {ENABLE_FACE_PRESENCE ? <PresenceTrigger onPresent={handlePresenceDetected} /> : null}

      <TalkingAvatar
        ref={avatarRef}
        idleSource={defaultIdleSource}
        talkingSource={defaultTalkingSource}
        style={{ marginHorizontal: 16, marginBottom: 12, maxWidth: 220, alignSelf: "center" }}
      />

      {activeToolLabel ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8, alignSelf: "flex-start" }}>
          <ToolCallStatusBanner label={activeToolLabel} />
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Resse.ai · Front desk</Text>
        <Text style={styles.title}>{reception.business.name}</Text>
        <View style={styles.snapshot}>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>Hours</Text>
            <Text style={styles.pillValue}>{reception.business.hours}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>Upcoming</Text>
            <Text style={styles.pillValue}>
              {upcomingAppointments(reception).length} appointment
              {upcomingAppointments(reception).length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={conversationMessages}
        keyExtractor={(message) => message.id}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: true })
        }
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={styles.empty}>
            Try "What are your hours?", "Show today's appointments", or "Check
            in Priya Nair." Reads render native cards. Status changes wait for
            your approval tap before changing local sample data.
          </Text>
        }
        renderItem={({ item: message }) => {
          const isUser = message.role === "user";
          const text =
            typeof message.content === "string" ? message.content : "";
          const toolCalls: ToolCall[] =
            "toolCalls" in message ? (message.toolCalls ?? []) : [];

          return (
            <View>
              {text ? (
                <View
                  style={[
                    styles.bubble,
                    isUser ? styles.bubbleUser : styles.bubbleAgent,
                  ]}
                >
                  {isUser ? (
                    <Text style={styles.bubbleTextUser}>{text}</Text>
                  ) : (
                    <AssistantMarkdown source={text} />
                  )}
                </View>
              ) : null}

              {toolCalls.map((toolCall) => {
                // The matching tool result, if the run has produced one yet.
                const toolMessage = messages.find(
                  (candidate) =>
                    candidate.role === "tool" &&
                    "toolCallId" in candidate &&
                    candidate.toolCallId === toolCall.id,
                );
                return (
                  <View key={toolCall.id}>
                    {renderToolCall({
                      toolCall,
                      toolMessage: toolMessage as never,
                    })}
                  </View>
                );
              })}
            </View>
          );
        }}
      />

      {error ? (
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>Could not reach the agent</Text>
          <Text style={styles.gateBody}>{error}</Text>
          <Text style={styles.gateBody}>
            Start npm run dev:web and check src/config.ts.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Ask about your money"}
            placeholderTextColor="#6e6779"
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            editable={!busy && !isRecording && !isTranscribing}
          />
          <Pressable
            style={[styles.btn, isRecording ? styles.btnPrimary : null]}
            onPressIn={() => void startListening()}
            onPressOut={() => void stopListeningAndSend()}
            disabled={busy || isTranscribing || !isReady}
          >
            {isTranscribing ? (
              <ActivityIndicator color={C.text} size="small" />
            ) : (
              <Text style={isRecording ? styles.btnPrimaryText : styles.btnText}>
                {isRecording ? "●" : "🎤"}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => void send()}
            disabled={isSendDisabled}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>
                {isReady ? "Send" : "Connecting"}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
