import test from 'node:test';
import assert from 'node:assert/strict';
// Node 24 native type-stripping loads the TS registry (top-level imports there
// are type-only, so they are erased at runtime — no bundler needed).
import { parseProviderChain } from '../../src/lib/nexus/providers/registry.ts';

test('parseProviderChain: env chain parsing with fallbacks', () => {
  // unset / empty -> fallback chain
  assert.deepEqual(parseProviderChain(undefined, ['zai_cloud_route']), ['zai_cloud_route']);
  assert.deepEqual(parseProviderChain('', ['zai_cloud_route']), ['zai_cloud_route']);
  assert.deepEqual(parseProviderChain('   ', ['zai_cloud_route']), ['zai_cloud_route']);

  // single + multi provider chains, whitespace tolerant
  assert.deepEqual(parseProviderChain('ollama_local', ['zai_cloud_route']), ['ollama_local']);
  assert.deepEqual(parseProviderChain(' ollama_local , zai_cloud_route ', ['zai_cloud_route']), [
    'ollama_local',
    'zai_cloud_route',
  ]);

  // fallback array is copied, not aliased (callers can't mutate the default)
  const fallback = ['zai_cloud_route'];
  const chain = parseProviderChain('', fallback);
  chain.push('mutant');
  assert.deepEqual(fallback, ['zai_cloud_route']);
});

test('D6 registry: free-tier-first default LLM chain (session-8 merge: cloudflare_workers_ai -> groq_cloud -> zai_cloud_route)', async () => {
  // The default LLM chain must start with providers whose credentials can
  // genuinely exist on Railway and are genuinely free. cloudflare_workers_ai
  // (Workers AI 10k Neurons/day, owner credentials already in production env)
  // leads; groq_cloud (free gsk_ keys, no card) is the second hop;
  // zai_cloud_route stays as the sandbox-ambient last hop.
  const mod = await import('../../src/lib/nexus/providers/registry.ts');
  const cfg = mod.getInferenceConfig();
  assert.equal(cfg.llm[0], 'cloudflare_workers_ai', 'cloudflare_workers_ai must be the first default LLM provider');
  assert.equal(cfg.llm[1], 'groq_cloud', 'groq_cloud is the second free hop');
  assert.ok(cfg.llm.includes('zai_cloud_route'), 'zai_cloud_route remains in the chain');
  assert.ok(cfg.asr.includes('groq_cloud'), 'groq_cloud ASR (whisper) is in the ASR chain');

  // NEXUS_LLM_PROVIDERS still overrides the default order completely.
  const before = process.env.NEXUS_LLM_PROVIDERS;
  process.env.NEXUS_LLM_PROVIDERS = 'zai_cloud_route';
  try {
    assert.deepEqual(mod.getInferenceConfig().llm, ['zai_cloud_route']);
  } finally {
    if (before === undefined) delete process.env.NEXUS_LLM_PROVIDERS;
    else process.env.NEXUS_LLM_PROVIDERS = before;
  }
});

test('groqCloud provider: unavailable without GROQ_API_KEY, available with it', async () => {
  const { groqLlm } = await import('../../src/lib/nexus/providers/groqCloud.ts');
  const before = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    assert.equal(await groqLlm.available(), false, 'no key -> unavailable (chain falls through honestly)');
  } finally {
    if (before !== undefined) process.env.GROQ_API_KEY = before;
  }
  process.env.GROQ_API_KEY = 'gsk_test_key';
  try {
    assert.equal(await groqLlm.available(), true);
    await assert.rejects(
      () => groqLlm.chat({ messages: [{ role: 'user', content: 'hi' }] }),
      /Groq chat HTTP/,
      'with a fake key the real API call must throw (honest error -> chain falls through)'
    );
  } finally {
    if (before === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = before;
  }
});
