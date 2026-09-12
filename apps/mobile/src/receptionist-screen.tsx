/**
 * The hands-free receptionist: full-screen talking avatar, no visible chat.
 * Someone steps into camera view, presence detection (see @resse/presence)
 * starts listening, the agent answers out loud while the avatar's mouth
 * animates, and it listens again for the follow-up — Alexa-style turn
 * taking, not one question and done. See chat.tsx for the typed/press-mic
 * way to reach the same agent.
 *
 * Turn taking is driven by an explicit conversation flag rather than by
 * presence alone: useFacePresence only fires onPresent on the absent ->
 * present EDGE, so a person who walks up and stays put (i.e. everyone)
 * would get exactly one question before the kiosk went quiet on them.
 *
 * Human-in-the-loop tool cards are rendered here too. They have to be:
 * book_appointment and check_in_appointment only resolve when someone taps
 * their approval card, so on a screen that never rendered one, a booking
 * request left the agent run hanging forever with the kiosk stuck on
 * "Thinking…".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { useRenderToolCall, type ToolCall } from "@copilotkit/react-native/headless";
import { TalkingAvatar, defaultIdleSource, defaultTalkingSource } from "@resse/talking-avatar";
import { Tools } from "@/tools";
import { styles } from "@/styles";
import { useReceptionAgent } from "@/use-reception-agent";
import { PresenceTrigger } from "@/presence-trigger";
import { loadSettings } from "@/settings-store";
import { ListeningIndicator } from "@/listening-indicator";
import { toSpeechText } from "@/speech-text";

// Minimum quiet time before presence is allowed to open a NEW conversation
// after the last one ended. Without it, anything that makes presence flap
// (MediaPipe missing a face for one frame) re-triggers listening immediately
// and the screen thrashes. Deliberately does not apply to follow-up turns
// inside a conversation — those should feel instant.
const RETRIGGER_COOLDOWN_MS = 3000;

// Screens keep registering CopilotKit tools/context (via <Tools>) even when
// pushed underneath another screen in the stack, since native-stack doesn't
// unmount on blur by default — with two screens now sharing the same tool
// set (this one and Chat), that would double-register them. This wrapper
// unmounts the real content (and so its hooks, and the camera) whenever the
// screen isn't the focused one.
export function ReceptionistScreen() {
  const isFocused = useIsFocused();
  return isFocused ? <ReceptionistScreenContent /> : null;
}

/** Latest spoken text for a role, cleaned of any markdown the agent still
 * slips in — captions sit over video, where stray asterisks read as noise. */
function findLastText(
  conversationMessages: { role: string; content?: unknown; id: string }[],
  role: "user" | "assistant",
): string {
  for (let index = conversationMessages.length - 1; index >= 0; index -= 1) {
    const message = conversationMessages[index];
    if (message.role !== role) continue;
    if (typeof message.content !== "string" || !message.content.trim()) continue;
    return toSpeechText(message.content);
  }
  return "";
}

function ReceptionistScreenContent() {
  const [personCount, setPersonCount] = useState(0);
  // True from the moment someone walks up until the conversation ends
  // (they leave, or a listening window closes with nobody speaking).
  const [conversing, setConversing] = useState(false);
  // Defaults to shown; admin-settings.tsx lets a business owner turn the
  // full-screen avatar video off in favor of a plain, faceless kiosk.
  const [avatarEnabled, setAvatarEnabled] = useState(true);
  useEffect(() => {
    void loadSettings().then((settings) => setAvatarEnabled(settings.avatarEnabled));
  }, []);

  const renderToolCall = useRenderToolCall();

  const handleNoSpeech = useCallback(() => {
    // Nobody said anything in this window. End the conversation quietly
    // rather than holding the mic open (or showing an error banner) — the
    // manual button below is how someone restarts without walking away.
    setConversing(false);
  }, []);

  const {
    reception,
    setReception,
    busy,
    error,
    setError,
    avatarRef,
    isRecording,
    isTranscribing,
    isSpeaking,
    startListening,
    stopListening,
    stopSpeaking,
    messages,
    conversationMessages,
  } = useReceptionAgent({ onNoSpeech: handleNoSpeech });

  // Anything that means "the kiosk is mid-turn and must not open the mic".
  // isSpeaking matters most: without it the mic opens while the avatar is
  // still talking and transcribes the avatar's own voice back into the
  // agent.
  const isBusyTurn = isRecording || isTranscribing || busy || isSpeaking;

  const coolingDown = useRef(false);
  const wasBusyTurn = useRef(false);

  useEffect(() => {
    const justFinished = wasBusyTurn.current && !isBusyTurn;
    wasBusyTurn.current = isBusyTurn;
    if (!justFinished) return;

    coolingDown.current = true;
    const timer = setTimeout(() => {
      coolingDown.current = false;
    }, RETRIGGER_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [isBusyTurn]);

  // Auto-stop (silence detection + a hard max-duration cap) lives in
  // useSpeechToText — see packages/stt/src/useSpeechToText.ts — so this just
  // opens the mic; the hook decides when to close it and the transcript is
  // sent automatically through its onTranscript callback.
  const beginListening = useCallback(() => {
    if (isBusyTurn) return;
    setConversing(true);
    void startListening();
  }, [isBusyTurn, startListening]);

  const handlePresenceDetected = useCallback(() => {
    if (conversing || coolingDown.current) return;
    beginListening();
  }, [conversing, beginListening]);

  const handleAbsent = useCallback(() => setConversing(false), []);

  // The follow-up turn: the instant the answer finishes playing, listen
  // again so the person can just keep talking. This is what makes it feel
  // like a conversation instead of a one-shot query.
  //
  // Gated on `conversing` alone, deliberately not on personCount: presence
  // only refreshes every few seconds, and when the camera is blocked or
  // still warming up it reads 0 even though someone is plainly standing
  // there talking — which would silently kill follow-ups for exactly the
  // people relying on the manual button. Conversations end on an explicit
  // signal instead: they walked away (onAbsent), or nobody spoke
  // (onNoSpeech).
  const wasSpeaking = useRef(false);
  useEffect(() => {
    const justStoppedSpeaking = wasSpeaking.current && !isSpeaking;
    wasSpeaking.current = isSpeaking;
    if (!justStoppedSpeaking || !conversing) return;
    void startListening();
  }, [isSpeaking, conversing, startListening]);

  // Every presence-check failure (network error, a malformed vision
  // response) used to be silently swallowed, so the only visible symptom
  // was the count staying at 0 forever with no clue why.
  const handlePresenceError = useCallback(
    (presenceError: Error) => setError(presenceError.message),
    [setError],
  );

  // Tool calls the agent has made but that have no result yet. A
  // human-in-the-loop tool (book_appointment, check_in_appointment) sits
  // here until someone taps its card — rendering it is what makes an
  // appointment bookable on this screen at all.
  const pendingToolCalls = useMemo(() => {
    const pending: ToolCall[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      const toolCalls: ToolCall[] = "toolCalls" in message ? (message.toolCalls ?? []) : [];
      for (const toolCall of toolCalls) {
        const settled = messages.some(
          (candidate) =>
            candidate.role === "tool" &&
            "toolCallId" in candidate &&
            candidate.toolCallId === toolCall.id,
        );
        if (!settled) pending.push(toolCall);
      }
    }
    return pending;
  }, [messages]);

  const listeningStatus = isRecording ? "listening" : isTranscribing || busy ? "thinking" : "idle";

  // Captions: there's no message list on this screen, so without these the
  // only record of what was said is the audio itself — unusable in a noisy
  // room, or for anyone who doesn't hear it clearly the first time.
  const lastUserText = findLastText(conversationMessages, "user");
  const lastAssistantText = findLastText(conversationMessages, "assistant");

  // One manual control, as a fallback for when presence detection doesn't
  // fire (camera blocked, model still loading, someone standing off-frame)
  // or when a listen/answer needs cutting short.
  const manualAction = isRecording
    ? { label: "Stop & send", onPress: () => void stopListening() }
    : isSpeaking
      ? { label: "Stop talking", onPress: () => stopSpeaking() }
      : isTranscribing || busy
        ? null
        : { label: "Tap to talk", onPress: beginListening };

  return (
    <View style={styles.fullScreenRoot}>
      <Tools reception={reception} setReception={setReception} />

      {avatarEnabled ? (
        <TalkingAvatar
          ref={avatarRef}
          idleSource={defaultIdleSource}
          talkingSource={defaultTalkingSource}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}

      <PresenceTrigger
        onPresent={handlePresenceDetected}
        onAbsent={handleAbsent}
        onCountChange={setPersonCount}
        onError={handlePresenceError}
      />

      <SafeAreaView style={styles.overlayRoot} edges={["top", "bottom"]} pointerEvents="box-none">
        <View style={styles.overlayTopBar} pointerEvents="box-none">
          <View style={styles.presenceBadge}>
            <Text style={styles.presenceBadgeText}>🧑 {personCount}</Text>
          </View>
          <View style={{ marginTop: 8 }}>
            <ListeningIndicator status={listeningStatus} />
          </View>
        </View>

        <View style={{ flex: 1 }} pointerEvents="none" />

        {lastUserText || lastAssistantText ? (
          <View style={styles.captionPanel} pointerEvents="none">
            {lastUserText ? (
              <Text style={styles.captionUser} numberOfLines={2}>
                “{lastUserText}”
              </Text>
            ) : null}
            {lastAssistantText ? (
              <Text style={styles.captionAssistant} numberOfLines={4}>
                {lastAssistantText}
              </Text>
            ) : null}
          </View>
        ) : null}

        {pendingToolCalls.length > 0 ? (
          <ScrollView style={styles.receptionistToolPanel} contentContainerStyle={{ padding: 12 }}>
            {pendingToolCalls.map((toolCall) => (
              <View key={toolCall.id}>
                {renderToolCall({ toolCall, toolMessage: undefined as never })}
              </View>
            ))}
          </ScrollView>
        ) : null}

        {error ? (
          <View style={[styles.gate, { marginHorizontal: 16, marginBottom: 8 }]}>
            <Text style={styles.gateTitle}>Something went wrong</Text>
            <Text style={styles.gateBody}>{error}</Text>
          </View>
        ) : null}

        {manualAction ? (
          <View style={styles.receptionistControls}>
            <Pressable
              style={[styles.btn, styles.btnPrimary, styles.btnBlock]}
              onPress={manualAction.onPress}
            >
              <Text style={styles.btnPrimaryText}>{manualAction.label}</Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
