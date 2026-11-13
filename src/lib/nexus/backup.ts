/**
 * JARVIS NEXUS — database backup export / atomic restore (Phase 1, Part 14).
 * Pure payload validation and table specs live in backupSchema.ts
 * (dependency-free, unit-testable with node --test); this module adds the
 * Prisma-backed export and the transactional restore.
 */
import { db } from '@/lib/db';
import { BACKUP_SCHEMA_VERSION, BACKUP_TABLES, TABLE_ORDER, type BackupPayload } from './backupSchema';

export * from './backupSchema';

/** Export the live database as a backup payload (secrets excluded by policy). */
export async function exportBackup(): Promise<BackupPayload> {
  const [states, switches, memories, conversations, messages, goals, scenarios, agents, audit] =
    await Promise.all([
      db.nexusWorldState.findMany(),
      db.ownerSwitch.findMany(),
      db.memoryRecord.findMany(),
      db.conversation.findMany(),
      db.conversationMessage.findMany({ orderBy: { createdAt: 'asc' } }),
      db.goalRecord.findMany(),
      db.scenarioDefinition.findMany(),
      db.specialistAgent.findMany(),
      db.securityAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
  const payload: BackupPayload = {
    schema_version: BACKUP_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    secrets_policy: {
      policy: 'excluded (never stored in this database, never exported)',
      statement: 'The application database contains no credentials; OWNER_KEY and provider keys live only in server environment variables.',
    },
    tables: {
      nexus_world_state: states.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() })),
      owner_switch: switches.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() })),
      memory_record: memories.map((m) => ({
        ...m,
        content: m.isSensitive ? '[REDACTED_SENSITIVE]' : m.content,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      conversation: conversations.map((c) => ({
        id: c.id, title: c.title, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
      })),
      conversation_message: messages.map((m) => ({
        id: m.id, conversationId: m.conversationId, role: m.role,
        modality: m.modality, content: m.content, interrupted: m.interrupted,
        inferenceSource: m.inferenceSource, emotionalTone: m.emotionalTone,
        targetZone: m.targetZone, createdAt: m.createdAt.toISOString(),
      })),
      goal_record: goals.map((g) => ({
        ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString(),
      })),
      scenario_definition: scenarios.map((s) => ({ ...s, createdAt: s.createdAt.toISOString() })),
      specialist_agent: agents.map((a) => ({ ...a, updatedAt: a.updatedAt.toISOString() })),
      security_audit_event: audit.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    },
  };
  return payload;
}

/** Restore a validated payload ATOMICALLY. Deletes + creates + count
 *  verification run inside one interactive transaction; any failure rolls
 *  back everything (FK-safe order: children deleted first, parents created first). */
export async function restoreBackup(payload: BackupPayload): Promise<Record<string, number>> {
  const restored: Record<string, number> = {};
  await db.$transaction(async (tx) => {
    await tx.conversationMessage.deleteMany();
    await tx.conversation.deleteMany();
    await tx.memoryRecord.deleteMany();
    await tx.goalRecord.deleteMany();
    await tx.scenarioDefinition.deleteMany();
    await tx.specialistAgent.deleteMany();
    await tx.securityAuditEvent.deleteMany();
    await tx.ownerSwitch.deleteMany();
    await tx.nexusWorldState.deleteMany();

    for (const name of TABLE_ORDER) {
      const rows = (payload.tables[name] ?? []) as Record<string, unknown>[];
      switch (name) {
        case 'nexus_world_state':
          if (rows.length) await tx.nexusWorldState.createMany({
            data: rows.map((r) => ({
              id: Number(r.id), ownerName: String(r.ownerName),
              firstLaunchCompleted: Boolean(r.firstLaunchCompleted),
              activeMode: String(r.activeMode), currentZone: String(r.currentZone),
              posX: Number(r.posX), posZ: Number(r.posZ), yawRad: Number(r.yawRad),
              locomotionState: String(r.locomotionState), posture: String(r.posture),
              emotionalState: String(r.emotionalState),
              activeActivitySummary: String(r.activeActivitySummary),
              interruptedTaskStackJson: String(r.interruptedTaskStackJson ?? '[]'),
              activeCameraPreset: String(r.activeCameraPreset),
              reducedMotion: Boolean(r.reducedMotion),
            })),
          });
          break;
        case 'owner_switch':
          await tx.ownerSwitch.createMany({
            data: rows.map((r) => ({
              switchKey: String(r.switchKey), label: String(r.label),
              enabled: Boolean(r.enabled), description: String(r.description),
              enforcementScope: String(r.enforcementScope),
            })),
          });
          break;
        case 'memory_record':
          await tx.memoryRecord.createMany({
            data: rows.map((r) => ({
              id: String(r.id), category: String(r.category),
              epistemicStatus: String(r.epistemicStatus ?? 'owner_stated'),
              title: String(r.title), content: String(r.content),
              isSensitive: Boolean(r.isSensitive), confidence: Number(r.confidence ?? 1.0),
              sourceRef: r.sourceRef ? String(r.sourceRef) : null,
              projectTag: r.projectTag ? String(r.projectTag) : null,
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
        case 'conversation':
          await tx.conversation.createMany({
            data: rows.map((r) => ({
              id: String(r.id), title: String(r.title ?? 'Primary Sanctuary Session'),
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
        case 'conversation_message':
          await tx.conversationMessage.createMany({
            data: rows.map((r) => ({
              id: String(r.id), conversationId: String(r.conversationId),
              role: String(r.role), modality: String(r.modality ?? 'text'),
              content: String(r.content), interrupted: Boolean(r.interrupted ?? false),
              inferenceSource: String(r.inferenceSource ?? 'nexus_cloud_route'),
              emotionalTone: String(r.emotionalTone ?? 'attentive'),
              targetZone: r.targetZone ? String(r.targetZone) : null,
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
        case 'goal_record':
          await tx.goalRecord.createMany({
            data: rows.map((r) => ({
              id: String(r.id), title: String(r.title), description: String(r.description),
              priority: Number(r.priority ?? 2), status: String(r.status ?? 'active'),
              progress: Number(r.progress ?? 0), dependsOnJson: String(r.dependsOnJson ?? '[]'),
              scheduleSpec: String(r.scheduleSpec ?? 'continuous'),
              assignedZone: String(r.assignedZone ?? 'goals_projects'),
              autonomousAllowed: Boolean(r.autonomousAllowed ?? true),
              nextAction: String(r.nextAction ?? ''),
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
        case 'scenario_definition':
          await tx.scenarioDefinition.createMany({
            data: rows.map((r) => ({
              id: String(r.id), title: String(r.title),
              classification: String(r.classification), summary: String(r.summary),
              durationSec: Number(r.durationSec ?? 18.0),
              variablesJson: String(r.variablesJson ?? '[]'),
              branchesJson: String(r.branchesJson ?? '[]'),
              timelineJson: String(r.timelineJson ?? '[]'),
              actorsPropsJson: String(r.actorsPropsJson ?? '{}'),
              evidenceNotesJson: String(r.evidenceNotesJson ?? '[]'),
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
        case 'specialist_agent':
          await tx.specialistAgent.createMany({
            data: rows.map((r) => ({
              id: String(r.id), name: String(r.name), roleSummary: String(r.roleSummary),
              allowedToolsJson: String(r.allowedToolsJson ?? '[]'),
              permissionBoundary: String(r.permissionBoundary),
              status: String(r.status ?? 'idle'),
              currentTask: r.currentTask ? String(r.currentTask) : null,
              lastOutput: r.lastOutput ? String(r.lastOutput) : null,
            })),
          });
          break;
        case 'security_audit_event':
          await tx.securityAuditEvent.createMany({
            data: rows.map((r) => ({
              id: String(r.id), severity: String(r.severity ?? 'info'),
              category: String(r.category), message: String(r.message),
              source: String(r.source ?? 'CORE'), resolved: Boolean(r.resolved ?? true),
              createdAt: r.createdAt ? new Date(String(r.createdAt)) : new Date(),
            })),
          });
          break;
      }
      restored[name] = rows.length;
    }

    // In-transaction verification: live counts must equal payload counts,
    // otherwise the whole restore rolls back.
    const liveCounts = {
      nexus_world_state: await tx.nexusWorldState.count(),
      owner_switch: await tx.ownerSwitch.count(),
      memory_record: await tx.memoryRecord.count(),
      conversation: await tx.conversation.count(),
      conversation_message: await tx.conversationMessage.count(),
      goal_record: await tx.goalRecord.count(),
      scenario_definition: await tx.scenarioDefinition.count(),
      specialist_agent: await tx.specialistAgent.count(),
      security_audit_event: await tx.securityAuditEvent.count(),
    };
    for (const [table, expected] of Object.entries(restored)) {
      if (liveCounts[table as keyof typeof liveCounts] !== expected) {
        throw new Error(
          `restore verification failed: ${table} expected ${expected}, live ${liveCounts[table as keyof typeof liveCounts]} — rolling back`,
        );
      }
    }
  });
  return restored;
}
