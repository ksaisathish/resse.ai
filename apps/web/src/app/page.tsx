export default function Home() {
  return (
    <main className="ck-page">
      <p className="ck-eyebrow">Resse.ai</p>
      <h1>Backend runtime</h1>
      <p className="ck-dek">
        This Next.js app has no end-user UI of its own — the front desk lives in the Expo app
        under <code>apps/mobile</code>. This process only hosts the agent backend it talks to.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1.05rem" }}>Routes this app serves</h2>
        <ul style={{ marginTop: "0.75rem", lineHeight: 1.9 }}>
          <li>
            <code>/api/mobile-copilotkit</code> — the CopilotKit runtime the Expo app connects
            to (see <code>apps/mobile/src/config.ts</code>).
          </li>
          <li>
            <code>/api/search</code> — Exa web search, used when <code>EXA_API_KEY</code> is set.
          </li>
          <li>
            <code>/api/realtime-token</code> — mints a short-lived OpenAI Realtime token for
            voice sessions.
          </li>
          <li>
            <a href="/voice">/voice</a> — a browser reference implementation of the voice
            surface (WebRTC). The kiosk's own voice transport is still being adapted for Expo.
          </li>
        </ul>
      </section>
    </main>
  );
}
