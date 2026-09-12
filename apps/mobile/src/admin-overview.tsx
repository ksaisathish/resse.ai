/**
 * Admin "Dashboard" tab: at-a-glance stats for the business owner. Pure
 * derived counts over the shared reception snapshot — no separate stats
 * backend, since this is the same local-first data model the rest of the
 * app uses (see reception-store.ts).
 */
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { styles } from "@/styles";
import type { ReceptionSnapshot } from "@/reception";
import { loadSession, type Session } from "@/auth";

function countByStatus(reception: ReceptionSnapshot, status: string) {
  return reception.appointments.filter((appointment) => appointment.status === status).length;
}

export function AdminOverview({ reception }: { reception: ReceptionSnapshot }) {
  const [googleSession, setGoogleSession] = useState<Session | null>(null);

  useEffect(() => {
    void loadSession().then(setGoogleSession);
  }, []);

  const googleConnected = Boolean(googleSession) && Date.now() < (googleSession?.expiresAt ?? 0);
  const depositConfigured = Boolean(reception.business.upiId && reception.business.bookingDepositAmount);

  const stats: { label: string; value: number }[] = [
    { label: "Today's appointments", value: reception.appointments.length },
    { label: "Upcoming", value: countByStatus(reception, "upcoming") },
    { label: "Checked in", value: countByStatus(reception, "checked-in") },
    { label: "Completed", value: countByStatus(reception, "completed") },
    { label: "No-shows", value: countByStatus(reception, "no-show") },
    { label: "Cancelled", value: countByStatus(reception, "cancelled") },
  ];

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={styles.statGrid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Clients</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Total on file</Text>
          <Text style={styles.rowValue}>{reception.clients.length}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Integrations status</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Google Calendar</Text>
          <Text style={styles.rowValue}>{googleConnected ? "Connected" : "Not connected"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Booking deposit</Text>
          <Text style={styles.rowValue}>
            {depositConfigured
              ? `₹${reception.business.bookingDepositAmount} via UPI`
              : "Not configured"}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
