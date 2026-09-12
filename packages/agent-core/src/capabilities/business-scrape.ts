/**
 * Business-site scraping for org onboarding.
 *
 * Owner shares their company URL -> Exa fetches the page's readable content
 * -> a cheap OpenAI call extracts the structured fields the receptionist
 * needs (name, hours, services, phone, one-line description). Mirrors
 * search.ts's shape: surface-agnostic, the route just calls this and
 * relays the result.
 */
import { Exa } from "exa-js";

export interface ScrapedBusiness {
  name: string;
  hours: string;
  services: string[];
  phone: string;
  description: string;
  email: string;
  address: string;
  website: string;
  sourceUrl: string;
}

export function isBusinessScrapeConfigured(): boolean {
  return Boolean(process.env.EXA_API_KEY) && Boolean(process.env.OPENAI_API_KEY);
}

export async function scrapeBusinessSite(url: string): Promise<ScrapedBusiness | string> {
  const exaKey = process.env.EXA_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!exaKey) {
    return "Business scraping needs EXA_API_KEY, which is not set on this deployment.";
  }
  if (!openaiKey) {
    return "Business scraping needs OPENAI_API_KEY, which is not set on this deployment.";
  }

  const exa = new Exa(exaKey);
  const contents = await exa.getContents([url], { text: true });
  const page = contents.results?.[0];
  if (!page?.text) {
    return `Could not read any content from ${url}. Check the URL is public and reachable.`;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract business info from the given webpage text, for a receptionist kiosk to use. " +
            "Return strict JSON with keys: name (string), hours (string, e.g. 'Mon-Fri 9am-5pm'), " +
            "services (array of strings), phone (string, empty string if not found), email (string, " +
            "empty string if not found), address (string, empty string if not found), website " +
            "(string, empty string if not found — the site's own canonical URL if stated, otherwise " +
            "empty), description (one sentence on what the business does). If a field truly cannot " +
            "be determined, use an empty string (or 'Not listed on site' for hours/description) " +
            "rather than inventing specifics.",
        },
        { role: "user", content: page.text.slice(0, 6000) },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    return `Could not extract business info: ${detail.slice(0, 300)}`;
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content ?? "{}";

  let parsed: Partial<ScrapedBusiness>;
  try {
    parsed = JSON.parse(raw) as Partial<ScrapedBusiness>;
  } catch {
    return "The extraction model returned invalid JSON; try again.";
  }

  return {
    name: typeof parsed.name === "string" && parsed.name ? parsed.name : "Unnamed business",
    hours: typeof parsed.hours === "string" && parsed.hours ? parsed.hours : "Not listed on site",
    services: Array.isArray(parsed.services)
      ? parsed.services.filter((item): item is string => typeof item === "string")
      : [],
    phone: typeof parsed.phone === "string" ? parsed.phone : "",
    description: typeof parsed.description === "string" ? parsed.description : "",
    email: typeof parsed.email === "string" ? parsed.email : "",
    address: typeof parsed.address === "string" ? parsed.address : "",
    website: typeof parsed.website === "string" ? parsed.website : "",
    sourceUrl: url,
  };
}
