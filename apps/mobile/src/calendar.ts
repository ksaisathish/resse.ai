/**
 * Real Google Calendar integration, using the access token from Google
 * sign-in (see auth.ts / use-google-auth.ts, which already requests the
 * `calendar` scope — it just wasn't being used anywhere until now).
 *
 * No refresh flow exists yet (see auth.ts's comment on Session) — once
 * accessToken expires (~1hr for Google), these calls fail with a clear
 * "session expired" reason rather than a confusing 401; the fix from the
 * user's side is signing in again. Fine for a demo, not for a kiosk that
 * needs to stay live for days unattended.
 */
import { loadSession } from "@/auth";

export type CalendarResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface CalendarEventInput {
  summary: string;
  description?: string;
  /** RFC3339, e.g. "2026-09-15T10:30:00+05:30". */
  startISO: string;
  /** RFC3339. Computed from startISO + durationMinutes if you don't have it directly. */
  endISO: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  start?: string;
  end?: string;
  htmlLink?: string;
}

/** Real device networking, so callers must never rely on this throwing —
 * anything that can go wrong (offline, DNS, a hung connection) turns into
 * a { ok: false } instead, matching the API-error and not-signed-in paths.
 * A caller that awaits this and doesn't wrap it in try/catch (see
 * tools.tsx's book_appointment approval card) would otherwise get stuck
 * mid-flow: an uncaught rejection skips the `respond()`/state-reset calls
 * that follow it. */
async function authorizedFetch(path: string, init: RequestInit = {}): Promise<CalendarResult<Response>> {
  const session = await loadSession();
  if (!session) return { ok: false, reason: "Not signed in with Google." };
  if (Date.now() >= session.expiresAt) {
    return { ok: false, reason: "Google session expired — sign in again to sync the calendar." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${session.accessToken}`,
      },
      signal: controller.signal,
    });
    return { ok: true, value: response };
  } catch (cause) {
    const reason =
      cause instanceof Error && cause.name === "AbortError"
        ? "Google Calendar did not respond in time."
        : `Could not reach Google Calendar: ${cause instanceof Error ? cause.message : String(cause)}`;
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }
}

/** Google guarantees a JSON body on a 2xx calendar response, but parsing is
 * still a fallible I/O step — keep it inside the CalendarResult contract
 * rather than letting a malformed body throw past the caller. */
async function parseJson<T>(response: Response): Promise<CalendarResult<T>> {
  try {
    return { ok: true, value: (await response.json()) as T };
  } catch (cause) {
    return {
      ok: false,
      reason: `Google Calendar returned an unreadable response: ${cause instanceof Error ? cause.message : String(cause)}`,
    };
  }
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarResult<CalendarEvent>> {
  const fetched = await authorizedFetch("calendars/primary/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startISO },
      end: { dateTime: input.endISO },
    }),
  });
  if (!fetched.ok) return fetched;

  const response = fetched.value;
  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, reason: `Google Calendar rejected the event: ${detail.slice(0, 200)}` };
  }

  const parsed = await parseJson<{ id?: string; htmlLink?: string }>(response);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  if (!data.id) return { ok: false, reason: "Google Calendar did not return an event id." };
  return { ok: true, value: { id: data.id, summary: input.summary, htmlLink: data.htmlLink } };
}

export async function listUpcomingCalendarEvents(
  maxResults = 10,
): Promise<CalendarResult<CalendarEvent[]>> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(maxResults),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const fetched = await authorizedFetch(`calendars/primary/events?${params.toString()}`);
  if (!fetched.ok) return fetched;

  const response = fetched.value;
  if (!response.ok) {
    const detail = await response.text();
    return { ok: false, reason: `Google Calendar rejected the request: ${detail.slice(0, 200)}` };
  }

  const parsed = await parseJson<{
    items?: { id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; htmlLink?: string }[];
  }>(response);
  if (!parsed.ok) return parsed;
  const data = parsed.value;
  const events: CalendarEvent[] = (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary,
    start: item.start?.dateTime ?? item.start?.date,
    end: item.end?.dateTime ?? item.end?.date,
    htmlLink: item.htmlLink,
  }));
  return { ok: true, value: events };
}
