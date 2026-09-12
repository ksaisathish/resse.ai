/**
 * Org onboarding: owner shares their company URL, we scrape it and build the
 * starting knowledge base (business name, hours, services, phone,
 * description) for the receptionist to use. See RESSE_IDEATION_CONTEXT.md's
 * "Business owner onboarding" flow.
 */
import { scrapeBusinessSite } from "agent-core";

export async function POST(request: Request) {
  const body = (await request.json()) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ error: "A `url` string is required." }, { status: 400 });
  }
  if (!/^https?:\/\//.test(url)) {
    return Response.json({ error: "URL must start with http:// or https://." }, { status: 400 });
  }

  const result = await scrapeBusinessSite(url);
  if (typeof result === "string") {
    return Response.json({ error: result }, { status: 502 });
  }
  return Response.json({ business: result });
}
