import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Image, Linking, Platform, Pressable, Text, View } from "react-native";
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
  type Appointment,
  type ReceptionSnapshot,
} from "@/reception";
import { BACKEND_ORIGIN } from "@/config";
import { createCalendarEvent, listUpcomingCalendarEvents } from "@/calendar";
import { styles } from "@/styles";

const statusSchema = z.enum(["checked-in", "completed", "no-show", "cancelled"]);

function appointmentLabel(snapshot: ReceptionSnapshot, id: string) {
  const appointment = snapshot.appointments.find((item) => item.id === id);
  return appointment ? `${appointment.customerName} (${appointment.time})` : id;
}

/**
 * Approval card for book_appointment. Shows a UPI payment QR (when the
 * business has upiId + a deposit amount) and only creates the appointment
 * once a human taps confirm — there's no automatic payment verification (see
 * apps/web/src/app/api/payments/qr/route.ts), so that tap IS the payment
 * check, done by eyes on the payer's phone, not by this app.
 */
function BookingApprovalCard({
  args,
  respond,
  result,
  reception,
  setReception,
}: {
  args: Record<string, unknown>;
  respond?: (result: string) => void;
  result?: unknown;
  reception: ReceptionSnapshot;
  setReception: Dispatch<SetStateAction<ReceptionSnapshot>>;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string>();
  const [booking, setBooking] = useState(false);

  const clientName = typeof args.clientName === "string" ? args.clientName : "";
  const service = typeof args.service === "string" ? args.service : "Appointment";
  const startISO = typeof args.startISO === "string" ? args.startISO : "";
  const durationMinutes = typeof args.durationMinutes === "number" ? args.durationMinutes : 30;
  const startDate = startISO ? new Date(startISO) : null;
  const startValid = startDate !== null && !Number.isNaN(startDate.getTime());
  const displayTime = startValid ? startDate.toLocaleString() : startISO || "Time to be confirmed";
  const rawAmount = args.depositAmount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount
        ? Number(rawAmount)
        : (reception.business.bookingDepositAmount ?? 0);
  const needsPayment = amount > 0 && Boolean(reception.business.upiId);

  useEffect(() => {
    if (!respond || !needsPayment) return;
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(undefined);
    fetch(`${BACKEND_ORIGIN}/api/payments/qr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        upiId: reception.business.upiId,
        payeeName: reception.business.name,
        amount,
        note: `${service} deposit`,
      }),
    })
      .then((response) => response.json() as Promise<{ qrDataUrl?: string; error?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (data.qrDataUrl) setQrDataUrl(data.qrDataUrl);
        else setQrError(data.error ?? "Could not generate the payment QR.");
      })
      .catch((cause) => {
        if (!cancelled) setQrError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [respond, needsPayment, amount, reception.business.upiId, reception.business.name, service]);

  if (!respond) {
    return (
      <View style={styles.gate}>
        <Text style={styles.gateDone}>{result ? String(result) : "Waiting..."}</Text>
      </View>
    );
  }

  return (
    <View style={styles.gate}>
      <Text style={styles.gateTitle}>Confirm booking</Text>
      <Text style={styles.gateBody}>
        {clientName || "Customer"} · {service} · {displayTime}
      </Text>

      {amount > 0 ? <Text style={styles.gateBody}>Deposit: ₹{amount}</Text> : null}
      {amount > 0 && !reception.business.upiId ? (
        <Text style={styles.gateBody}>
          No UPI ID set for this business — booking without collecting a deposit.
        </Text>
      ) : null}

      {needsPayment ? (
        qrDataUrl ? (
          <Image
            source={{ uri: qrDataUrl }}
            style={{ width: 180, height: 180, alignSelf: "center", marginVertical: 12 }}
          />
        ) : (
          <Text style={styles.gateBody}>{qrError ?? "Generating payment QR…"}</Text>
        )
      ) : null}

      <View style={styles.gateRow}>
        <Pressable
          style={[styles.btn, styles.btnPrimary, booking ? styles.btnDisabled : null]}
          disabled={booking}
          onPress={async () => {
            if (!clientName.trim()) {
              void respond("Missing the customer's name; nothing was booked.");
              return;
            }
            setBooking(true);
            let client = findClientByName(reception, clientName);
            let clients = reception.clients;
            if (!client) {
              client = {
                id: `client-${Date.now()}`,
                name: clientName.trim(),
                phone: typeof args.phone === "string" ? args.phone : "",
              };
              clients = [...clients, client];
            }
            const appointment: Appointment = {
              id: `appt-${Date.now()}`,
              clientId: client.id,
              customerName: client.name,
              service,
              time: displayTime,
              status: "upcoming",
              startISO: startValid ? startISO : undefined,
              durationMinutes: startValid ? durationMinutes : undefined,
            };

            let calendarNote = "";
            if (startValid) {
              const endISO = new Date(startDate!.getTime() + durationMinutes * 60_000).toISOString();
              const calendarResult = await createCalendarEvent({
                summary: `${service} — ${client.name}`,
                description: `Booked via Resse.ai front desk.${needsPayment ? ` Deposit: ₹${amount}.` : ""}`,
                startISO,
                endISO,
              });
              calendarNote = calendarResult.ok
                ? " Added to Google Calendar."
                : ` Google Calendar sync skipped (${calendarResult.reason}).`;
            }

            setReception({ ...reception, clients, appointments: [...reception.appointments, appointment] });
            setBooking(false);
            void respond(
              (needsPayment
                ? `Booked. ${client.name}'s ${service} appointment is set for ${appointment.time}. ₹${amount} deposit confirmed via UPI QR (human-verified, not automatic).`
                : `Booked. ${client.name}'s ${service} appointment is set for ${appointment.time}.`) + calendarNote,
            );
          }}
        >
          {booking ? (
            <Text style={styles.btnPrimaryText}>Booking…</Text>
          ) : (
            <Text style={styles.btnPrimaryText}>
              {needsPayment ? "Payment received — confirm booking" : "Confirm booking"}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={styles.btn}
          disabled={booking}
          onPress={() => void respond("The user cancelled the booking. Nothing was scheduled.")}
        >
          <Text style={styles.btnText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
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

  useHumanInTheLoop({
    name: "book_appointment",
    description:
      "Book a new appointment. Ask the customer for the service and a specific date/time first, " +
      "then convert that into startISO yourself (RFC3339, e.g. '2026-09-15T10:30:00+05:30' — ask the " +
      "customer's timezone if unclear, otherwise assume the business's local time). If the business has " +
      "a UPI ID configured, pass depositAmount (use business.bookingDepositAmount as the default unless " +
      "the customer/business agrees on a different amount) so a payment QR is shown. There is NO " +
      "automatic payment verification — the human operating the kiosk taps confirm only after they've " +
      "seen the payment go through, so do not tell the customer the booking is confirmed until this " +
      "tool resolves. On confirm this also creates a Google Calendar event, if the operator is signed in.",
    parameters: z.object({
      clientName: z.string().describe("Customer's name."),
      phone: z.string().optional().describe("Customer's phone number, if known — used to create a client record."),
      service: z.string().describe("The requested service."),
      startISO: z.string().describe("Appointment start time in RFC3339, e.g. '2026-09-15T10:30:00+05:30'."),
      durationMinutes: z.number().optional().describe("Appointment length in minutes. Defaults to 30."),
      depositAmount: z.number().optional().describe("Booking deposit amount in INR. Omit for no deposit."),
    }),
    render: (props) => (
      <BookingApprovalCard {...props} reception={reception} setReception={setReception} />
    ),
  });

  useFrontendTool({
    name: "list_calendar_events",
    description:
      "Read the operator's real upcoming Google Calendar events (not the local appointment queue — " +
      "use list_appointments for that). Requires the operator to be signed in with Google; if not, say so.",
    parameters: z.object({
      maxResults: z.number().int().min(1).max(25).default(10).optional(),
    }),
    handler: async ({ maxResults }) => {
      const result = await listUpcomingCalendarEvents(maxResults ?? 10);
      return result.ok ? { events: result.value } : { error: result.reason };
    },
    render: ({ result }) => {
      const data = result as { events?: { summary?: string; start?: string }[]; error?: string } | undefined;
      if (!data) {
        return (
          <View style={styles.gate}>
            <Text style={styles.gateDone}>Checking Google Calendar…</Text>
          </View>
        );
      }
      if (data.error) {
        return (
          <View style={styles.gate}>
            <Text style={styles.gateDone}>{data.error}</Text>
          </View>
        );
      }
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Upcoming on Google Calendar</Text>
          {(data.events ?? []).length === 0 ? (
            <Text style={styles.rowMeta}>Nothing on the calendar.</Text>
          ) : (
            data.events!.map((event, index) => (
              <View key={index} style={styles.row}>
                <Text style={styles.rowLabel}>{event.summary ?? "(untitled)"}</Text>
                <Text style={styles.rowMeta}>{event.start}</Text>
              </View>
            ))
          )}
        </View>
      );
    },
  });

  return null;
}
