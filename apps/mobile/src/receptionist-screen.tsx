/**
 * The hands-free receptionist: full-screen talking avatar, no visible chat
 * at all. Someone steps into camera view, the vision-based presence check
 * (see @resse/presence) notices and starts listening automatically, the
 * agent replies out loud via TTS while the avatar's mouth animates, and it
 * goes back to listening for the next person. See chat.tsx for the other
 * way to reach the same agent: a normal typed/press-and-hold-mic screen.
 *
 * The only visible UI is a small "people detected" badge and a one-word
 * status ("Listening…"/"Thinking…") — deliberately minimal, since the
 * avatar itself is the interface here.
 */
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import { TalkingAvatar, defaultIdleSource, defaultTalkingSource } from "@resse/talking-avatar";
import { Tools } from "@/tools";
import { styles } from "@/styles";
import { useReceptionAgent } from "@/use-reception-agent";
import { PresenceTrigger } from "@/presence-trigger";

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

function ReceptionistScreenContent() {
  const [personCount, setPersonCount] = useState(0);
  const {
    reception,
    setReception,
    busy,
    error,
    setError,
    avatarRef,
    isRecording,
    isTranscribing,
    startListening,
  } = useReceptionAgent();

  // Auto-stop (silence detection + a hard max-duration cap) lives in
  // useSpeechToText itself now — see packages/stt/src/useSpeechToText.ts —
  // so this just starts listening; the hook decides when to stop and the
  // transcript gets sent automatically via its onTranscript callback (wired
  // in use-reception-agent.ts).
  const handlePresenceDetected = useCallback(() => {
    if (busy || isRecording || isTranscribing) return;
    void startListening();
  }, [busy, isRecording, isTranscribing, startListening]);

  // Every presence-check failure (bad OPENAI_API_KEY, network error, a
  // malformed vision response) used to be silently swallowed — no onError
  // was ever wired up, so the only visible symptom was the count staying
  // at 0 forever with no clue why. Surfacing it through the same error
  // banner as everything else.
  const handlePresenceError = useCallback(
    (presenceError: Error) => setError(presenceError.message),
    [setError],
  );

  const statusLabel = isRecording ? "Listening…" : isTranscribing || busy ? "Thinking…" : null;

  return (
    <View style={styles.fullScreenRoot}>
      <Tools reception={reception} setReception={setReception} />

      <TalkingAvatar
        ref={avatarRef}
        idleSource={defaultIdleSource}
        talkingSource={defaultTalkingSource}
        style={StyleSheet.absoluteFillObject}
      />

      <PresenceTrigger
        onPresent={handlePresenceDetected}
        onCountChange={setPersonCount}
        onError={handlePresenceError}
      />

      <SafeAreaView style={styles.overlayRoot} edges={["top", "bottom"]} pointerEvents="box-none">
        <View style={styles.overlayTopBar} pointerEvents="box-none">
          <View style={styles.presenceBadge}>
            <Text style={styles.presenceBadgeText}>🧑 {personCount}</Text>
          </View>
          {statusLabel ? (
            <View style={[styles.presenceBadge, { marginTop: 8 }]}>
              <Text style={styles.presenceBadgeText}>{statusLabel}</Text>
            </View>
          ) : null}
        </View>

        <View style={{ flex: 1 }} pointerEvents="none" />

        {error ? (
          <View style={[styles.gate, { marginHorizontal: 16, marginBottom: 16 }]}>
            <Text style={styles.gateTitle}>Something went wrong</Text>
            <Text style={styles.gateBody}>{error}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}
