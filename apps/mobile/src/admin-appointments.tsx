/**
 * Admin "Appointments" tab: a calendar-style agenda, grouped by day. Real
 * dates only exist for appointments booked through the agent (book_appointment
 * stores startISO — see tools.tsx); the bundled demo appointments only have a
 * display `time` string, so they group under "Today" same as before.
 *
 * Status changes here are direct, not gated behind an approval card — this
 * is the business owner acting on their own data, not the AI proposing a
 * change on a customer's behalf (that's what check_in_appointment is for).
 * Reuses the same transition rules (validateStatusChange/applyStatusChange)
 * so "can't complete an already-cancelled visit" stays true everywhere.
 */
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { styles } from "@/styles";
import {
  applyStatusChange,
  validateStatusChange,
  type Appointment,
  type AppointmentStatus,
  type ReceptionSnapshot,
} from "@/reception";

const STATUS_ACTIONS: { status: AppointmentStatus; label: string }[] = [
  { status: "checked-in", label: "Check in" },
  { status: "completed", label: "Complete" },
  { status: "no-show", label: "No-show" },
  { status: "cancelled", label: "Cancel" },
];

function groupKey(appointment: Appointment): string {
  if (!appointment.startISO) return "Today";
  const date = new Date(appointment.startISO);
  if (Number.isNaN(date.getTime())) return "Today";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function sortValue(appointment: Appointment): number {
  return appointment.startISO ? new Date(appointment.startISO).getTime() : 0;
}

export function AdminAppointments({
  reception,
  setReception,
}: {
  reception: ReceptionSnapshot;
  setReception: (next: ReceptionSnapshot) => void;
}) {
  const [feedback, setFeedback] = useState<string | undefined>();

  const groups = useMemo(() => {
    const byDay = new Map<string, Appointment[]>();
    for (const appointment of reception.appointments) {
      const key = groupKey(appointment);
      const bucket = byDay.get(key) ?? [];
      bucket.push(appointment);
      byDay.set(key, bucket);
    }
    for (const bucket of byDay.values()) bucket.sort((a, b) => sortValue(a) - sortValue(b));
    return [...byDay.entries()].sort(([a], [b]) => (a === "Today" ? -1 : b === "Today" ? 1 : a.localeCompare(b)));
  }, [reception.appointments]);

  function changeStatus(appointmentId: string, status: AppointmentStatus) {
    const validated = validateStatusChange(reception, { appointmentId, status });
    if (!validated.ok) {
      setFeedback(validated.reason);
      return;
    }
    const result = applyStatusChange(reception, validated.value);
    if (!result.appointment) {
      setFeedback(result.error);
      return;
    }
    setReception(result.snapshot);
    setFeedback(`${result.appointment.customerName} is now "${result.appointment.status}".`);
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      {feedback ? (
        <View style={styles.gate}>
          <Text style={styles.gateBody}>{feedback}</Text>
        </View>
      ) : null}

      {groups.length === 0 ? <Text style={styles.empty}>No appointments yet.</Text> : null}

      {groups.map(([day, appointments]) => (
        <View key={day} style={{ gap: 8 }}>
          <Text style={styles.cardTitle}>{day}</Text>
          {appointments.map((appointment) => (
            <View key={appointment.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowStack}>
                  <Text style={styles.rowLabel}>{appointment.customerName}</Text>
                  <Text style={styles.rowMeta}>
                    {appointment.service} · {appointment.time}
                  </Text>
                </View>
                <Text style={styles.rowValue}>{appointment.status}</Text>
              </View>
              <View style={styles.chipRow}>
                {STATUS_ACTIONS.filter((action) => action.status !== appointment.status).map((action) => (
                  <Pressable
                    key={action.status}
                    style={styles.chip}
                    onPress={() => changeStatus(appointment.id, action.status)}
                  >
                    <Text style={styles.chipText}>{action.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
