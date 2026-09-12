/**
 * The business owner's control panel — separate from the customer-facing
 * Chat/Receptionist screens. Reachable from Dashboard via "Manage business".
 *
 * A hand-rolled tab switcher (local state, not a nav library) matches how
 * the rest of this app avoids extra native-nav dependencies where a plain
 * component swap does the job.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "@/navigation";
import { styles } from "@/styles";
import { loadReceptionSnapshot, saveReceptionSnapshot } from "@/reception-store";
import { initialReception, type ReceptionSnapshot } from "@/reception";
import { AdminOverview } from "@/admin-overview";
import { AdminClients } from "@/admin-clients";
import { AdminAppointments } from "@/admin-appointments";
import { AdminSettings } from "@/admin-settings";

type Props = NativeStackScreenProps<RootStackParamList, "Admin">;

type Tab = "overview" | "clients" | "appointments" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Dashboard" },
  { key: "clients", label: "Clients" },
  { key: "appointments", label: "Appointments" },
  { key: "settings", label: "Settings" },
];

export function AdminScreen({ navigation }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [reception, setReceptionState] = useState<ReceptionSnapshot>(initialReception);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void loadReceptionSnapshot().then((snapshot) => {
      setReceptionState(snapshot);
      setLoaded(true);
    });
  }, []);

  // Same snapshot the Chat/Receptionist screens read and write (see
  // reception-store.ts) — an admin edit here shows up there, and a booking
  // made through the agent shows up here, without a shared server.
  const setReception = useCallback((next: ReceptionSnapshot) => {
    setReceptionState(next);
    void saveReceptionSnapshot(next);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.adminHeader}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.btnLink}>← Back</Text>
        </Pressable>
        <Text style={styles.adminHeaderTitle}>{reception.business.name}</Text>
        <View style={{ width: 48 }} />
      </View>

      <View style={styles.adminTabRow}>
        {TABS.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.adminTab, tab === item.key ? styles.adminTabActive : null]}
            onPress={() => setTab(item.key)}
          >
            <Text style={[styles.adminTabText, tab === item.key ? styles.adminTabTextActive : null]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!loaded ? null : tab === "overview" ? (
        <AdminOverview reception={reception} />
      ) : tab === "clients" ? (
        <AdminClients reception={reception} setReception={setReception} />
      ) : tab === "appointments" ? (
        <AdminAppointments reception={reception} setReception={setReception} />
      ) : (
        <AdminSettings navigation={navigation} />
      )}
    </SafeAreaView>
  );
}
