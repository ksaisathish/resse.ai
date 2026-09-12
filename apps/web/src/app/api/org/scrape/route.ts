/**
 * Org onboarding: owner shares their company URL, we scrape it and build the
 * starting knowledge base (business name, hours, services, phone,
 * description) for the receptionist to use. See RESSE_IDEATION_CONTEXT.md's
 * "Business owner onboarding" flow.
 */
import { scrapeBusinessSite } from "agent-core";

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ error: "A `url` string is required." }, { status: 400 });
  }
  if (!/^https?:\/\//.test(url)) {
    return Response.json({ error: "URL must start with http:// or https://." }, { status: 400 });
  }

  try {
    const result = await scrapeBusinessSite(url);
    if (typeof result === "string") {
      return Response.json({ error: result }, { status: 502 });
    }
    return Response.json({ business: result });
  } catch (cause) {
    console.error("Business scrape failed", cause);
    return Response.json(
      { error: "Could not reach the business scraping service. Please try again." },
      { status: 502 },
    );
  }
}
