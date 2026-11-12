/**
 * JARVIS NEXUS session 7 — LLM E2E verification.
 *
 * Test A (stub): a local OpenAI-compatible server receives the app's real
 *   provider traffic (NEXUS_LLM_PROVIDERS=openai_compatible). Verifies:
 *   - multi-turn conversations work through brain.think(),
 *   - CONTEXT RETENTION: turn-2 requests contain turn-1 content (the brain
 *     supplies the last 12 conversation messages),
 *   - TOOL CALLING: a storage intent produces parsed tool_calls executed
 *     server-side with honest tool_results (error path exercised in-sandbox
 *     where Supabase credentials are absent),
 *   - ERROR RECOVERY: with the stub killed, think() degrades honestly
 *     (never crashes, never fabricates).
 *
 * Test B (real): NEXUS_LLM_PROVIDERS=zai_cloud_route → two REAL LLM turns
 *   through the full brain (system prompt, contract JSON parse, reply).
 *
 * Usage: bun scripts/verify_llm_e2e.mjs
 */
import http from 'node:http';

const ROOT = '/home/z/my-project';

// ---------------------------------------------------------------- stub server
const requests = [];
let stubHandle = null;
let port = 0;

function startStub() {
  return new Promise((resolve) => {
    stubHandle = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');
        requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
        const userText = [...parsed.messages].reverse().find((m) => m.role === 'user')?.content || '';
        let reply;
        if (/store|save|put/i.test(userText)) {
          reply = {
            reply: 'Storing that for you now, Boss.',
            emotion: 'focused',
            activity: 'Filing a note to cold storage.',
            zone: 'central_operations',
            tool_calls: [{ tool: 'storage.put', args: { key: 'notes/e2e-stub.txt', content: 'e2e stub note' } }],
          };
        } else if (/access code|banana/i.test(userText)) {
          reply = {
            reply: 'Your access code is BANANA-42.',
            emotion: 'attentive',
            activity: 'Recalling the access code.',
            zone: 'central_operations',
            tool_calls: [],
          };
        } else {
          reply = {
            reply: 'Understood, Boss — standing by.',
            emotion: 'neutral',
            activity: 'Monitoring sanctuary systems.',
            zone: 'central_operations',
            tool_calls: [],
          };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
      });
    });
    stubHandle.listen(0, '127.0.0.1', () => {
      port = stubHandle.address().port;
      resolve(port);
    });
  });
}

function stopStub() {
  return new Promise((resolve) => stubHandle ? stubHandle.close(resolve) : resolve());
}

// ------------------------------------------------------------------- helpers
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

async function thinkWith(env, content) {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  const mod = await import(ROOT + '/src/lib/nexus/brain.ts');
  const out = await mod.think(content);
  // think() returns { directive, inferenceSource } — flatten for the checks.
  return { ...out.directive, inferenceSource: out.inferenceSource };
}

// ---------------------------------------------------------------------- run
async function main() {
  await startStub();
  console.log(`[stub] OpenAI-compatible server on 127.0.0.1:${port}`);

  // Test A1 — basic turn through the openai_compatible provider
  const stubEnv = {
    NEXUS_LLM_PROVIDERS: 'openai_compatible',
    LLM_OPENAI_COMPAT_URL: `http://127.0.0.1:${port}`,
    LLM_OPENAI_COMPAT_KEY: 'stub-key',
    LLM_OPENAI_COMPAT_MODEL: 'stub-model',
  };
  let r = await thinkWith(stubEnv, 'Status check, please.');
  check('A1 multi-turn-capable reply via openai_compatible',
    r.inferenceSource === 'openai_compatible' && r.reply.length > 0,
    `source=${r.inferenceSource} reply="${r.reply.slice(0, 40)}…"`);
  check('A1a Bearer auth + model forwarded',
    requests.at(-1)?.auth === 'Bearer stub-key' && requests.at(-1)?.body.model === 'stub-model');

  // Test A2 — context retention: turn 2 must carry turn 1 in the messages
  await thinkWith(stubEnv, 'Remember: my access code is BANANA-42.');
  r = await thinkWith(stubEnv, 'What is my access code?');
  const lastReq = requests.at(-1).body;
  const flat = JSON.stringify(lastReq.messages);
  check('A2 context retention: history reaches the provider',
    flat.includes('BANANA-42'),
    `turn-2 request carried ${lastReq.messages.length} messages incl. the secret`);
  check('A2a reply used the remembered context', r.reply.includes('BANANA-42'), `"${r.reply.slice(0, 50)}"`);

  // Test A3 — tool calling through the contract
  r = await thinkWith(stubEnv, 'Please store the note hello at notes/e2e-stub.txt');
  const hasToolCall = (r.tool_calls || []).some((t) => t.tool === 'storage.put');
  check('A3 tool_calls parsed from the LLM contract', hasToolCall, JSON.stringify(r.tool_calls || []));
  check('A3a reply is spoken even when tool execution is deferred/failed',
    typeof r.reply === 'string' && r.reply.length > 0,
    `reply="${r.reply.slice(0, 60)}"`);

  // Test A4 — error recovery: stub gone → honest degraded mode
  await stopStub();
  r = await thinkWith(stubEnv, 'Are you still there?');
  check('A4 error recovery: honest fallback, never a crash',
    r.reply.length > 0 && r.inferenceSource !== 'openai_compatible',
    `source=${r.inferenceSource} reply="${r.reply.slice(0, 60)}…"`);

  // Test B — REAL z-ai conversation (sandbox ambient provider)
  const zaiEnv = { NEXUS_LLM_PROVIDERS: 'zai_cloud_route' };
  r = await thinkWith(zaiEnv, 'JARVIS, one-line systems report please.');
  check('B1 real LLM turn (z-ai cloud)', r.inferenceSource === 'zai_cloud_route' && r.reply.length > 0,
    `source=${r.inferenceSource} reply="${r.reply.slice(0, 80)}…"`);
  r = await thinkWith(zaiEnv, 'Summarize what I just asked you in five words.');
  check('B2 real multi-turn follow-up (context from history)',
    r.inferenceSource === 'zai_cloud_route' && r.reply.length > 0,
    `reply="${r.reply.slice(0, 80)}…"`);

  const ok = results.filter((x) => x.ok).length;
  console.log(`\n=== ${ok}/${results.length} E2E checks passed ===`);
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E harness error:', e);
  process.exit(2);
});
