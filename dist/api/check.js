// DisMyth — live claim verification endpoint.
//
// POST /api/check  { content: "<prompt-ready claim/context>", claim: "<raw claim>" }
//   -> 200 with the verdict object the app renders:
//      { verdict, confidence, claim, checks[], origin, evidence[], bias,
//        consensus: { models: [{ name, verdict, confidence, live }] } }
//
// Runs on any host that executes Node serverless functions in an /api folder
// (Vercel out of the box). Uses the built-in fetch — no npm install, so the
// whole project stays drag-and-drop deployable.
//
// Environment variables (set on the host — do NOT commit real keys):
//   ANTHROPIC_API_KEY    (required)  the primary fact-checker (Claude).
//   DISMYTH_MODEL        (optional)  Claude model, default claude-opus-5.
//                                    claude-sonnet-5 / claude-haiku-4-5 = cheaper.
//   DISMYTH_WEB_SEARCH   (optional)  "off" disables live web-source grounding.
//   OPENAI_API_KEY       (optional)  adds a real GPT-4o vote to the consensus.
//   XAI_API_KEY          (optional)  adds a real Grok vote.
//   GEMINI_API_KEY       (optional)  adds a real Gemini vote.
//   OPENAI_MODEL / XAI_MODEL / GEMINI_MODEL  (optional) override each model id.
//
// Consensus is honest: a model only appears if it actually returned a verdict.
// With just ANTHROPIC_API_KEY set you get a single grounded Claude verdict; add
// the other keys and they become real cross-checking voters.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// Primary prompt — the exact JSON contract the frontend reads.
const SYSTEM_PROMPT =
  'You are DisMyth, a neutral, non-partisan fact-checking engine. Assess the ' +
  "user's claim. When live web search is available, use it to check current, " +
  'verifiable facts and cite the domains you relied on. Respond with ONLY ' +
  'minified JSON, no markdown, no prose, exactly this shape: {"verdict":"True|' +
  'False|Misleading|Unverified","confidence":<integer 0-100>,"claim":"<cleaned ' +
  'claim>","checks":["<2-3 short evidence-based reasoning steps>"],"origin":"' +
  '<one short line on likely context or spread>","evidence":[{"source":"<domain ' +
  'or path, no https prefix>","type":"Official|Government|Scientific|News|' +
  'Forensic|Encyclopedic"}],"bias":{"leaning":"Left|Center-left|Center|Center-' +
  'right|Right|N/A","note":"<one short line on political framing, or none ' +
  'detected>"}}. Provide 2-3 evidence items from real sources. If you cannot ' +
  'verify, use "Unverified". Keep every string concise.';

// Lightweight prompt for the cross-checking voters — just a verdict + confidence.
const VOTER_PROMPT =
  'You are a neutral, non-partisan fact-checking model. Assess the claim and ' +
  'respond with ONLY minified JSON, no other text: {"verdict":"True|False|' +
  'Misleading|Unverified","confidence":<integer 0-100>}. If unsure, use "Unverified".';

function firstJsonObject(text) {
  const s = String(text || '');
  const m = s.match(/\{[\s\S]*\}/); // tolerate stray wrapping text / tags
  return JSON.parse(m ? m[0] : s);
}

// fetch with a hard timeout, so one slow upstream can never stall the whole
// request into the platform's 60s function limit (which shows users an error).
async function fetchTO(url, opts, ms) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) return JSON.parse(req.body);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

// Live web-source grounding (Milestone: web search). Newer Claude models use the
// dynamic-filtering tool; a couple of older ids need the basic variant.
function webTools(model) {
  if (process.env.DISMYTH_WEB_SEARCH === 'off') return undefined;
  const basic = /haiku|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|claude-3/.test(model);
  return [{ type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 3 }];
}

// Primary check: Claude, optionally grounded with live web search.
async function callClaude(content, key, model) {
  const tools = webTools(model);
  let messages = [{ role: 'user', content }];
  let data;
  // Stay well under the 60s platform cap: give the whole Claude+search phase a
  // hard budget and abort rather than let it run into a 504.
  const deadline = Date.now() + 42000;
  for (let i = 0; i < 3; i++) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) return { ok: false, status: 408, detail: 'Claude search phase exceeded its time budget.' };
    const payload = {
      model,
      max_tokens: 1024,
      // Fast, cheap single-shot JSON. To trade cost for deeper reasoning,
      // delete this line (Claude then reasons before answering).
      thinking: { type: 'disabled' },
      system: SYSTEM_PROMPT,
      messages,
    };
    if (tools) payload.tools = tools;
    let r;
    try {
      r = await fetchTO(ANTHROPIC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(payload),
      }, remaining);
    } catch (e) {
      return { ok: false, status: 408, detail: 'Claude request timed out.' };
    }
    if (!r.ok) return { ok: false, status: r.status, detail: await r.text().catch(() => '') };
    data = await r.json();
    // Server ran the search loop to its cap — resume once more.
    if (data.stop_reason === 'pause_turn') {
      messages = messages.concat([{ role: 'assistant', content: data.content }]);
      continue;
    }
    break;
  }
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    return { ok: true, obj: firstJsonObject(text) };
  } catch {
    return { ok: false, status: 200, detail: 'Could not parse a verdict from the model response.' };
  }
}

// Generic OpenAI-compatible voter (used for GPT-4o and Grok).
async function voteChat(url, key, model) {
  return async function (content) {
    if (!key) return { status: 'not_connected' };
    try {
      const r = await fetchTO(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model,
          max_tokens: 200,
          messages: [
            { role: 'system', content: VOTER_PROMPT },
            { role: 'user', content },
          ],
        }),
      }, 20000);
      if (!r.ok) return { status: 'error' };
      const d = await r.json();
      const t = (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
      const j = firstJsonObject(t);
      return { verdict: j.verdict, confidence: j.confidence };
    } catch {
      return { status: 'error' };
    }
  };
}

async function voteGemini(content) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { status: 'not_connected' };
  try {
    // "gemini-flash-latest" is an alias that always tracks Google's current
    // flash model — avoids 404s when a specific version is retired.
    const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;
    const r = await fetchTO(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: VOTER_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: content }] }],
        generationConfig: { maxOutputTokens: 512, responseMimeType: 'application/json' },
      }),
    }, 20000);
    if (!r.ok) return { status: 'error' };
    const d = await r.json();
    // Newer (thinking) models can split the reply across parts — join all text.
    const parts =
      (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
    const t = parts.map((p) => p && p.text).filter(Boolean).join('');
    const j = firstJsonObject(t);
    return { verdict: j.verdict, confidence: j.confidence };
  } catch {
    return { status: 'error' };
  }
}

// Read which optional voters are enabled (set from the admin console). Best-
// effort: any failure defaults every voter ON, so the product never breaks.
async function readAiEnabled() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const on = { gpt4o: true, grok: true, gemini: true };
  if (!url || !key) return on;
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/rest/v1/app_settings?key=eq.ai_enabled&select=value', {
      headers: { apikey: key, authorization: 'Bearer ' + key },
    });
    if (!r.ok) return on;
    const rows = await r.json();
    const v = rows[0] && rows[0].value;
    return v ? Object.assign(on, v) : on;
  } catch {
    return on;
  }
}

// Save each check to the Supabase "checks" table (server-side, service role).
// Best-effort: a logging failure must never break the user's verdict.
async function saveCheck(verdict, claim, region) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(url.replace(/\/+$/, '') + '/rest/v1/checks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: 'Bearer ' + key,
        prefer: 'return=minimal',
      },
      body: JSON.stringify({
        claim: (claim || verdict.claim || '').slice(0, 2000),
        verdict: verdict.verdict || null,
        confidence: typeof verdict.confidence === 'number' ? verdict.confidence : null,
        models: (verdict.consensus && verdict.consensus.models) || null,
        evidence: verdict.evidence || null,
        region: region || null,
      }),
    });
  } catch (e) {
    /* ledger logging is best-effort; never surface to the user */
  }
}

module.exports = async function handler(req, res) {
  const json = (code, obj) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const started = Date.now();
  const key = process.env.ANTHROPIC_API_KEY;
  // Sonnet is fast and strong for grounded fact-checking; the 4-AI consensus +
  // live web sources keep quality high. (Was opus-5, which was slow enough to
  // hit the platform timeout on heavy searches.) Override with DISMYTH_MODEL.
  const model = process.env.DISMYTH_MODEL || 'claude-sonnet-5';

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const content = (body.content || body.claim || '').toString().trim();
  const claim = (body.claim || '').toString().trim();
  if (!content) return json(400, { error: 'content is required.' });

  // Not configured yet — respond honestly, in the shape the app renders.
  if (!key) {
    return json(200, {
      verdict: 'Unverified',
      confidence: 0,
      claim: claim || 'Submitted item',
      checks: [
        'Live verification is not connected yet. Add ANTHROPIC_API_KEY on the ' +
          'host and redeploy to turn on real verdicts (see DEPLOY-VERIFY.md).',
      ],
      origin: 'Verification backend not configured',
      evidence: [],
    });
  }

  // Run the primary Claude check AND the cross-checking voters at the same time
  // (voters assess the raw claim independently), so total latency is the slowest
  // single model, not the sum. Voter set honours the admin on/off toggles.
  const off = { status: 'off' };
  const voteGPT = await voteChat('https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o');
  const voteGrok = await voteChat('https://api.x.ai/v1/chat/completions', process.env.XAI_API_KEY, process.env.XAI_MODEL || 'grok-3');
  const claudeP = callClaude(content, key, model);
  const votersP = readAiEnabled().then((aiOn) => Promise.all([
    aiOn.gpt4o !== false ? voteGPT(content) : Promise.resolve(off),
    aiOn.grok !== false ? voteGrok(content) : Promise.resolve(off),
    aiOn.gemini !== false ? voteGemini(content) : Promise.resolve(off),
  ]));
  const [claude, [gpt, grok, gem]] = await Promise.all([claudeP, votersP]);

  if (!claude.ok) {
    return json(200, {
      verdict: 'Unverified',
      confidence: 40,
      claim: claim || 'Submitted item',
      checks: ['The check took longer than usual and was stopped. Please try again — it usually works on a second try.'],
      origin: 'Timed out or upstream error',
      evidence: [],
      _debug: (String(claude.status) + ' ' + (claude.detail || '')).slice(0, 300),
    });
  }

  const verdict = claude.obj;

  const models = [{ name: 'Claude', live: true, verdict: verdict.verdict, confidence: verdict.confidence }];
  const add = (name, r) => {
    if (r && !r.status && r.verdict != null) models.push({ name, live: true, verdict: r.verdict, confidence: r.confidence });
  };
  add('GPT-4o', gpt);
  add('Grok', grok);
  add('Gemini', gem);

  verdict.consensus = { models };
  await saveCheck(verdict, claim, (body.region || '').toString().slice(0, 120));
  // Non-user-facing diagnostics (which model ran + server time) — safe to read
  // via response headers; the app ignores them.
  res.setHeader('x-dismyth-model', model);
  res.setHeader('x-dismyth-ms', String(Date.now() - started));
  res.setHeader('x-dismyth-search', process.env.DISMYTH_WEB_SEARCH === 'off' ? 'off' : 'on');
  return json(200, verdict);
};
