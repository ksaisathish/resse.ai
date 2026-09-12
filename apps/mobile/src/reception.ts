export type AppointmentStatus =
  | "upcoming"
  | "checked-in"
  | "completed"
  | "no-show"
  | "cancelled";

export type Client = {
  id: string;
  name: string;
  /** Phone number, used by the call_number/message_number tools. Keep it a
   * real-looking number even in demo data — the tools dial/compose exactly
   * what's stored here. */
  phone: string;
  email?: string;
  notes?: string;
};

export type Appointment = {
  id: string;
  clientId: string;
  /** Denormalized for display convenience — kept in sync with the client's
   * name at creation time. Look up the Client record for phone/email/notes. */
  customerName: string;
  service: string;
  time: string;
  status: AppointmentStatus;
};

/** One day's hours, or "closed". Used for "are you open right now"-style
 * questions — the free-text `hours` field on BusinessInfo is what's shown to
 * customers; this is what the agent can actually reason about precisely. */
export type DayAvailability = { open: string; close: string } | "closed";

export type Availability = {
  mon: DayAvailability;
  tue: DayAvailability;
  wed: DayAvailability;
  thu: DayAvailability;
  fri: DayAvailability;
  sat: DayAvailability;
  sun: DayAvailability;
};

export type BusinessInfo = {
  name: string;
  /** Human-readable summary shown in the UI, e.g. "Mon-Fri 8am-5pm". */
  hours: string;
  /** Structured per-day hours, optional — org onboarding (Exa scrape) may not
   * always produce this reliably; fall back to the `hours` string when unset. */
  availability?: Availability;
  services: string[];
  phone: string;
  email?: string;
  address?: string;
  website?: string;
  description?: string;
  /** UPI ID (VPA) that receives booking deposits, e.g. "business@okhdfcbank".
   * Set manually during org setup — not something a website scrape can find.
   * When unset, book_appointment skips the payment QR step entirely. */
  upiId?: string;
  /** Default deposit amount (INR) suggested when booking a new appointment.
   * The agent can still propose a different amount per booking. */
  bookingDepositAmount?: number;
};

export type ReceptionSnapshot = {
  business: BusinessInfo;
  clients: Client[];
  appointments: Appointment[];
};

export type StatusChangeInput = {
  appointmentId: string;
  status: AppointmentStatus;
};

export type StatusChangeValidation =
  | { ok: true; value: StatusChangeInput }
  | { ok: false; reason: string };

export type StatusChangeResult =
  | { snapshot: ReceptionSnapshot; appointment: Appointment; error?: never }
  | { snapshot: ReceptionSnapshot; appointment?: undefined; error: string };

const demoClients: Client[] = [
  { id: "client-1", name: "Jordan Blake", phone: "+15550190021", email: "jordan.blake@example.com" },
  { id: "client-2", name: "Priya Nair", phone: "+15550190022", email: "priya.nair@example.com" },
  { id: "client-3", name: "Sam Ortiz", phone: "+15550190023" },
  { id: "client-4", name: "Dana Whitfield", phone: "+15550190024", notes: "Prefers afternoon slots" },
];

export const initialReception: ReceptionSnapshot = {
  business: {
    name: "Riverside Family Dental",
    hours: "Mon–Fri 8:00 AM–5:00 PM",
    availability: {
      mon: { open: "08:00", close: "17:00" },
      tue: { open: "08:00", close: "17:00" },
      wed: { open: "08:00", close: "17:00" },
      thu: { open: "08:00", close: "17:00" },
      fri: { open: "08:00", close: "17:00" },
      sat: "closed",
      sun: "closed",
    },
    services: ["Cleaning", "Checkup", "Whitening", "Emergency visit"],
    phone: "+15550190020",
    email: "frontdesk@riversidedental.example",
    address: "142 Riverside Ave, Springfield",
    upiId: "riversidedental@okhdfcbank",
    bookingDepositAmount: 200,
  },
  clients: demoClients,
  appointments: [
    { id: "appt-1", clientId: "client-1", customerName: "Jordan Blake", service: "Cleaning", time: "9:00 AM", status: "completed" },
    { id: "appt-2", clientId: "client-2", customerName: "Priya Nair", service: "Checkup", time: "10:30 AM", status: "upcoming" },
    { id: "appt-3", clientId: "client-3", customerName: "Sam Ortiz", service: "Whitening", time: "11:15 AM", status: "no-show" },
    { id: "appt-4", clientId: "client-4", customerName: "Dana Whitfield", service: "Checkup", time: "1:00 PM", status: "upcoming" },
  ],
};

// Which current status a requested status may transition from. Rejecting an
// invalid transition (e.g. changing an already-completed visit) is the one
// concrete failure/cancellation path this starter demonstrates end to end.
const ALLOWED_FROM: Record<AppointmentStatus, AppointmentStatus[]> = {
  upcoming: [],
  "checked-in": ["upcoming"],
  completed: ["checked-in", "upcoming"],
  "no-show": ["upcoming"],
  cancelled: ["upcoming", "checked-in"],
};

function hasField(input: Record<string, unknown>, key: keyof StatusChangeInput) {
  return input[key] !== undefined && input[key] !== null;
}

export function validateStatusChange(
  snapshot: ReceptionSnapshot,
  input: unknown,
): StatusChangeValidation {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "Appointment details are still streaming; nothing changed." };
  }

  const draft = input as Record<string, unknown>;
  const required: (keyof StatusChangeInput)[] = ["appointmentId", "status"];
  if (required.some((key) => !hasField(draft, key))) {
    return { ok: false, reason: "Appointment details are still streaming; nothing changed." };
  }

  if (typeof draft.appointmentId !== "string" || typeof draft.status !== "string") {
    return { ok: false, reason: "Appointment details are invalid; nothing changed." };
  }

  const appointmentId = draft.appointmentId.trim();
  const status = draft.status as AppointmentStatus;
  if (!Object.hasOwn(ALLOWED_FROM, status)) {
    return { ok: false, reason: `"${draft.status}" is not a valid appointment status.` };
  }

  const appointment = snapshot.appointments.find((item) => item.id === appointmentId);
  if (!appointment) {
    return { ok: false, reason: `No local appointment matched "${appointmentId}"; nothing changed.` };
  }

  const allowedFrom = ALLOWED_FROM[status];
  if (!allowedFrom.includes(appointment.status)) {
    return {
      ok: false,
      reason: `${appointment.customerName}'s appointment is already "${appointment.status}"; cannot change it to "${status}".`,
    };
  }

  return { ok: true, value: { appointmentId, status } };
}

export function applyStatusChange(
  snapshot: ReceptionSnapshot,
  input: unknown,
): StatusChangeResult {
  const validated = validateStatusChange(snapshot, input);
  if (!validated.ok) {
    return { snapshot, error: validated.reason };
  }

  const { appointmentId, status } = validated.value;
  const appointment: Appointment = {
    ...snapshot.appointments.find((item) => item.id === appointmentId)!,
    status,
  };

  return {
    appointment,
    snapshot: {
      ...snapshot,
      appointments: snapshot.appointments.map((item) =>
        item.id === appointmentId ? appointment : item,
      ),
    },
  };
}

export function upcomingAppointments(snapshot: ReceptionSnapshot) {
  return snapshot.appointments.filter((item) => item.status === "upcoming");
}

export function findClientByName(snapshot: ReceptionSnapshot, name: string): Client | undefined {
  const needle = name.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    snapshot.clients.find((client) => client.name.toLowerCase() === needle) ??
    snapshot.clients.find((client) => client.name.toLowerCase().includes(needle))
  );
}

export function clientForAppointment(
  snapshot: ReceptionSnapshot,
  appointmentId: string,
): Client | undefined {
  const appointment = snapshot.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return undefined;
  return snapshot.clients.find((client) => client.id === appointment.clientId);
}
