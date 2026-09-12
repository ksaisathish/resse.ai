import type { Dispatch, SetStateAction } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import {
  useAgentContext,
  useFrontendTool,
  useHumanInTheLoop,
} from "@copilotkit/react-native/headless";
import { z } from "zod";
import {
  applyStatusChange,
  findClientByName,
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
      clients: reception.clients,
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
    description:
      "Read the business's hours, services, phone, and (when set) email, address, website, and description.",
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
        {reception.business.email ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Email</Text>
            <Text style={styles.rowValue}>{reception.business.email}</Text>
          </View>
        ) : null}
        {reception.business.address ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Address</Text>
            <Text style={styles.rowValue}>{reception.business.address}</Text>
          </View>
        ) : null}
        {reception.business.website ? (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Website</Text>
            <Text style={styles.rowValue}>{reception.business.website}</Text>
          </View>
        ) : null}
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

  useFrontendTool({
    name: "list_clients",
    description:
      "Read the local client directory (name, phone, email, notes). Use this before call_number or message_number if you only have a name, to find the phone number.",
    parameters: z.object({}),
    handler: async () => ({ clients: reception.clients }),
    render: () => (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Clients</Text>
        {reception.clients.map((client) => (
          <View key={client.id} style={styles.row}>
            <View style={styles.rowStack}>
              <Text style={styles.rowLabel}>{client.name}</Text>
              <Text style={styles.rowMeta}>{client.phone}</Text>
            </View>
          </View>
        ))}
      </View>
    ),
  });

  useFrontendTool({
    name: "find_client",
    description:
      "Look up one client by name (exact or partial match) and return their phone/email/notes. Use this to resolve a name to a phone number before calling or messaging.",
    parameters: z.object({
      name: z.string().describe("The client's name, or part of it, as mentioned by the user."),
    }),
    handler: async ({ name }) => {
      const client = findClientByName(reception, name);
      if (!client) return { found: false, reason: `No client matched "${name}".` };
      return { found: true, client };
    },
    render: ({ args, result }) => (
      <View style={styles.gate}>
        <Text style={styles.gateDone}>
          {result
            ? typeof result === "object" && result && "client" in result
              ? `Found ${(result as { client?: { name?: string } }).client?.name}`
              : `No client matched "${args.name}"`
            : "Looking up client…"}
        </Text>
      </View>
    ),
  });

  useFrontendTool({
    name: "call_number",
    description:
      "Open the phone's native dialer pre-filled with a phone number, ready for the human operating the kiosk to tap Call. Does NOT place the call automatically — the phone's own call UI takes over from here, so the human always confirms before anything is actually dialed.",
    parameters: z.object({
      phoneNumber: z.string().describe("Phone number to dial, e.g. from find_client or get_business_info."),
      label: z.string().optional().describe("Who/what this call is to, shown in the confirmation card."),
    }),
    handler: async ({ phoneNumber }) => {
      const url = `tel:${phoneNumber}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) return { opened: false, reason: "This device cannot open tel: links." };
      await Linking.openURL(url);
      return { opened: true, phoneNumber };
    },
    render: ({ args, result }) => (
      <View style={styles.gate}>
        <Text style={styles.gateDone}>
          {result
            ? `Opened dialer for ${args.label ?? args.phoneNumber}`
            : `Opening dialer for ${args.label ?? args.phoneNumber}…`}
        </Text>
      </View>
    ),
  });

  useFrontendTool({
    name: "message_number",
    description:
      "Open the phone's native SMS composer pre-filled with a phone number and a draft message, ready for the human operating the kiosk to review and tap Send. Does NOT send automatically.",
    parameters: z.object({
      phoneNumber: z.string().describe("Phone number to message, e.g. from find_client."),
      message: z.string().describe("Draft message body to pre-fill in the composer."),
    }),
    handler: async ({ phoneNumber, message }) => {
      const separator = Platform.OS === "ios" ? "&" : "?";
      const url = `sms:${phoneNumber}${separator}body=${encodeURIComponent(message)}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) return { opened: false, reason: "This device cannot open sms: links." };
      await Linking.openURL(url);
      return { opened: true, phoneNumber };
    },
    render: ({ args, result }) => (
      <View style={styles.gate}>
        <Text style={styles.gateDone}>
          {result
            ? `Opened message composer for ${args.phoneNumber}`
            : `Opening message composer for ${args.phoneNumber}…`}
        </Text>
      </View>
    ),
  });

  return null;
}
