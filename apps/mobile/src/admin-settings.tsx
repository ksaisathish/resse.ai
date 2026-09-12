/**
 * Admin "Settings" tab: chat/voice behavior, the avatar, and integrations.
 * Every control here maps to a real, already-wired mechanism elsewhere in
 * the app (settings-store.ts, auth.ts, org.ts) — nothing here is
 * decorative. Where there's genuinely nothing to configure yet (workplace
 * MCP is a server-side env var, not a per-device setting), that's stated
 * plainly instead of faked with a toggle that does nothing.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { styles, C } from "@/styles";
import { loadSettings, saveSettings, type AppSettings } from "@/settings-store";
import { loadSession, clearSession, type Session } from "@/auth";
import { loadOrg, type OrgBusiness } from "@/org";
import { useGoogleAuth } from "@/use-google-auth";

type Props = { navigation: NativeStackScreenProps<RootStackParamList, "Admin">["navigation"] };

export function AdminSettings({ navigation }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [org, setOrg] = useState<OrgBusiness | null>(null);
  const { signIn, status: signInStatus } = useGoogleAuth();

  useEffect(() => {
    void loadSettings().then(setSettings);
    void loadSession().then(setSession);
    void loadOrg().then(setOrg);
  }, []);

  function update(patch: Partial<AppSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    void saveSettings(next);
  }

  const googleConnected = Boolean(session) && Date.now() < (session?.expiresAt ?? 0);

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Chat</Text>
        <View style={styles.row}>
          <View style={styles.rowStack}>
            <Text style={styles.rowLabel}>Realistic voice</Text>
            <Text style={styles.rowMeta}>Cloud TTS instead of the free on-device voice.</Text>
          </View>
          <Switch
            value={settings?.ttsMode === "realistic"}
            onValueChange={(value) => update({ ttsMode: value ? "realistic" : "robotic" })}
            disabled={!settings}
            trackColor={{ true: C.accent }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Avatar</Text>
        <View style={styles.row}>
          <View style={styles.rowStack}>
            <Text style={styles.rowLabel}>Show talking avatar</Text>
            <Text style={styles.rowMeta}>
              Turn off for a plain, faceless kiosk on the Receptionist screen.
            </Text>
          </View>
          <Switch
            value={settings?.avatarEnabled ?? true}
            onValueChange={(value) => update({ avatarEnabled: value })}
            disabled={!settings}
            trackColor={{ true: C.accent }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Integrations</Text>

        <View style={[styles.row, { alignItems: "center" }]}>
          <View style={styles.rowStack}>
            <Text style={styles.rowLabel}>Google Calendar</Text>
            <Text style={styles.rowMeta}>
              {googleConnected ? `Connected as ${session?.profile.email}` : "Not connected"}
            </Text>
          </View>
          {googleConnected ? (
            <Pressable
              onPress={async () => {
                await clearSession();
                setSession(null);
              }}
            >
              <Text style={styles.btnLink}>Disconnect</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              disabled={signInStatus === "waiting" || signInStatus === "exchanging"}
              onPress={async () => {
                const newSession = await signIn();
                if (newSession) setSession(newSession);
              }}
            >
              {signInStatus === "waiting" || signInStatus === "exchanging" ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>Connect</Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Booking deposit (UPI)</Text>
          <Text style={styles.rowValue}>
            {org?.upiId && org.bookingDepositAmount ? `₹${org.bookingDepositAmount} via ${org.upiId}` : "Not set"}
          </Text>
        </View>
        <Pressable onPress={() => navigation.navigate("CreateOrg")}>
          <Text style={styles.btnLink}>Edit business profile & deposit</Text>
        </Pressable>

        <View style={[styles.row, styles.rowDivider]}>
          <Text style={styles.rowLabel}>Workplace tools (mail/CRM/docs)</Text>
          <Text style={styles.rowMeta}>
            Configured server-side via AMBIGUOUS_API_KEY; not exposed to this mobile surface.
          </Text>
        </View>
      </View>
    </View>
  );
}
