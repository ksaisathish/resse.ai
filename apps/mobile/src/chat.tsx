/**
 * The plain chat screen — a normal message list, tool cards, and a composer
 * with an optional press-and-hold mic. The other way to reach the same
 * agent is receptionist-screen.tsx: full-screen avatar, hands-free,
 * camera-driven. This screen is the "type or press mic" alternative.
 *
 * The part worth copying: tool calls are rendered through `useRenderToolCall()`,
 * which resolves the right renderer AND supplies `respond` for a
 * human-in-the-loop tool. Walking the render registry by hand is a known trap —
 * the local `useRenderTool` registry passes only `{ args, status }` with no
 * `respond`, so approvals silently cannot be answered.
 */
import { useCallback, useRef, useState } from "react";
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
import { useIsFocused } from "@react-navigation/native";
import { useRenderToolCall, type ToolCall } from "@copilotkit/react-native/headless";
import { ToolCallStatusBanner } from "@resse/tool-status-banner";
import { Tools } from "@/tools";
import { ConnectionStatus } from "@/connection-status";
import { C, styles } from "@/styles";
import { upcomingAppointments } from "@/reception";
import { AssistantMarkdown } from "@/assistant-markdown";
import { useReceptionAgent } from "@/use-reception-agent";

// Screens keep registering CopilotKit tools/context (via <Tools>) even when
// pushed underneath another screen in the stack, since native-stack doesn't
// unmount on blur by default — with two screens now sharing the same tool
// set (this one and Receptionist), that would double-register them. This
// wrapper unmounts the real content (and so its hooks) whenever the screen
// isn't the focused one.
export function ChatScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <ChatScreenContent /> : null;
}

function ChatScreenContent() {
  const listRef = useRef<FlatList>(null);
  const renderToolCall = useRenderToolCall();
  const [draft, setDraft] = useState("");
  const {
    reception,
    setReception,
    isReady,
    busy,
    error,
    sendText,
    isRecording,
    isTranscribing,
    startListening,
    stopListeningAndSend,
    conversationMessages,
    messages,
    activeToolLabel,
  } = useReceptionAgent();

  const send = useCallback(() => {
    const text = draft;
    setDraft("");
    void sendText(text);
  }, [sendText, draft]);

  const isSendDisabled = busy || !isReady;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <Tools reception={reception} setReception={setReception} />

      <ConnectionStatus />

      {activeToolLabel ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8, alignSelf: "flex-start" }}>
          <ToolCallStatusBanner label={activeToolLabel} />
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.eyebrow}>Resse.ai · Chat</Text>
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
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
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
          const text = typeof message.content === "string" ? message.content : "";
          const toolCalls: ToolCall[] = "toolCalls" in message ? (message.toolCalls ?? []) : [];

          return (
            <View>
              {text ? (
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAgent]}>
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
                    {renderToolCall({ toolCall, toolMessage: toolMessage as never })}
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
          <Text style={styles.gateBody}>Start npm run dev:web and check src/config.ts.</Text>
        </View>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : "Ask about the business or an appointment"
            }
            placeholderTextColor="#6e6779"
            onSubmitEditing={send}
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
          <Pressable style={[styles.btn, styles.btnPrimary]} onPress={send} disabled={isSendDisabled}>
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnPrimaryText}>{isReady ? "Send" : "Connecting"}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
