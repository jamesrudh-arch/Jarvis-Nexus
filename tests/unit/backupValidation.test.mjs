import test from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_SCHEMA_VERSION, backupHash, validateBackupPayload } from '../../src/lib/nexus/backupSchema.ts';

function validPayload() {
  return {
    schema_version: BACKUP_SCHEMA_VERSION,
    generated_at: '2026-11-13T00:00:00.000Z',
    secrets_policy: {},
    tables: {
      nexus_world_state: [{
        id: 1, ownerName: 'Owner', firstLaunchCompleted: true,
        activeMode: 'wake_auth', currentZone: 'central_operations',
        posX: 1.45, posZ: 0.95, yawRad: -0.42,
        locomotionState: 'idle_console_work', posture: 'focused_standing',
        emotionalState: 'attentive', activeActivitySummary: 'x',
        interruptedTaskStackJson: '[]', activeCameraPreset: 'living_presence',
        reducedMotion: false,
      }],
      owner_switch: [{ switchKey: 'master', label: 'Master', enabled: true, description: 'd', enforcementScope: 's' }],
      memory_record: [],
      conversation: [],
      conversation_message: [],
      goal_record: [],
      scenario_definition: [],
      specialist_agent: [],
      security_audit_event: [],
    },
  };
}

test('backupValidation: valid payload passes and counts', () => {
  const r = validateBackupPayload(validPayload());
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.counts.owner_switch, 1);
  assert.equal(r.counts.memory_record, 0);
});

test('backupValidation: rejects non-object payloads', () => {
  for (const bad of [null, [], 'string', 42]) {
    const r = validateBackupPayload(bad);
    assert.equal(r.ok, false);
  }
});

test('backupValidation: rejects wrong schema_version', () => {
  const p = validPayload();
  p.schema_version = 999;
  assert.equal(validateBackupPayload(p).ok, false);
});

test('backupValidation: rejects unknown tables', () => {
  const p = validPayload();
  p.tables.hostile_table = [{ x: 1 }];
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('unknown table: hostile_table')));
});

test('backupValidation: rejects unknown fields', () => {
  const p = validPayload();
  p.tables.owner_switch[0].evil_field = 'drop tables';
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("unknown field 'evil_field'")));
});

test('backupValidation: rejects missing required fields', () => {
  const p = validPayload();
  delete p.tables.owner_switch[0].enabled;
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("missing required field 'enabled'")));
});

test('backupValidation: rejects wrong types', () => {
  const p = validPayload();
  p.tables.owner_switch[0].enabled = 'yes'; // string instead of boolean
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('expected boolean')));
  const p2 = validPayload();
  p2.tables.nexus_world_state[0].posX = 'east';
  assert.ok(validateBackupPayload(p2).errors.some((e) => e.includes('expected number')));
});

test('backupValidation: rejects NaN numbers', () => {
  const p = validPayload();
  p.tables.nexus_world_state[0].posX = Number.NaN;
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('expected number')));
});

test('backupValidation: rejects missing tables', () => {
  const p = validPayload();
  delete p.tables.security_audit_event;
  const r = validateBackupPayload(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('missing table: security_audit_event')));
});

test('backupValidation: rejects array-as-table and non-array rows', () => {
  const p = validPayload();
  p.tables.memory_record = 'not-an-array';
  assert.ok(validateBackupPayload(p).errors.some((e) => e.includes('must be an array')));
  const p2 = validPayload();
  p2.tables.memory_record = ['not-an-object'];
  assert.ok(validateBackupPayload(p2).errors.some((e) => e.includes('must be an object')));
});

test('backupHash: stable and content-sensitive', () => {
  const a = validPayload();
  const b = validPayload();
  assert.equal(backupHash(a), backupHash(b));
  b.tables.owner_switch[0].enabled = false;
  assert.notEqual(backupHash(a), backupHash(b));
});
