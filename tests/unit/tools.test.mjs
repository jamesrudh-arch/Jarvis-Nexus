import test from 'node:test';
import assert from 'node:assert/strict';
// Node 24 native type-stripping loads the PURE tool contract (no runtime
// imports — safe for the typeless resolver).
import {
  composeToolReply,
  sanitizeStorageKey,
  coerceToolCalls,
  detectImplicitStorageTool,
  MAX_TOOL_CALLS_PER_TURN,
  TOOL_RULES,
} from '../../src/lib/nexus/toolContract.ts';

test('sanitizeStorageKey: accepts clean relative paths', () => {
  assert.equal(sanitizeStorageKey('notes/diagnostics-2026.txt'), 'notes/diagnostics-2026.txt');
  assert.equal(sanitizeStorageKey('  report.md  '), 'report.md');
  assert.equal(sanitizeStorageKey('a/b/c.bin'), 'a/b/c.bin');
  assert.equal(sanitizeStorageKey('file_with-dots.v2.json'), 'file_with-dots.v2.json');
});

test('sanitizeStorageKey: rejects traversal, absolute, empty, bad chars, overlong', () => {
  assert.equal(sanitizeStorageKey('../etc/passwd'), null);          // traversal
  assert.equal(sanitizeStorageKey('notes/../../secret'), null);      // nested traversal
  assert.equal(sanitizeStorageKey('/absolute/path'), null);           // leading slash
  assert.equal(sanitizeStorageKey('a\\b'), null);                     // backslash
  assert.equal(sanitizeStorageKey(''), null);                         // empty
  assert.equal(sanitizeStorageKey('   '), null);                      // whitespace only
  assert.equal(sanitizeStorageKey('a//b'), null);                     // empty segment
  assert.equal(sanitizeStorageKey('bad key!'), null);                 // illegal chars
  assert.equal(sanitizeStorageKey(`${'a'.repeat(129)}.txt`), null);   // > 128 chars
  assert.equal(sanitizeStorageKey(42), null);                         // non-string
  assert.equal(sanitizeStorageKey(null), null);                       // null
});

test('coerceToolCalls: keeps only known tools, caps per turn', () => {
  // unknown tool filtered
  assert.deepEqual(
    coerceToolCalls([{ tool: 'fs.format', args: {} }]),
    []
  );
  // known tools kept with args
  const kept = coerceToolCalls([
    { tool: 'storage.list', args: {} },
    { tool: 'storage.get', args: { key: 'notes/a.txt' } },
  ]);
  assert.equal(kept.length, 2);
  assert.equal(kept[0].tool, 'storage.list');
  assert.equal(kept[1].args.key, 'notes/a.txt');
  // cap enforced
  const flooded = Array.from({ length: 10 }, (_, i) => ({ tool: 'storage.list', args: { i } }));
  assert.equal(coerceToolCalls(flooded).length, MAX_TOOL_CALLS_PER_TURN);
  // non-array / garbage input tolerated
  assert.deepEqual(coerceToolCalls(undefined), []);
  assert.deepEqual(coerceToolCalls('nope'), []);
  assert.deepEqual(coerceToolCalls([null, 3, { tool: 5 }]), []);
  // args must be an object
  const weird = coerceToolCalls([{ tool: 'storage.list', args: 'not-an-object' }]);
  assert.deepEqual(weird[0].args, {});
});

test('TOOL_RULES: catalog documents every known tool', () => {
  for (const name of ['storage.put', 'storage.get', 'storage.list', 'storage.delete', 'kaggle.datasets']) {
    assert.ok(TOOL_RULES.includes(name), `TOOL_RULES missing ${name}`);
  }
});

test('detectImplicitStorageTool: delete/read/list intents with explicit keys', () => {
  const d = detectImplicitStorageTool('JARVIS, delete the note notes/e2e-agent-proof.txt, it was just a test.');
  assert.deepEqual(d, { tool: 'storage.delete', args: { key: 'notes/e2e-agent-proof.txt' } });

  const g = detectImplicitStorageTool('read back my note notes/todo.md');
  assert.deepEqual(g, { tool: 'storage.get', args: { key: 'notes/todo.md' } });

  const l = detectImplicitStorageTool('list the files in my storage');
  assert.deepEqual(l, { tool: 'storage.list', args: {} });

  // plain retrieve phrasing
  assert.equal(
    detectImplicitStorageTool('retrieve logs/session-2026.log').tool,
    'storage.delete' === 'x' ? '' : 'storage.get'
  );
});

test('detectImplicitStorageTool: ignores non-storage talk and URLs', () => {
  assert.equal(detectImplicitStorageTool('What is the weather tomorrow?'), null);
  assert.equal(detectImplicitStorageTool('delete my browser history'), null); // no key
  assert.equal(detectImplicitStorageTool('show me https://example.com/notes/a.txt'), null); // URL
  assert.equal(detectImplicitStorageTool('The manifold pressure is 4.2 bar.'), null);
  assert.equal(detectImplicitStorageTool(''), null);
  // delete verb + key-like token that fails sanitization is dropped
  assert.equal(detectImplicitStorageTool('remove ../etc/passwd'), null);
});

test('detectImplicitStorageTool: explicit kaggle search requests', () => {
  const k = detectImplicitStorageTool('JARVIS, search Kaggle for public datasets about turbine blade vibration.');
  assert.deepEqual(k, { tool: 'kaggle.datasets', args: { search: 'turbine blade vibration' } });

  const k2 = detectImplicitStorageTool('search kaggle for datasets about cryo manifold failure');
  assert.deepEqual(k2, { tool: 'kaggle.datasets', args: { search: 'cryo manifold failure' } });

  // non-kaggle searches are NOT forced
  assert.equal(detectImplicitStorageTool('search the web for turbine datasets'), null);
  assert.equal(detectImplicitStorageTool('find kaggle datasets'), null); // no topic → no forced call
});

test('detectImplicitStorageTool: store intent with explicit text after key', () => {
  const p = detectImplicitStorageTool('JARVIS, store this note in my cloud storage at notes/prod-proof.txt: Production storage verified.');
  assert.deepEqual(p, { tool: 'storage.put', args: { key: 'notes/prod-proof.txt', text: 'Production storage verified' } });

  const q = detectImplicitStorageTool('save this as logs/friday.md saying the manifold holds at 4.1 bar');
  assert.deepEqual(q, { tool: 'storage.put', args: { key: 'logs/friday.md', text: 'the manifold holds at 4.1 bar' } });

  // store verb + key but NO explicit text → ambiguous, not forced
  assert.equal(detectImplicitStorageTool('store something at notes/x.txt when you can'), null);
  // delete wins over store when both verbs appear
  const d = detectImplicitStorageTool('delete the stored file notes/old.txt: it was stored yesterday');
  assert.equal(d.tool, 'storage.delete');
});

test('composeToolReply: deterministic replies from actual results', () => {
  assert.equal(composeToolReply([]), '');
  const ok = composeToolReply([{ tool: 'storage.put', ok: true, detail: 'stored 60 bytes at notes/a.txt (readback verified)' }]);
  assert.equal(ok, 'Done, Boss. stored 60 bytes at notes/a.txt (readback verified).');
  const fail = composeToolReply([{ tool: 'storage.delete', ok: false, detail: 'no object at notes/b.txt (GET HTTP 400)' }]);
  assert.match(fail, /^Partially, Boss — delete failed — no object at notes\/b\.txt/);
  const mixed = composeToolReply([
    { tool: 'storage.put', ok: true, detail: 'stored 1 bytes' },
    { tool: 'kaggle.datasets', ok: false, detail: 'missing search term' },
  ]);
  assert.match(mixed, /^Partially, Boss — stored 1 bytes; kaggle\.datasets failed — missing search term\.$/);
});
