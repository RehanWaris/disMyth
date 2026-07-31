# DisMyth — Handover (current)

_Last updated: 2026-07-26. Hand this file (and the project folder) to a new chat to continue._

---

## 1. What DisMyth is
An AI fact-checker / rumour-control web app by **Rehan Imam Waris** (company: RIW / Spirited World Private Limited), India-first. Submit a claim → get a verdict (True/False/Misleading/Unverified) from a **consensus of 4 AIs** + live web sources, with confidence, evidence and a bias meter.
Tagline: **"Dismiss the lie. Before it spreads."** · Domain: **dismyth.app**

---

## 2. Live status — what works TODAY (verified)
- ✅ **Site + app LIVE** at **https://dismyth.app** (full-screen web app, opens straight to the feed, installable as a phone app / PWA).
- ✅ **Real 4-AI verdicts**: Claude + GPT-4o + Grok + Gemini all vote, grounded in live web search, ~10s per check.
- ✅ **Checks save to the database** and the **public ledger shows real counts** (verified: a test check moved the ledger 0→1).
- ✅ **Accounts built** (email magic-link + Google): signed-in state, sign-out, profile saving. *(Email delivery needs one Supabase setting — see §5.)*
- ✅ **Honest content**: no fabricated stats; a clear "Live now vs Coming soon" roadmap; the comparison table was removed.
- ✅ **Geolocation**: the region chip + onboarding "Use my current location" detect the user's city/state.

## 3. Infrastructure (all owned by Rehan)
| Thing | Value |
|---|---|
| Domain | **dismyth.app** (at GoDaddy) |
| Hosting | **Vercel** project `dismyth_new` (team "Rehan Waris' projects") |
| Code | **GitHub** `github.com/RehanWaris/disMyth` → auto-deploys to Vercel on every push to `main` |
| Database/auth | **Supabase** project ref `lrauoqykwgwhxxhpffzf` (in a separate org from his "Voiceworx Events" — so Claude's Supabase tools can't manage it directly; work it via SQL Editor + REST + keys) |
| Notify list | **Formspree** form `mnjeopbg` (landing "Notify me") |

**Deploy method:** Claude edits `src/` → runs `python3 build.py` → commits → `git push` (Claude has push access) → Vercel auto-deploys. No drag-drop.

**Vercel environment variables (already set):** `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Supabase (DisMyth) config:** URL `https://lrauoqykwgwhxxhpffzf.supabase.co`; publishable key `sb_publishable_FrH0thOASEhj0-5pczDPVQ_tYiNBGDS` (public, in the app). Schema: `profiles`, `checks`, `ledger_stats()` — all with row-level security.

---

## 4. WHERE WE'RE STUCK — Rehan's action items (do these)
**① (BLOCKER for login) Set the Supabase auth URLs** so magic-link emails send people back correctly:
   Supabase → **Authentication → URL Configuration**:
   - **Site URL:** `https://dismyth.app`
   - **Redirect URLs:** add `https://dismyth.app/app.html` and `https://www.dismyth.app/app.html`
   Then test: app → enter your email → **Continue** → check inbox → tap link → should land signed in.

**② Email limit (soon):** Supabase's free built-in email only sends a few/hour. Fine for testing; before real launch we'll wire a proper email sender (Resend/SendGrid). No action now — just know sign-in emails may be slow/limited during testing.

**③ (Optional) Google sign-in:** the Google button is wired but needs a one-time Google Cloud OAuth setup in Supabase (Authentication → Providers → Google). Until then, use email sign-in. Ask the new chat to walk you through it when ready.

**④ (Still pending from earlier) Activate the Notify list:** on dismyth.app, submit your own email in the "Notify me" box once, then click Formspree's confirmation email — otherwise sign-ups aren't captured.

---

## 5. What Claude does next (after ① above)
1. Confirm a real email sign-in creates a row in `profiles` (verify end-to-end).
2. Attach saved checks to the logged-in user (real per-user history) + resume onboarding after magic-link return.
3. **Payments** (Razorpay + PayPal) to make DisMyth+ (₹149) / Pro (₹4,999) actually purchasable — this needs Rehan to create Razorpay + PayPal business accounts (see §6).
4. Then the bigger roadmap features (media forensics, origin tracing, geo-alerts, broadcast, monitoring) — each is a separate project; see the "Coming soon" list on the site.

## 6. Payments (future — decisions already made)
- Use **Razorpay + PayPal** (two checkout buttons). Currencies: ₹/$/£/€ + Riyal/Dinar OK; **Ruble not possible** (sanctions). Charge in the customer's currency, settle in one (₹ via Razorpay).
- Rehan must create the **Razorpay** (request International Payments) and **PayPal Business** accounts; Claude builds the checkout + subscriptions around them.

## 7. Key notes for a new chat
- Read the auto-loaded memory files `dismyth-project.md` and `dismyth-supabase.md` first — they have the full detail.
- The app is a `.dc.html` rendered by `support.js` (React from unpkg). Build-time transforms live in `build.py` (full-screen reshell, /api/check wiring, auth engine, PWA, meta). Edit `src/`, not `dist/`.
- Integrity rule (important — it's a fact-checker): **never ship fabricated stats or claim unbuilt features as live.** Keep the "Coming soon" honesty.
- Stand-in email for setups until real ones exist: **dismissthelie@gmail.com**.
