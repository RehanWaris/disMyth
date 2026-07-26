# DisMyth — Project Handover

_Last updated: 2026-07-25. Hand this (and the project folder) to a new session to continue._

---

## 1. What DisMyth is
An AI-powered **fact-checker / rumour-control** web product by **Rehan Imam Waris** (India-first — ₹ pricing, Tamil Nadu/Delhi examples). A person submits a claim/link/photo/video → gets a **verdict** (True / False / Misleading / Unverified / Contested) from a **consensus of AI models** + web sources, with reasoning, evidence, an origin/spread trace, and a bias meter. Freemium: Free / DisMyth+ ₹149 / Pro-Newsroom ₹4,999.

Tagline: **"Dismiss the lie. Before it spreads."**

---

## 2. Current status (what works right now)
- ✅ **Site is LIVE** at **https://dismythnew.vercel.app** (landing, app demo, methodology, backend brief, 404).
- ✅ **Live "Verify now" works** — real AI verdicts, **web-search grounded**.
- ✅ **Real multi-AI consensus** — **Claude + Grok** are both voting (verified live).
- ✅ **Waitlist** wired to Formspree `mnjeopbg` (⚠️ needs the one-time first-submission confirmation email — submit once to activate).
- ⏳ **Custom domain `dismyth.app`** — DNS just corrected at GoDaddy (see §7); waiting on propagation, then Vercel → Refresh should go green.
- 🔵 **Gemini & GPT-4o** not voting yet (account issues, not code — see §6).

---

## 3. Accounts & infrastructure
| Thing | Value |
|---|---|
| Vercel team | "Rehan Waris' projects" — `team_foLfUA2DucUgwC5ovRlIJhW9` |
| Vercel project | **`dismyth_new`** — `prj_qSXZHVyHfEw7jW73025VgjeAnRV4` |
| Public URL | https://dismythnew.vercel.app |
| Domain | **dismyth.app** at **GoDaddy** |
| Deploy method | **Drag-and-drop** (NOT Git) — this matters, see §5 |

**Vercel Environment Variables** (Production + Preview), exact names (case-sensitive):
- `ANTHROPIC_API_KEY` — ✅ working (Claude). ⚠️ **ROTATE THIS** — a key was pasted in plaintext chat earlier; if that same key is in Vercel, delete it in console.anthropic.com and put a fresh one in Vercel, then redeploy.
- `XAI_API_KEY` — ✅ working (Grok). Funded with ~$5 on xAI.
- `OPENAI_API_KEY` — set but **GPT-4o skipped**: OpenAI returns `429 insufficient_quota` (no billing).
- `GEMINI_API_KEY` — set but **Gemini skipped**: returns `429 free-tier limit: 0` (key's Google project has no free quota).
- Optional overrides (not currently set): `DISMYTH_MODEL` (default `claude-opus-5`), `DISMYTH_WEB_SEARCH` (`off` to disable web search), `OPENAI_MODEL` (`gpt-4o`), `XAI_MODEL` (`grok-3`), `GEMINI_MODEL` (`gemini-2.0-flash`).

---

## 4. Where the code lives
- **Design source of truth:** claude.ai/design project `cd36a12f-10c7-4f90-af30-d29a637b3f31` (landing, app, methodology, brief, `support.js`, `doc-page.js`). Read/edit via the **DesignSync** tool.
- **Local deploy pack:** `/Users/riw/Documents/Claude/Projects/New Code/dismyth/`
  - `src/` — raw exports from the design project
  - `build.py` — transforms `src/` → `dist/` (renames pages to clean URLs, fixes links, injects titles/OG/favicon, wires waitlist, patches the app's `runCheck` to call `/api/check`, patches the app to render real consensus, copies `api/check.js`, writes 404/robots/sitemap)
  - `dist/` — the deployable static site + `api/check.js`
  - `api/check.js` — the serverless verification function (source; build copies it into `dist/api/`)
  - `dismyth-site.zip` — a ready-to-drag zip of `dist/` **contents at the root**
  - `DEPLOY.md`, `GO-LIVE-CHECKLIST.md`, `DEPLOY-VERIFY.md` — founder-facing guides
- **Rebuild anytime:** `cd dismyth && python3 build.py` → regenerates `dist/`. Re-zip: `cd dist && zip -r -X ../dismyth-site.zip . -x ".env.example" "DEPLOY-VERIFY.md"`

---

## 5. How to deploy updates (READ THIS — it's the fiddly part)
The Vercel project was created by **drag-and-drop, not Git**, so updating code means redeploying files. Hard-won gotchas:
1. **Drag the CONTENTS of `dist` at the root** — use `dismyth-site.zip` (files are at the zip root). **Never drag the parent `dismyth` folder** → it nests everything under `/dist/` and the root 404s.
2. **Env-var changes need a redeploy** to take effect (Deployments → Production → ••• → Redeploy).
3. **Env-var names are case-sensitive** and must match `check.js` exactly.
4. **Deployment Protection is ON:** only the production alias (`dismythnew.vercel.app`) is public; every other deployment URL requires Vercel login. To read a protected URL programmatically, use the Vercel MCP `web_fetch_vercel_url` tool.
5. **A full-site deploy via the Vercel MCP `deploy_to_vercel` is ~277 KB** — too large to hand-transmit reliably. That's why we use the zip for the frontend. Small API-only diagnostics CAN be deployed via MCP as a **preview** target (keeps env vars, doesn't touch production).

**STRONGLY RECOMMENDED next infra step:** connect `dismyth_new` to a **GitHub repo**. Then code updates deploy automatically, env vars persist, and all the drag-drop pain disappears. This is the right foundation for ongoing iteration.

---

## 6. How the app works (technical)
- The `.dc.html` files render via `support.js` (the "dc-runtime"), which **auto-loads React from unpkg** — so they work on any static host.
- **Verify flow:** inside the claude.ai design tool the app calls `window.claude`; on the deployed site (no `window.claude`) the app's patched `runCheck` calls **`POST /api/check`**.
- **`api/check.js`:** calls Anthropic Messages API (**web_search tool** grounding, `pause_turn` loop) for the primary verdict, then runs **GPT-4o / Grok / Gemini in parallel** as real voters *only if their keys are set*. Returns the verdict JSON the app renders, including `consensus.models[]`. Only providers that actually return a vote appear (nothing faked). Uses raw `fetch` (no npm install → stays drag-deployable).
- **Frontend consensus:** `build.py` patches the app's `decorate()` with `ensembleReal()` so real live votes are shown for actual checks; the demo feed cards keep their illustrative simulation.

---

## 7. Domain DNS (GoDaddy) — current correct state
Keep these:
- `A · @ · 216.198.79.1` (Vercel)
- `CNAME · www · cname.vercel-dns.com` (Vercel)
- NS, SOA, `_domainconnect`, `_dmarc` (leave as-is)

Just deleted: the **`A · @ · WebsiteBuilder Site`** record (GoDaddy's Airo parking — it was serving the "Try Airo" page and expanded to IPs `76.223.105.230` / `13.248.243.5`). After propagation, Vercel → dismyth_new → Settings → Domains → **Refresh** should turn `dismyth.app` green.

---

## 8. Outstanding TODO (roughly in priority order)
1. **Confirm `dismyth.app` goes live** (Vercel Refresh → green + padlock) once DNS propagates.
2. **Rotate the Anthropic API key** (exposed in chat) and update Vercel + redeploy.
3. **Activate the waitlist** — submit one email on the live site and click Formspree's confirmation.
4. **Gemini vote:** recreate the key in a fresh Google AI Studio project (free tier) OR enable billing; update `GEMINI_API_KEY`; redeploy.
5. **GPT-4o vote:** add billing/credit at OpenAI; redeploy.
6. **Email:** set up `hello@dismyth.app` and `corrections@dismyth.app` (the Methodology page publicly promises the corrections address). Free via Cloudflare Email Routing or Zoho.
7. **Reserve `@dismyth`** on X, Instagram, Threads, Facebook.
8. **(Infra) Connect GitHub** to Vercel (see §5) — do this before further code work.
9. **Optional cosmetic:** rename Vercel project `dismyth_new` → `dismyth`.
10. **Product roadmap (see `brief.html`):** media forensics, origin/spread tracing, public accuracy ledger, accounts, billing, social auto-posting, browser extension.

---

## 9. Diagnostic facts captured (so you don't re-debug)
- Grok's earlier failure was **"Incorrect API key provided"** → fixed by regenerating the key from the **funded** xAI team and updating `XAI_API_KEY`.
- OpenAI: `429 insufficient_quota` (needs billing).
- Gemini: `429` "free_tier_requests, limit: 0" (needs a free-tier-eligible project or billing).
- `check.js` currently **swallows provider errors** (returns them as skipped). To debug providers, deploy a small diagnostic to a **preview** and read it with `web_fetch_vercel_url`.

---

## 10. How to continue in a new window
Open a new session **in this project folder** (`/Users/riw/Documents/Claude/Projects/New Code`). The memory file `dismyth-project.md` auto-loads a summary. Then say something like:
> "Read `dismyth/HANDOVER.md`, then help me [connect GitHub / fix Gemini / confirm the domain / etc.]."

Everything needed — Vercel IDs, env-var names, DNS state, build steps, and open tasks — is in this file.
