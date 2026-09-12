/**
 * Turning "do you have anything Tuesday afternoon?" into concrete times the
 * agent can actually offer.
 *
 * Without this the agent could only echo back a time the customer proposed;
 * it had no idea what today was, when the business is open, or what's
 * already taken, so it couldn't suggest an alternative when the requested
 * slot didn't work. Kept as pure functions over explicit inputs (no clock
 * reads, no app state) so the awkward cases — week boundaries, closed days,
 * a slot that runs past closing — are testable.
 */
import type { Availability, DayAvailability } from "@/reception";

export interface BusyInterval {
  startISO: string;
  endISO: string;
}

export interface Slot {
  startISO: string;
  endISO: string;
  /** How the agent should say it out loud, in the device's local time. */
  label: string;
}

/** Date.getDay() is 0=Sunday; Availability is keyed by short weekday name. */
const DAY_KEYS: (keyof Availability)[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseClock(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function dayWindow(date: Date, availability: DayAvailability): { open: Date; close: Date } | null {
  if (availability === "closed") return null;
  const open = parseClock(availability.open);
  const close = parseClock(availability.close);
  if (!open || !close) return null;

  const openAt = new Date(date);
  openAt.setHours(open.hours, open.minutes, 0, 0);
  const closeAt = new Date(date);
  closeAt.setHours(close.hours, close.minutes, 0, 0);
  if (closeAt <= openAt) return null;
  return { open: openAt, close: closeAt };
}

function overlaps(startMs: number, endMs: number, busy: BusyInterval[]): boolean {
  return busy.some((interval) => {
    const busyStart = new Date(interval.startISO).getTime();
    const busyEnd = new Date(interval.endISO).getTime();
    if (Number.isNaN(busyStart) || Number.isNaN(busyEnd)) return false;
    return startMs < busyEnd && endMs > busyStart;
  });
}

export interface SuggestSlotsParams {
  /** "Now" is passed in rather than read from the clock so this stays pure. */
  now: Date;
  /** Per-weekday opening hours. With none, no slots can be suggested — the
   * agent should fall back to asking rather than inventing availability. */
  availability?: Availability;
  /** Times already taken: local appointments plus real calendar events. */
  busy?: BusyInterval[];
  durationMinutes?: number;
  /** How far ahead to look. */
  daysAhead?: number;
  maxSlots?: number;
  /** Restrict to a single day, e.g. when the customer said "Tuesday". */
  onlyDateISO?: string;
  /** Slots start on this grid, in minutes. */
  stepMinutes?: number;
  /** Nothing sooner than this from now — a kiosk offering a slot four
   * minutes out is offering something nobody can make. */
  leadTimeMinutes?: number;
}

export function suggestSlots(params: SuggestSlotsParams): Slot[] {
  const {
    now,
    availability,
    busy = [],
    durationMinutes = 30,
    daysAhead = 14,
    maxSlots = 5,
    onlyDateISO,
    stepMinutes = 30,
    leadTimeMinutes = 60,
  } = params;

  if (!availability || durationMinutes <= 0 || stepMinutes <= 0) return [];

  const earliest = now.getTime() + leadTimeMinutes * 60_000;
  const slots: Slot[] = [];

  let onlyDay: Date | null = null;
  if (onlyDateISO) {
    const parsed = new Date(onlyDateISO);
    if (Number.isNaN(parsed.getTime())) return [];
    onlyDay = parsed;
  }

  for (let offset = 0; offset < daysAhead && slots.length < maxSlots; offset += 1) {
    const day = onlyDay ? new Date(onlyDay) : new Date(now);
    if (!onlyDay) day.setDate(day.getDate() + offset);
    day.setHours(0, 0, 0, 0);

    const window = dayWindow(day, availability[DAY_KEYS[day.getDay()]]);
    if (window) {
      for (
        let start = new Date(window.open);
        start.getTime() + durationMinutes * 60_000 <= window.close.getTime();
        start = new Date(start.getTime() + stepMinutes * 60_000)
      ) {
        const startMs = start.getTime();
        const endMs = startMs + durationMinutes * 60_000;
        if (startMs < earliest) continue;
        if (overlaps(startMs, endMs, busy)) continue;

        slots.push({
          startISO: new Date(startMs).toISOString(),
          endISO: new Date(endMs).toISOString(),
          label: new Date(startMs).toLocaleString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        });
        if (slots.length >= maxSlots) break;
      }
    }

    // A single requested day has exactly one pass; without this the loop
    // would re-scan that same day until it filled maxSlots.
    if (onlyDay) break;
  }

  return slots;
}

/** Existing appointments as busy intervals. Demo rows carry only a display
 * `time` string with no real date, so they can't block anything and are
 * skipped rather than guessed at. */
export function busyFromAppointments(
  appointments: { startISO?: string; durationMinutes?: number; status: string }[],
): BusyInterval[] {
  const intervals: BusyInterval[] = [];
  for (const appointment of appointments) {
    if (!appointment.startISO) continue;
    if (appointment.status === "cancelled" || appointment.status === "no-show") continue;
    const start = new Date(appointment.startISO);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + (appointment.durationMinutes ?? 30) * 60_000);
    intervals.push({ startISO: start.toISOString(), endISO: end.toISOString() });
  }
  return intervals;
}
