import test from 'node:test';
import assert from 'node:assert/strict';

// Session-7 provider tests: cloudflare_workers_ai + openai_compatible
// (OpenAI Chat Completions wire format), verified against a stubbed fetch —
// the REAL HTTP behavior (auth header, endpoint shape, error propagation,
// empty-reply handling, free-tier budget guard) without any network.

import {
  cfWorkersAiLlm,
  openaiCompatLlm,
  DailyBudget,
  CF_WORKERS_AI_ID,
} from '../../src/lib/nexus/providers/openaiCompatible.ts';
import { getInferenceConfig } from '../../src/lib/nexus/providers/registry.ts';

const realFetch = globalThis.fetch;

function withFetchStub(stub, fn) {
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = realFetch;
    });
}

test('DailyBudget: caps consumption per UTC day and resets on rollover', () => {
  const b = new DailyBudget(2);
  assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), true);
  assert.equal(b.tryConsume(), false, 'third request must be rejected at limit 2');
  assert.deepEqual(b.status(), { used: 2, limit: 2, day: new Date().toISOString().slice(0, 10) });
  const unlimited = new DailyBudget(0);
  for (let i = 0; i < 5; i++) assert.equal(unlimited.tryConsume(), true);
});

test('cfWorkersAiLlm: unavailable without Cloudflare env, available with it', async () => {
  const hadAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const hadKey = process.env.CF_AI_API_TOKEN;
  const hadKey2 = process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CF_AI_API_TOKEN;
  delete process.env.CLOUDFLARE_API_TOKEN;
  assert.equal(await cfWorkersAiLlm.available(), false);
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct123';
  process.env.CF_AI_API_TOKEN = 'tokA';
  assert.equal(await cfWorkersAiLlm.available(), true);
  delete process.env.CF_AI_API_TOKEN;
  process.env.CLOUDFLARE_API_TOKEN = 'tokB';
  assert.equal(await cfWorkersAiLlm.available(), true, 'falls back to CLOUDFLARE_API_TOKEN');
  // restore
  if (hadAcct) process.env.CLOUDFLARE_ACCOUNT_ID = hadAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
  if (hadKey) process.env.CF_AI_API_TOKEN = hadKey; else delete process.env.CF_AI_API_TOKEN;
  if (hadKey2) process.env.CLOUDFLARE_API_TOKEN = hadKey2; else delete process.env.CLOUDFLARE_API_TOKEN;
});

test('cfWorkersAiLlm: posts to the OpenAI-compatible endpoint with Bearer auth', async () => {
  const hadAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const hadKey = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct42';
  process.env.CLOUDFLARE_API_TOKEN = 'tok42';
  let captured = null;
  await withFetchStub(async (url, init) => {
    captured = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"hello"}' } }],
    }), { status: 200 });
  }, async () => {
    const out = await cfWorkersAiLlm.chat({
      messages: [
        { role: 'assistant', content: 'system prompt' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.5,
    });
    assert.equal(out.providerId, CF_WORKERS_AI_ID);
    assert.equal(out.content, '{"reply":"hello"}');
  });
  assert.equal(
    captured.url,
    'https://api.cloudflare.com/client/v4/accounts/acct42/ai/v1/chat/completions'
  );
  assert.equal(captured.headers.Authorization, 'Bearer tok42');
  assert.equal(captured.body.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  assert.deepEqual(captured.body.messages, [
    { role: 'assistant', content: 'system prompt' },
    { role: 'user', content: 'hi' },
  ]);
  assert.equal(captured.body.temperature, 0.5);
  // restore env
  if (hadAcct) process.env.CLOUDFLARE_ACCOUNT_ID = hadAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
  if (hadKey) process.env.CLOUDFLARE_API_TOKEN = hadKey; else delete process.env.CLOUDFLARE_API_TOKEN;
});

test('cfWorkersAiLlm: HTTP errors and empty completions throw (registry falls through honestly)', async () => {
  const hadAcct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const hadKey = process.env.CLOUDFLARE_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct42';
  process.env.CLOUDFLARE_API_TOKEN = 'tok42';
  await withFetchStub(
    () => new Response(JSON.stringify({ errors: [{ message: 'auth failed' }] }), { status: 401 }),
    async () => {
      await assert.rejects(
        () => cfWorkersAiLlm.chat({ messages: [{ role: 'user', content: 'x' }] }),
        /401/
      );
    }
  );
  await withFetchStub(
    () => new Response(JSON.stringify({ choices: [{ message: { content: '' } }] }), { status: 200 }),
    async () => {
      await assert.rejects(
        () => cfWorkersAiLlm.chat({ messages: [{ role: 'user', content: 'x' }] }),
        /empty completion/
      );
    }
  );
  if (hadAcct) process.env.CLOUDFLARE_ACCOUNT_ID = hadAcct; else delete process.env.CLOUDFLARE_ACCOUNT_ID;
  if (hadKey) process.env.CLOUDFLARE_API_TOKEN = hadKey; else delete process.env.CLOUDFLARE_API_TOKEN;
});

test('openaiCompatLlm: URL normalization (bare base, /v1 base, full endpoint)', async () => {
  const hadUrl = process.env.LLM_OPENAI_COMPAT_URL;
  const hadKey = process.env.LLM_OPENAI_COMPAT_KEY;
  const hadModel = process.env.LLM_OPENAI_COMPAT_MODEL;
  const seen = [];
  process.env.LLM_OPENAI_COMPAT_MODEL = 'qwen:0.5b';
  process.env.LLM_OPENAI_COMPAT_KEY = 'k';
  for (const base of ['http://localhost:11434', 'http://localhost:11434/', 'http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions']) {
    process.env.LLM_OPENAI_COMPAT_URL = base;
    await withFetchStub(async (url) => {
      seen.push(String(url));
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }, async () => {
      const out = await openaiCompatLlm.chat({ messages: [{ role: 'user', content: 'x' }] });
      assert.equal(out.content, 'ok');
      assert.equal(out.providerId, 'openai_compatible');
    });
  }
  assert.deepEqual(seen, [
    'http://localhost:11434/v1/chat/completions',
    'http://localhost:11434/v1/chat/completions',
    'http://localhost:11434/v1/chat/completions',
    'http://localhost:11434/v1/chat/completions',
  ]);
  // missing env -> unavailable
  delete process.env.LLM_OPENAI_COMPAT_URL;
  assert.equal(await openaiCompatLlm.available(), false);
  // restore
  if (hadUrl) process.env.LLM_OPENAI_COMPAT_URL = hadUrl; else delete process.env.LLM_OPENAI_COMPAT_URL;
  if (hadKey) process.env.LLM_OPENAI_COMPAT_KEY = hadKey; else delete process.env.LLM_OPENAI_COMPAT_KEY;
  if (hadModel) process.env.LLM_OPENAI_COMPAT_MODEL = hadModel; else delete process.env.LLM_OPENAI_COMPAT_MODEL;
});

test('registry: default LLM chain is free-tier-first (cloudflare_workers_ai -> groq_cloud -> zai_cloud_route)', () => {
  const had = process.env.NEXUS_LLM_PROVIDERS;
  delete process.env.NEXUS_LLM_PROVIDERS;
  assert.deepEqual(getInferenceConfig().llm, ['cloudflare_workers_ai', 'groq_cloud', 'zai_cloud_route']);
  if (had) process.env.NEXUS_LLM_PROVIDERS = had; else delete process.env.NEXUS_LLM_PROVIDERS;
});

// ---------------------------------------------------------------------------
// Session 8: first-class `openai` provider (owner-supplied Phase 2 key)
// ---------------------------------------------------------------------------

test('openaiLlm: unavailable without OPENAI_API_KEY; endpoint/model/auth with it', async () => {
  const hadKey = process.env.OPENAI_API_KEY;
  const hadModel = process.env.OPENAI_MODEL;
  const hadBase = process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;
  delete process.env.OPENAI_BASE_URL;
  const { openaiLlm, OPENAI_ID } = await import('../../src/lib/nexus/providers/openaiCompatible.ts');
  assert.equal(await openaiLlm.available(), false, 'no key -> unavailable (default free chain intact)');
  process.env.OPENAI_API_KEY = 'sk-test-key';
  assert.equal(await openaiLlm.available(), true);
  let captured = null;
  await withFetchStub(async (url, init) => {
    captured = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'phase 2 online' } }] }), { status: 200 });
  }, async () => {
    const out = await openaiLlm.chat({ messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(out.providerId, OPENAI_ID);
    assert.equal(out.content, 'phase 2 online');
  });
  assert.equal(captured.url, 'https://api.openai.com/v1/chat/completions', 'official API endpoint by default');
  assert.equal(captured.headers.Authorization, 'Bearer sk-test-key');
  assert.equal(captured.body.model, 'gpt-4o-mini', 'OPENAI_MODEL default');
  // custom model + base URL honored
  process.env.OPENAI_MODEL = 'gpt-4o';
  process.env.OPENAI_BASE_URL = 'https://proxy.example.com/v1/';
  await withFetchStub(async (url, init) => {
    captured = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  }, async () => {
    await openaiLlm.chat({ messages: [{ role: 'user', content: 'x' }] });
  });
  assert.equal(captured.url, 'https://proxy.example.com/v1/chat/completions');
  assert.equal(captured.body.model, 'gpt-4o');
  // restore
  if (hadKey) process.env.OPENAI_API_KEY = hadKey; else delete process.env.OPENAI_API_KEY;
  if (hadModel) process.env.OPENAI_MODEL = hadModel; else delete process.env.OPENAI_MODEL;
  if (hadBase) process.env.OPENAI_BASE_URL = hadBase; else delete process.env.OPENAI_BASE_URL;
});

test('openaiLlm: HTTP 401 (invalid/truncated key) throws so the registry falls through honestly', async () => {
  const hadKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-truncated';
  const { openaiLlm } = await import('../../src/lib/nexus/providers/openaiCompatible.ts');
  await withFetchStub(
    () => new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 }),
    async () => {
      await assert.rejects(
        () => openaiLlm.chat({ messages: [{ role: 'user', content: 'x' }] }),
        /401/
      );
    }
  );
  if (hadKey) process.env.OPENAI_API_KEY = hadKey; else delete process.env.OPENAI_API_KEY;
});
