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
