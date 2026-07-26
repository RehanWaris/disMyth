# DisMyth — dismyth.app

AI-powered fact-checker / rumour-control. Submit a claim → get a verdict
(True / False / Misleading / Unverified) from a consensus of AI models,
grounded with live web search, plus reasoning, evidence, origin and a bias meter.

Tagline: **"Dismiss the lie. Before it spreads."** · Created by Rehan Imam Waris.

## How this deploys

Connected to Vercel via Git — **every push to `main` deploys automatically** to
dismyth.app. No more drag-and-drop.

- Static site is served from **`dist/`** (set in `vercel.json`).
- The live verify API is the serverless function **`api/check.js`** (Vercel runs
  any file in a root `api/` folder as a function; reachable at `/api/check`).

### Required Vercel environment variables
Set these in Vercel → Project → Settings → Environment Variables (never commit them):

| Name | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude — the primary fact-checker (required) |
| `XAI_API_KEY` | Grok — a consensus voter |
| `OPENAI_API_KEY` | GPT-4o — a consensus voter |
| `GEMINI_API_KEY` | Gemini — a consensus voter |

Optional overrides: `DISMYTH_MODEL`, `DISMYTH_WEB_SEARCH` (`off` to disable web
grounding), `OPENAI_MODEL`, `XAI_MODEL`, `GEMINI_MODEL`.

## Editing the site

1. Edit the source in **`src/`** (not `dist/` — `dist/` is generated).
2. Run the build to regenerate the deployable site:
   ```bash
   python3 build.py
   ```
3. Commit and push. Vercel builds and deploys `main` automatically.

See `HANDOVER.md` for full project context.
