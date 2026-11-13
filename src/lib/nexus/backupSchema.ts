/**
 * JARVIS NEXUS — database backup / restore (Phase 1, Part 14).
 *
 * Ports the hardened FastAPI CORE backup/restore semantics to the production
 * Next.js app:
 *   - secrets are EXCLUDED (none live in this database; policy stated anyway)
 *   - strict payload validation: unknown tables/fields rejected, types checked
 *   - hard payload size cap (4 MiB → 413)
 *   - dry-run mode validates without mutating
 *   - pre-restore safety backup taken automatically
 *   - transactional restore with delete-before-create in FK-safe order
 *   - verification: post-restore row counts must equal payload counts
 *
 * The pure `validateBackupPayload` is unit-testable without a database.
 */
import { createHash } from 'node:crypto';

export const BACKUP_SCHEMA_VERSION = 1;
export const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

type FieldType = 'string' | 'boolean' | 'number';

interface TableSpec {
  idField?: string;
  fields: Record<string, FieldType>;
  optional?: Record<string, FieldType>;
  /** Restore order index (children after parents). */
  order: number;
}

export const BACKUP_TABLES: Record<string, TableSpec> = {
  nexus_world_state: {
    order: 1,
    fields: {
      id: 'number', ownerName: 'string', firstLaunchCompleted: 'boolean',
      activeMode: 'string', currentZone: 'string', posX: 'number', posZ: 'number',
      yawRad: 'number', locomotionState: 'string', posture: 'string',
      emotionalState: 'string', activeActivitySummary: 'string',
      interruptedTaskStackJson: 'string', activeCameraPreset: 'string',
      reducedMotion: 'boolean',
    },
    optional: { updatedAt: 'string' },
  },
  owner_switch: {
    order: 2, idField: 'switchKey',
    fields: {
      switchKey: 'string', label: 'string', enabled: 'boolean',
      description: 'string', enforcementScope: 'string',
    },
    optional: { updatedAt: 'string' },
  },
  memory_record: {
    order: 3, idField: 'id',
    fields: {
      id: 'string', category: 'string', epistemicStatus: 'string', title: 'string',
      content: 'string', isSensitive: 'boolean', confidence: 'number',
    },
    optional: { sourceRef: 'string', projectTag: 'string', createdAt: 'string', updatedAt: 'string' },
  },
  conversation: {
    order: 4, idField: 'id',
    fields: { id: 'string', title: 'string' },
    optional: { createdAt: 'string', updatedAt: 'string' },
  },
  conversation_message: {
    order: 5, idField: 'id',
    fields: {
      id: 'string', conversationId: 'string', role: 'string', content: 'string',
    },
    optional: {
      modality: 'string', mediaRef: 'string', interrupted: 'boolean',
      inferenceSource: 'string', emotionalTone: 'string', targetZone: 'string',
      createdAt: 'string',
    },
  },
  goal_record: {
    order: 6, idField: 'id',
    fields: { id: 'string', title: 'string', description: 'string' },
    optional: {
      priority: 'number', status: 'string', progress: 'number', dependsOnJson: 'string',
      scheduleSpec: 'string', assignedZone: 'string', autonomousAllowed: 'boolean',
      nextAction: 'string', createdAt: 'string', updatedAt: 'string',
    },
  },
  scenario_definition: {
    order: 7, idField: 'id',
    fields: { id: 'string', title: 'string', classification: 'string', summary: 'string' },
    optional: {
      durationSec: 'number', variablesJson: 'string', branchesJson: 'string',
      timelineJson: 'string', actorsPropsJson: 'string', evidenceNotesJson: 'string',
      createdAt: 'string',
    },
  },
  specialist_agent: {
    order: 8, idField: 'id',
    fields: { id: 'string', name: 'string', roleSummary: 'string', permissionBoundary: 'string' },
    optional: {
      allowedToolsJson: 'string', status: 'string', currentTask: 'string',
      lastOutput: 'string', updatedAt: 'string',
    },
  },
  security_audit_event: {
    order: 9, idField: 'id',
    fields: { id: 'string', category: 'string', message: 'string' },
    optional: { severity: 'string', source: 'string', resolved: 'boolean', createdAt: 'string' },
  },
};

export const TABLE_ORDER = Object.entries(BACKUP_TABLES)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([name]) => name);

export interface BackupPayload {
  schema_version: number;
  generated_at: string;
  secrets_policy: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  counts: Record<string, number>;
}

function checkType(value: unknown, expected: FieldType, label: string, errors: string[]): void {
  const t = typeof value;
  if (expected === 'number' ? t !== 'number' || !Number.isFinite(value as number) : t !== expected) {
    errors.push(`${label}: expected ${expected}, got ${t}`);
  }
}

/** Strict validation of a restore payload. Pure — unit-testable. */
export function validateBackupPayload(payload: unknown): ValidationResult {
  const errors: string[] = [];
  const counts: Record<string, number> = {};
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['payload must be a JSON object'], counts };
  }
  const p = payload as Record<string, unknown>;
  if (p.schema_version !== BACKUP_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${BACKUP_SCHEMA_VERSION}`);
  }
  if (typeof p.generated_at !== 'string' || !p.generated_at) {
    errors.push('generated_at must be a non-empty string');
  }
  if (p.tables === null || typeof p.tables !== 'object' || Array.isArray(p.tables)) {
    return { ok: false, errors: [...errors, 'tables must be an object'], counts };
  }
  const tables = p.tables as Record<string, unknown>;
  for (const name of Object.keys(tables)) {
    if (!BACKUP_TABLES[name]) {
      errors.push(`unknown table: ${name}`);
      continue;
    }
    const rows = tables[name];
    if (!Array.isArray(rows)) {
      errors.push(`tables.${name} must be an array`);
      continue;
    }
    counts[name] = rows.length;
    const spec = BACKUP_TABLES[name];
    rows.forEach((row, i) => {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) {
        errors.push(`tables.${name}[${i}] must be an object`);
        return;
      }
      const r = row as Record<string, unknown>;
      for (const key of Object.keys(r)) {
        if (!(key in spec.fields) && !(key in (spec.optional ?? {}))) {
          errors.push(`tables.${name}[${i}]: unknown field '${key}'`);
        }
      }
      for (const [field, type] of Object.entries(spec.fields)) {
        if (!(field in r)) {
          errors.push(`tables.${name}[${i}]: missing required field '${field}'`);
        } else {
          checkType(r[field], type, `tables.${name}[${i}].${field}`, errors);
        }
      }
      for (const [field, type] of Object.entries(spec.optional ?? {})) {
        if (field in r && r[field] !== null) {
          checkType(r[field], type, `tables.${name}[${i}].${field}`, errors);
        }
      }
    });
  }
  for (const name of TABLE_ORDER) {
    if (!(name in tables)) errors.push(`missing table: ${name}`);
  }
  return { ok: errors.length === 0, errors, counts };
}

/** Stable content hash for a payload (used by the separate-copy verification). */
export function backupHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}
