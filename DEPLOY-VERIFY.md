# Turning on live "Verify now" (about 15 minutes, mostly clicking)

Milestone 1 already gives you a live, shareable site. This turns the **Verify
now** button into a *real* AI fact-check instead of the honest "not connected
yet" message. It needs a host that can run a small function and one API key.

## What you need
- An **Anthropic API key** — create one at https://console.anthropic.com (Billing
  → add a payment method, then API Keys → Create Key). Each check costs a small
  amount; you control the budget in the console.
- A **Vercel** account (free tier is fine) — Vercel runs the `/api/check`
  function automatically. (Netlify/Cloudflare also work but need a tiny extra
  config; Vercel is the easiest.)

## Steps
1. Go to **vercel.com**, sign up, and **Add New → Project**.
2. Drag-and-drop this whole folder (the one with `index.html` and the `api`
   folder). Vercel detects `api/check.js` as a function on its own.
3. In the project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key
   - *(optional)* `DISMYTH_MODEL` = `claude-sonnet-5` to lower cost per check
4. **Deploy** (or Redeploy). Open your site, go to **Check a claim → Verify now**.
   You should get a real verdict card in a few seconds.
5. Point **dismyth.app** at the Vercel project (Settings → Domains) — same as the
   main deploy guide.

## What this does now
- **Real grounded verdict:** Claude checks the claim **using live web search**
  and returns a verdict, confidence, reasoning, real source domains and a bias
  read. The app shows the full verdict experience around it.
- **Real consensus (optional):** if you also add `OPENAI_API_KEY`, `XAI_API_KEY`
  and/or `GEMINI_API_KEY`, GPT-4o / Grok / Gemini each cast a **real** vote and
  the "N of M agree" score becomes genuine. Only the models you connect appear —
  nothing is faked. With just the Anthropic key, it's a single grounded Claude
  verdict.

## What's still the next build (see brief.html)
- Image/video **forensics**, **origin/spread tracing**, the public **ledger**,
  accounts, billing, and social auto-posting.

## Cost notes
- Web search and each extra AI vote add cost per check. Levers: set
  `DISMYTH_WEB_SEARCH=off`, use `DISMYTH_MODEL=claude-sonnet-5`, or connect fewer
  voters. Set a monthly spend cap in each provider's console.

## Things only you can do
- Create the Anthropic account and hold the API key (it's tied to your billing).
- (Optional) create OpenAI / xAI / Google accounts for the extra votes.
- Decide the monthly spend caps.

## Things I can do next — just ask
- Add a simple per-day rate limit so costs stay predictable.
- Add the forensics / origin-trace / ledger layers from the brief.
