/**
 * Friendly status text for the tools defined in apps/mobile/src/tools.tsx.
 * Extend this map as you add tools — anything unmapped falls back to a
 * generic "Working on X..." label so a new tool never shows nothing.
 */
const KNOWN_LABELS: Record<string, string> = {
  get_business_info: "Checking business info…",
  list_appointments: "Checking today's queue…",
  check_in_appointment: "Updating appointment…",
  list_clients: "Checking client directory…",
  find_client: "Looking up client…",
  call_number: "Opening dialer…",
  message_number: "Opening message composer…",
  book_appointment: "Preparing booking…",
  list_calendar_events: "Checking Google Calendar…",
};

export function labelForToolName(name: string, _args?: Record<string, unknown>): string {
  return KNOWN_LABELS[name] ?? `Working on "${name}"…`;
}
