#!/usr/bin/env python3
"""DisMyth deploy-pack builder.

Reads the raw design-tool exports from ./src and produces a clean, deployable
static site in ./dist:
  - renames pages to tidy URLs and rewrites every internal link
  - drops the design-exploration file (DisMyth.dc.html) — it is not a real page
  - injects <title>, meta description, Open Graph / Twitter cards, favicon
  - keeps the runtime (support.js) and print component (doc-page.js) verbatim
  - adds 404.html, robots.txt, sitemap.xml
The waitlist Formspree id stays a clearly-marked placeholder for the owner to fill.
"""
import os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "src")
DIST = os.path.join(HERE, "dist")
DOMAIN = "https://dismyth.app"

# original design-tool filename  ->  clean deployed filename
RENAME = {
    "DisMyth Landing.dc.html":       "index.html",
    "DisMyth App.dc.html":           "app.html",
    "DisMyth Methodology.dc.html":   "methodology.html",
    "DisMyth Backend Brief.dc.html": "brief.html",
    "DisMyth.dc.html":               None,   # design exploration — exclude
}
# the landing already ships as index.html in src, map it to itself
SRC_TO_OUT = {
    "index.html":                    "index.html",
    "DisMyth App.dc.html":           "app.html",
    "DisMyth Methodology.dc.html":   "methodology.html",
    "DisMyth Backend Brief.dc.html": "brief.html",
}

# per-page <head> metadata
FAVICON = ("data:image/svg+xml,"
           "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E"
           "%3Crect width='32' height='32' rx='7' fill='%230c0e12'/%3E"
           "%3Ccircle cx='16' cy='16' r='6' fill='%2334d399'/%3E%3C/svg%3E")

META = {
    "index.html": dict(
        title="DisMyth — Dismiss the lie. Before it spreads.",
        desc="AI-powered fact-checker and rumour control. Check any claim against a consensus of AI models and trusted sources, trace where it started, and warn the region it's spreading in.",
        path="/", noindex=False),
    "app.html": dict(
        title="DisMyth — Check a claim",
        desc="Open the DisMyth app: submit any claim and get a multi-AI verdict with weighted evidence, an origin & spread trace, media forensics and a bias meter.",
        path="/app.html", noindex=False),
    "methodology.html": dict(
        title="DisMyth — Methodology & Standards",
        desc="How DisMyth reaches a verdict and holds itself accountable — written to align with the IFCN Code of Principles and the EFCSN Code of Standards.",
        path="/methodology.html", noindex=False),
    "brief.html": dict(
        title="DisMyth — Backend Build Brief",
        desc="Engineering handoff: the backend specification that turns the DisMyth prototype into a live product.",
        path="/brief.html", noindex=True),   # confidential handoff — keep out of search
}

VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1">'

def meta_block(out_name):
    m = META[out_name]
    url = DOMAIN + m["path"]
    robots = '\n<meta name="robots" content="noindex,nofollow">' if m["noindex"] else ""
    return f'''{VIEWPORT}
<title>{m["title"]}</title>
<meta name="description" content="{m["desc"]}">
<meta name="theme-color" content="#0c0e12">
<link rel="icon" href="{FAVICON}">
<link rel="canonical" href="{url}">{robots}
<meta property="og:type" content="website">
<meta property="og:site_name" content="DisMyth">
<meta property="og:title" content="{m["title"]}">
<meta property="og:description" content="{m["desc"]}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{m["title"]}">
<meta name="twitter:description" content="{m["desc"]}">'''

def rewrite_links(html):
    for old, new in RENAME.items():
        if new is None:
            continue
        html = html.replace(old, new)
    return html

# Milestone 2: on the deployed static site there is no window.claude, so route
# "Verify now" to the /api/check serverless function instead of the placeholder.
# Whitespace-robust: locate the exact demo branch by structure, then replace it.
RUNCHECK_NEW = r'''if (!window.claude || !window.claude.complete) {
      this.setState({ screen: 'checking' });
      try {
        const r = await fetch('/api/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content, claim: claim }) });
        if (!r.ok) throw new Error('http ' + r.status);
        const j = await r.json();
        this.setState({ apiClaim: j, selectedId: 'api', screen: 'verdict' });
      } catch (e) {
        // Honest failure: no fake verdict, no fabricated AI votes, no dev text.
        this.setState({ screen: 'error', errorMsg: 'We couldn\'t reach the verification service just now. Please check your connection and try again in a moment.' });
      }
      return;
    }'''

# Milestone: real multi-AI consensus. When the API returns a `consensus` object
# (live verdicts from Claude + any other configured providers), render those real
# votes instead of the client-side simulation. Only models that actually voted
# appear. Demo feed cards (no `consensus`) keep the illustrative simulation.
ENSEMBLE_REAL = r'''  ensembleReal(cons, fallbackConf) {
    const norm = v => { v = String(v || '').trim().toLowerCase(); return v[0] === 't' ? 'True' : v[0] === 'f' ? 'False' : v[0] === 'm' ? 'Misleading' : 'Unverified'; };
    let models = (cons.models || [])
      .filter(m => m && !m.status && m.verdict != null)
      .map(m => ({ name: m.name, live: m.live !== false, verdict: norm(m.verdict), conf: Math.max(0, Math.min(100, Math.round(m.confidence != null ? m.confidence : (m.conf != null ? m.conf : fallbackConf)))) }));
    if (!models.length) models = [{ name: 'Claude', live: true, verdict: norm(cons.headVerdict), conf: fallbackConf }];
    const counts = {}; models.forEach(m => counts[m.verdict] = (counts[m.verdict] || 0) + 1);
    let best = models[0].verdict, bestN = 0;
    Object.keys(counts).forEach(k => { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
    const total = models.length;
    const agreement = Math.round(bestN / total * 100);
    const avg = Math.round(models.reduce((s, m) => s + m.conf, 0) / total);
    const contested = total > 1 && (bestN <= total / 2 || agreement < 60);
    return { models, consensusVerdict: best, agreement, agreeCount: bestN, total, avg, contested };
  }
  decorate(c) {'''

def patch_consensus(html):
    old_ens = "const ens = this.ensemble(c.verdict, conf, this.hash(c.claim || c.id || ''));"
    new_ens = ("const ens = (c.consensus && c.consensus.models && c.consensus.models.length) "
               "? this.ensembleReal(c.consensus, conf) "
               ": this.ensemble(c.verdict, conf, this.hash(c.claim || c.id || ''));")
    if old_ens not in html:
        raise AssertionError("ensemble() call site not found for consensus patch")
    html = html.replace(old_ens, new_ens, 1)
    if "  decorate(c) {" not in html:
        raise AssertionError("decorate() definition not found for consensus patch")
    html = html.replace("  decorate(c) {", ENSEMBLE_REAL, 1)
    return html

def patch_runcheck(html):
    anchor = "if (!window.claude || !window.claude.complete) {"
    a = html.find(anchor)
    if a == -1:
        raise AssertionError("runCheck demo branch not found in app source")
    ret = html.index("return;", a)          # first return inside the branch
    end = html.index("}", ret) + 1          # the branch's closing brace
    old_block = html[a:end]
    patched = html.replace(old_block, RUNCHECK_NEW, 1)
    if patched == html:
        raise AssertionError("runCheck patch did not apply")
    return patched

# Waitlist: submit to Formspree over AJAX so the visitor stays on the page and
# sees an inline "you're on the list" confirmation (no jarring redirect). Until a
# real Formspree id is set, it shows a friendly "not connected yet" note instead
# of POSTing to a dead URL — self-disables the moment YOUR_FORM_ID is replaced.
WAITLIST_GUARD = '''
<script>
document.addEventListener('submit', function (e) {
  var f = e.target;
  if (!f || !f.action || f.action.indexOf('formspree.io') === -1) return;
  e.preventDefault();
  var ok = function (msg, good) {
    f.innerHTML = '<div style="font:600 15px Inter;color:' + (good ? '#eef1f6' : '#f6a')
      + ';padding:14px 4px">' + msg + '</div>';
  };
  if (f.action.indexOf('YOUR_FORM_ID') !== -1) {
    return ok("Thanks for your interest — the waitlist opens shortly. Please check back soon.", true);
  }
  var btn = f.querySelector('button'); if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
  fetch(f.action, { method: 'POST', body: new FormData(f), headers: { 'Accept': 'application/json' } })
    .then(function (r) {
      if (r.ok) ok("You're on the list \\u2713 We'll email you the moment DisMyth launches near you.", true);
      else ok("Something went wrong — please try again in a moment.", false);
    })
    .catch(function () { ok("Network hiccup — please try again in a moment.", false); });
}, true);
</script>
'''

def build():
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    # verbatim runtime / print component
    for fn in ("support.js", "doc-page.js"):
        shutil.copyfile(os.path.join(SRC, fn), os.path.join(DIST, fn))

    # HTML pages
    for src_name, out_name in SRC_TO_OUT.items():
        html = open(os.path.join(SRC, src_name), encoding="utf-8").read()
        html = rewrite_links(html)
        # inject head metadata in place of the bare viewport tag
        assert VIEWPORT in html, f"viewport tag not found in {src_name}"
        html = html.replace(VIEWPORT, meta_block(out_name), 1)
        # waitlist guard only on the landing (the only page with the form)
        if out_name == "index.html":
            html = html.replace("</body>", WAITLIST_GUARD + "</body>", 1)
        # wire "Verify now" to the live endpoint + render real consensus
        if out_name == "app.html":
            html = patch_runcheck(html)
            html = patch_consensus(html)
        open(os.path.join(DIST, out_name), "w", encoding="utf-8").write(html)
        print(f"  {src_name}  ->  dist/{out_name}")

    # serverless verification function + owner setup files (Milestone 2)
    os.makedirs(os.path.join(DIST, "api"), exist_ok=True)
    shutil.copyfile(os.path.join(HERE, "api", "check.js"),
                    os.path.join(DIST, "api", "check.js"))
    open(os.path.join(DIST, ".env.example"), "w", encoding="utf-8").write(ENV_EXAMPLE)
    open(os.path.join(DIST, "DEPLOY-VERIFY.md"), "w", encoding="utf-8").write(DEPLOY_VERIFY)
    print("  + api/check.js, .env.example, DEPLOY-VERIFY.md")

    # 404
    open(os.path.join(DIST, "404.html"), "w", encoding="utf-8").write(NOT_FOUND)
    # robots.txt (block the confidential brief + the api from crawlers)
    open(os.path.join(DIST, "robots.txt"), "w", encoding="utf-8").write(
        "User-agent: *\nAllow: /\nDisallow: /brief.html\nDisallow: /api/\n"
        f"Sitemap: {DOMAIN}/sitemap.xml\n")
    # sitemap (public pages only)
    urls = "".join(
        f"  <url><loc>{DOMAIN}{META[p]['path']}</loc></url>\n"
        for p in ("index.html", "app.html", "methodology.html"))
    open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}</urlset>\n")
    print("  + 404.html, robots.txt, sitemap.xml")

NOT_FOUND = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DisMyth — Page not found</title>
<meta name="theme-color" content="#0c0e12">
<link rel="icon" href="''' + FAVICON + '''">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:32px;
  background:radial-gradient(120% 80% at 50% 0%,#141821,#0c0e12);color:#e8ecf2;font-family:Inter,system-ui,sans-serif}
.dot{width:10px;height:10px;border-radius:50%;background:oklch(0.72 0.15 145);box-shadow:0 0 10px oklch(0.72 0.15 145);display:inline-block;margin-right:9px;vertical-align:middle}
.brand{font:700 20px Space Grotesk;color:#f2f5f9}
h1{font:700 64px/1 Space Grotesk;letter-spacing:-2px;margin:26px 0 0;color:#f6f8fb}
p{font:15px/1.6 Inter;color:#9aa3b0;margin:14px auto 0;max-width:400px}
.btn{display:inline-block;margin-top:26px;font:700 14px Inter;color:#04140b;background:oklch(0.72 0.15 145);border-radius:12px;padding:13px 22px;text-decoration:none}
.mono{font:11px JetBrains Mono;color:#5a626f;margin-top:26px}
</style>
</head>
<body>
<div>
<div><span class="dot"></span><span class="brand">DisMyth</span></div>
<h1>404</h1>
<p>This page couldn't be found. The rumour, however, is still out there — go check one.</p>
<a class="btn" href="/">Back to home →</a>
<div class="mono">DISMISS THE LIE</div>
</div>
</body>
</html>
'''

ENV_EXAMPLE = '''# DisMyth verification function — environment variables
# Set these on your host (Vercel: Project → Settings → Environment Variables).
# Do NOT commit real keys.

# Required: your Anthropic API key (starts with sk-ant-...)
ANTHROPIC_API_KEY=

# Optional: which Claude model checks claims. Default is the most capable
# (claude-opus-5). Lower cost per check: claude-sonnet-5, or claude-haiku-4-5.
# DISMYTH_MODEL=claude-opus-5

# Optional: set to "off" to turn off live web-source grounding (cheaper/faster,
# but verdicts rely only on the model's own knowledge).
# DISMYTH_WEB_SEARCH=off

# Optional: add real cross-checking votes from other AIs. Each one you set adds
# that model as a genuine voter in the consensus (extra cost per check). Leave
# blank and only Claude votes.
# OPENAI_API_KEY=          # adds a real GPT-4o vote
# XAI_API_KEY=             # adds a real Grok vote
# GEMINI_API_KEY=          # adds a real Gemini vote
'''

DEPLOY_VERIFY = '''# Turning on live "Verify now" (about 15 minutes, mostly clicking)

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
'''

if __name__ == "__main__":
    print("Building DisMyth deploy pack…")
    build()
    print("Done → dist/")
