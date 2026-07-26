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
  return [{ type: basic ? 'web_search_20250305' : 'web_search_20260209', name: 'web_search', max_uses: 5 }];
}

// Primary check: Claude, optionally grounded with live web search.
async function callClaude(content, key, model) {
  const tools = webTools(model);
  let messages = [{ role: 'user', content }];
  let data;
  for (let i = 0; i < 4; i++) {
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
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(payload),
    });
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
      const r = await fetch(url, {
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
      });
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
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: VOTER_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: content }] }],
        generationConfig: { maxOutputTokens: 512, responseMimeType: 'application/json' },
      }),
    });
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

module.exports = async function handler(req, res) {
  const json = (code, obj) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.DISMYTH_MODEL || 'claude-opus-5';

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

  const claude = await callClaude(content, key, model);
  if (!claude.ok) {
    return json(200, {
      verdict: 'Unverified',
      confidence: 40,
      claim: claim || 'Submitted item',
      checks: ['The verification service returned an error (' + (claude.status || '?') + '). Please try again shortly.'],
      origin: 'Upstream error',
      evidence: [],
      _debug: (claude.detail || '').slice(0, 300),
    });
  }

  const verdict = claude.obj;

  // Cross-check with any other providers whose keys are set — in parallel.
  const voteGPT = await voteChat('https://api.openai.com/v1/chat/completions', process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL || 'gpt-4o');
  const voteGrok = await voteChat('https://api.x.ai/v1/chat/completions', process.env.XAI_API_KEY, process.env.XAI_MODEL || 'grok-3');
  const [gpt, grok, gem] = await Promise.all([voteGPT(content), voteGrok(content), voteGemini(content)]);

  const models = [{ name: 'Claude', live: true, verdict: verdict.verdict, confidence: verdict.confidence }];
  const add = (name, r) => {
    if (r && !r.status && r.verdict != null) models.push({ name, live: true, verdict: r.verdict, confidence: r.confidence });
  };
  add('GPT-4o', gpt);
  add('Grok', grok);
  add('Gemini', gem);

  verdict.consensus = { models };
  return json(200, verdict);
};
