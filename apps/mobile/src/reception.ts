export type AppointmentStatus =
  | "upcoming"
  | "checked-in"
  | "completed"
  | "no-show"
  | "cancelled";

export type Appointment = {
  id: string;
  customerName: string;
  service: string;
  time: string;
  status: AppointmentStatus;
};

export type BusinessInfo = {
  name: string;
  hours: string;
  services: string[];
  phone: string;
};

export type ReceptionSnapshot = {
  business: BusinessInfo;
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

export const initialReception: ReceptionSnapshot = {
  business: {
    name: "Riverside Family Dental",
    hours: "Mon–Fri 8:00 AM–5:00 PM",
    services: ["Cleaning", "Checkup", "Whitening", "Emergency visit"],
    phone: "(555) 019-2044",
  },
  appointments: [
    {
      id: "appt-1",
      customerName: "Jordan Blake",
      service: "Cleaning",
      time: "9:00 AM",
      status: "completed",
    },
    {
      id: "appt-2",
      customerName: "Priya Nair",
      service: "Checkup",
      time: "10:30 AM",
      status: "upcoming",
    },
    {
      id: "appt-3",
      customerName: "Sam Ortiz",
      service: "Whitening",
      time: "11:15 AM",
      status: "no-show",
    },
    {
      id: "appt-4",
      customerName: "Dana Whitfield",
      service: "Checkup",
      time: "1:00 PM",
      status: "upcoming",
    },
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
