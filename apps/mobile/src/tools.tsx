import type { Dispatch, SetStateAction } from "react";
import { Pressable, Text, View } from "react-native";
import {
  useAgentContext,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-native/headless";
import { z } from "zod";
import {
  applyStatusChange,
  validateStatusChange,
  type ReceptionSnapshot,
} from "@/reception";
import { styles } from "@/styles";

const statusSchema = z.enum(["checked-in", "completed", "no-show", "cancelled"]);

function appointmentLabel(snapshot: ReceptionSnapshot, id: string) {
  const appointment = snapshot.appointments.find((item) => item.id === id);
  return appointment ? `${appointment.customerName} (${appointment.time})` : id;
}

export function Tools({
  reception,
  setReception,
}: {
  reception: ReceptionSnapshot;
  setReception: Dispatch<SetStateAction<ReceptionSnapshot>>;
}) {
  useAgentContext({
    description:
      "The visible React Native front-desk app state. This sample data is local to the phone/kiosk template. Use reception tools for reads; use check_in_appointment for any status change, which requires the user's approval tap before local state changes.",
    value: {
      surface: "react-native",
      business: reception.business,
      appointments: reception.appointments,
    },
  });

  useHumanInTheLoop({
    name: "check_in_appointment",
    description:
      "Propose a status change for a local appointment (check the customer in, mark a no-show, cancel, or complete). The user must approve the native card before the appointment status changes.",
    parameters: z.object({
      appointmentId: z.string().describe("The target appointment id from list_appointments."),
      status: statusSchema.describe("The requested new status."),
    }),
    render: ({ args, respond, result }) => {
      if (!respond) {
        return (
          <View style={styles.gate}>
            <Text style={styles.gateDone}>{result ? String(result) : "Waiting..."}</Text>
          </View>
        );
      }
      const validated = validateStatusChange(reception, args);
      return (
        <View style={styles.gate}>
          <Text style={styles.gateTitle}>Approve status change</Text>
          <Text style={styles.gateBody}>
            {appointmentLabel(reception, String(args.appointmentId ?? ""))} →{" "}
            {args.status ?? "pending"}
          </Text>
          {!validated.ok ? <Text style={styles.gateBody}>{validated.reason}</Text> : null}
          <View style={styles.gateRow}>
            <Pressable
              style={[
                styles.btn,
                styles.btnPrimary,
                !validated.ok ? styles.btnDisabled : null,
              ]}
              disabled={!validated.ok}
              onPress={() => {
                const current = validateStatusChange(reception, args);
                if (!current.ok) {
                  void respond(current.reason);
                  return;
                }
                const result = applyStatusChange(reception, current.value);
                if (!result.appointment) {
                  void respond(result.error);
                  return;
                }
                setReception(result.snapshot);
                void respond(
                  `Approved. ${result.appointment.customerName}'s appointment is now "${result.appointment.status}".`,
                );
              }}
            >
              <Text
                style={[
                  styles.btnPrimaryText,
                  !validated.ok ? styles.btnDisabledText : null,
                ]}
              >
                Approve
              </Text>
            </Pressable>
            <Pressable
              style={styles.btn}
              onPress={() =>
                void respond(
                  "The user declined the change. Nothing changed in the local appointment queue.",
                )
              }
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      );
    },
  });

  useFrontendTool({
    name: "get_business_info",
    description: "Read the business hours, services, and phone number shown in the app.",
    parameters: z.object({}),
    handler: async () => ({ business: reception.business }),
    render: () => (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{reception.business.name}</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Hours</Text>
          <Text style={styles.rowValue}>{reception.business.hours}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Phone</Text>
          <Text style={styles.rowValue}>{reception.business.phone}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Services</Text>
          <Text style={styles.rowValue}>{reception.business.services.join(", ")}</Text>
        </View>
      </View>
    ),
  });

  useFrontendTool({
    name: "list_appointments",
    description: "Read today's local appointment queue, most recent status first.",
    parameters: z.object({}),
    handler: async () => ({ appointments: reception.appointments }),
    render: () => (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today's queue</Text>
        {reception.appointments.map((appointment) => (
          <View key={appointment.id} style={styles.row}>
            <View style={styles.rowStack}>
              <Text style={styles.rowLabel}>{appointment.customerName}</Text>
              <Text style={styles.rowMeta}>
                {appointment.service} · {appointment.time}
              </Text>
            </View>
            <Text style={styles.rowValue}>{appointment.status}</Text>
          </View>
        ))}
      </View>
    ),
  });

  return null;
}
