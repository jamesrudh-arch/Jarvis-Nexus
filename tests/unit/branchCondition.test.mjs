import test from 'node:test';
import assert from 'node:assert/strict';
import { evalBranchCondition } from '../../src/nexus/world/branchCondition.js';

test('catch-all: empty and otherwise match everything', () => {
  assert.equal(evalBranchCondition('', {}), true);
  assert.equal(evalBranchCondition(null, {}), true);
  assert.equal(evalBranchCondition(undefined, {}), true);
  assert.equal(evalBranchCondition('otherwise', {}), true);
});

test('all six comparison operators, incl. negative and decimal literals', () => {
  const vars = { p: 100, t: 45.5, n: -3 };
  assert.equal(evalBranchCondition('p <= 1450', vars), true);
  assert.equal(evalBranchCondition('p >= 185', vars), false);
  assert.equal(evalBranchCondition('p == 100', vars), true);
  assert.equal(evalBranchCondition('p != 100', vars), false);
  assert.equal(evalBranchCondition('t < 46', vars), true);
  assert.equal(evalBranchCondition('t > 46', vars), false);
  assert.equal(evalBranchCondition('n < 0', vars), true);
  assert.equal(evalBranchCondition('n <= -3', vars), true);
});

test('B3 regression: the seed conditions that used to silently fail on `and`', () => {
  // seed.ts cryo_manifold_forensic rupture branch
  const cond = 'line_pressure_mpa >= 185 and relief_valve_ms > 70';
  assert.equal(evalBranchCondition(cond, { line_pressure_mpa: 210, relief_valve_ms: 125 }), true);
  assert.equal(evalBranchCondition(cond, { line_pressure_mpa: 160, relief_valve_ms: 125 }), false);
  assert.equal(evalBranchCondition(cond, { line_pressure_mpa: 210, relief_valve_ms: 60 }), false);
  // seed.ts dual_turbine_sim
  assert.equal(evalBranchCondition('inlet_temp_k <= 1450', { inlet_temp_k: 1320 }), true);
  // seed.ts zerotrust_compute_flow
  assert.equal(evalBranchCondition('expose_public_port == 0', { expose_public_port: 0 }), true);
});

test('boolean operators: symbols and keywords, case-insensitive, with precedence', () => {
  const vars = { a: 1, b: 0, c: 3 };
  assert.equal(evalBranchCondition('a == 1 && b == 0', vars), true);
  assert.equal(evalBranchCondition('a == 1 and b == 1', vars), false);
  assert.equal(evalBranchCondition('a == 1 or b == 1', vars), true);
  assert.equal(evalBranchCondition('a == 2 OR b == 0', vars), true);
  // `and` binds tighter than `or`: (a==2 and b==0) or c==3 -> true via c
  assert.equal(evalBranchCondition('a == 2 and b == 0 or c == 3', vars), true);
  // parentheses flip the meaning: a==2 and (b==0 or c==3) -> false via a
  assert.equal(evalBranchCondition('a == 2 and (b == 0 or c == 3)', vars), false);
});

test('negation via not / !', () => {
  const vars = { a: 1 };
  assert.equal(evalBranchCondition('not (a == 2)', vars), true);
  assert.equal(evalBranchCondition('!(a == 1)', vars), false);
  assert.equal(evalBranchCondition('a != 2', vars), true);
});

test('fail-safe: unparseable or unknown variables never match', () => {
  const vars = { a: 1 };
  assert.equal(evalBranchCondition('this is not parseable', vars), false);
  assert.equal(evalBranchCondition('missing_var >= 1', vars), false);
  assert.equal(evalBranchCondition('a == 1 &&', vars), false);
  // empty still matches (catch-all semantics are reserved for it)
  assert.equal(evalBranchCondition('', vars), true);
});
