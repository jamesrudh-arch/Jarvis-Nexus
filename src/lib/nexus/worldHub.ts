/**
 * JARVIS NEXUS CORE — World State Orchestrator (ported from reference world_hub.py).
 * Maintains the authoritative living JARVIS embodiment state, interruption/resumption
 * stack, active scenario runtime, and idempotent database seeding.
 */
import { db } from '@/lib/db';
import {
  DEFAULT_SWITCHES,
  OPERATIONAL_MODES,
  SEED_AGENTS,
  SEED_GOALS,
  SEED_MEMORIES,
  SEED_SCENARIOS,
  SPATIAL_ZONES,
} from './seed';

// Module-level live runtimes (single-owner deployment)
declare global {
  var __nexusScenarioRuntime: ScenarioRuntime | null;
  var __nexusVideoRuntime: VideoRuntime;
  var __nexusBootTime: number;
}

export interface ScenarioRuntime {
  scenario_id: string;
  title: string;
  classification: string;
  variables: Record<string, number>;
  playing: boolean;
  current_time: number;
  playback_rate: number;
}

export interface VideoRuntime {
  media_id: string;
  playing: boolean;
  current_time: number;
  extracted_3d_twin: boolean;
}

export function scenarioRuntime(): ScenarioRuntime | null {
  return globalThis.__nexusScenarioRuntime ?? null;
}
export function setScenarioRuntime(rt: ScenarioRuntime | null) {
  globalThis.__nexusScenarioRuntime = rt;
}
export function videoRuntime(): VideoRuntime {
  if (!globalThis.__nexusVideoRuntime) {
    globalThis.__nexusVideoRuntime = {
      media_id: 'media-turbine-bench-01',
      playing: false,
      current_time: 14.2,
      extracted_3d_twin: false,
    };
  }
  return globalThis.__nexusVideoRuntime;
}
export function bootTime(): number {
  if (!globalThis.__nexusBootTime) globalThis.__nexusBootTime = Date.now();
  return globalThis.__nexusBootTime;
}

/** Idempotently initialize world state, switches, memories, goals, agents, and scenarios. */
export async function ensureSeed(): Promise<void> {
  // Session 8 (residents): production's persistent /data/custom.db predates the
  // residentsJson column. SQLite ALTER TABLE ADD COLUMN is cheap and safe; the
  // try/catch makes this idempotent ("duplicate column" on fresh DBs).
  try {
    await db.$executeRawUnsafe(
      'ALTER TABLE "NexusWorldState" ADD COLUMN "residentsJson" TEXT'
    );
  } catch {
    /* column already exists (or the DB is already current) — expected */
  }

  const existing = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  if (!existing) {
    await db.nexusWorldState.create({ data: { id: 1 } });
  }

  const switches = await db.ownerSwitch.count();
  if (switches === 0) {
    await db.ownerSwitch.createMany({ data: DEFAULT_SWITCHES });
  }

  if ((await db.memoryRecord.count()) === 0) {
    await db.memoryRecord.createMany({ data: SEED_MEMORIES });
  }

  if ((await db.goalRecord.count()) === 0) {
    for (const g of SEED_GOALS) {
      await db.goalRecord.create({
        data: {
          id: g.id,
          title: g.title,
          description: g.description,
          priority: g.priority,
          status: g.status,
          progress: g.progress,
          dependsOnJson: JSON.stringify(g.dependsOn),
          scheduleSpec: g.scheduleSpec,
          assignedZone: g.assignedZone,
          nextAction: g.nextAction,
        },
      });
    }
  }

  if ((await db.specialistAgent.count()) === 0) {
    for (const a of SEED_AGENTS) {
      await db.specialistAgent.create({
        data: {
          id: a.id,
          name: a.name,
          roleSummary: a.roleSummary,
          allowedToolsJson: JSON.stringify(a.allowedTools),
          permissionBoundary: a.permissionBoundary,
          status: a.status,
        },
      });
    }
  }

  const existingScenarios = new Set(
    (await db.scenarioDefinition.findMany({ select: { id: true } })).map((s) => s.id)
  );
  for (const sc of SEED_SCENARIOS) {
    if (!existingScenarios.has(sc.id)) {
      await db.scenarioDefinition.create({
        data: {
          id: sc.id,
          title: sc.title,
          classification: sc.classification,
          summary: sc.summary,
          durationSec: sc.durationSec,
          variablesJson: JSON.stringify(sc.variables),
          branchesJson: JSON.stringify(sc.branches),
          timelineJson: JSON.stringify(sc.timeline),
          actorsPropsJson: JSON.stringify(sc.actorsProps),
          evidenceNotesJson: JSON.stringify(sc.evidenceNotes),
        },
      });
    }
  }

  if ((await db.securityAuditEvent.count()) === 0) {
    await db.securityAuditEvent.create({
      data: {
        severity: 'info',
        category: 'boot_integrity',
        message:
          'CORE initialized; microphone and camera switches verified OFF by default; zero public ports exposed.',
        source: 'SecurityMonitor',
        resolved: true,
      },
    });
  }
}

export async function serializeWorld() {
  await ensureSeed();
  const state = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  const switches = await db.ownerSwitch.findMany();
  let stack: unknown[] = [];
  try {
    stack = JSON.parse(state?.interruptedTaskStackJson || '[]');
  } catch {
    stack = [];
  }
  return {
    owner_name: state?.ownerName ?? 'Owner',
    first_launch_completed: state?.firstLaunchCompleted ?? false,
    active_mode: state?.activeMode ?? 'living_presence',
    current_zone: state?.currentZone ?? 'central_operations',
    position: {
      x: state?.posX ?? 1.45,
      y: 0,
      z: state?.posZ ?? 0.95,
      yaw: state?.yawRad ?? -0.42,
    },
    locomotion_state: state?.locomotionState ?? 'idle_console_work',
    posture: state?.posture ?? 'focused_standing',
    emotional_state: state?.emotionalState ?? 'attentive',
    active_activity_summary: state?.activeActivitySummary ?? '',
    interrupted_task_stack: stack,
    active_camera_preset: state?.activeCameraPreset ?? 'living_presence',
    reduced_motion: state?.reducedMotion ?? false,
    // living residents (directive s4): base roster + persisted positions
    residents: serializeResidents(state?.residentsJson),
    switches: Object.fromEntries(switches.map((s) => [s.switchKey, s.enabled])),
    active_scenario: scenarioRuntime(),
    active_video: videoRuntime(),
    connected_devices: [{ device_type: 'pc_sanctuary', connected_at: new Date().toISOString() }],
    zones: SPATIAL_ZONES,
    modes: OPERATIONAL_MODES,
  };
}

/** Resident roster shared with the client (src/nexus/world/ResidentDirector.js).
 *  Positions/activities persist in residentsJson; the roster itself is
 *  versioned in code (adding a resident = code change + persisted state
 *  merges by id). */
export const RESIDENTS = [
  { id: 'echo',   name: 'Echo',   role: 'Archivist',     hue: 0.55, home: [6.5, -3.2],  pace: 0.85 },
  { id: 'vector', name: 'Vector', role: 'Analyst',       hue: 0.08, home: [-6.8, 2.4],  pace: 1.15 },
  { id: 'mira',   name: 'Mira',   role: 'Cartographer',  hue: 0.78, home: [3.8, 5.6],   pace: 0.95 },
  { id: 'delta',  name: 'Delta',  role: 'Sentinel',      hue: 0.42, home: [-4.6, -5.8], pace: 0.70 },
] as const;

function serializeResidents(json: string | null | undefined) {
  let saved: Array<{ id: string; x?: number; z?: number; yaw?: number; activity?: string }> = [];
  try {
    saved = JSON.parse(json || '[]');
  } catch {
    saved = [];
  }
  const byId = new Map(saved.map((r) => [r.id, r]));
  return RESIDENTS.map((spec) => {
    const s = byId.get(spec.id);
    return {
      ...spec,
      x: Number.isFinite(s?.x) ? s!.x : spec.home[0],
      z: Number.isFinite(s?.z) ? s!.z : spec.home[1],
      yaw: Number.isFinite(s?.yaw) ? s!.yaw : 0,
      activity: s?.activity || 'observing',
    };
  });
}

/** Persist the residents' live state (client PATCHes periodically + on unload). */
export async function persistResidents(
  list: Array<{ id: string; x: number; z: number; yaw: number; activity: string }>
): Promise<{ ok: boolean; stored: number }> {
  const valid = list.filter((r) =>
    typeof r?.id === 'string' && Number.isFinite(r.x) && Number.isFinite(r.z)
  );
  await db.nexusWorldState.update({
    where: { id: 1 },
    data: { residentsJson: JSON.stringify(valid) },
  });
  return { ok: true, stored: valid.length };
}

export interface MoveOptions {
  zone_id: string;
  activity: string;
  emotional_state?: string;
  urgent?: boolean;
  mode_override?: string | null;
  camera_override?: string | null;
}

export async function commandMoveToZone(opts: MoveOptions) {
  await ensureSeed();
  const zone = SPATIAL_ZONES[opts.zone_id] ?? SPATIAL_ZONES.central_operations;
  const state = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  if (!state) throw new Error('World state missing');

  const dist = Math.hypot(zone.x - state.posX, zone.z - state.posZ);
  const loco =
    opts.urgent && dist > 2.2 ? 'running' : dist > 0.35 ? 'walking' : 'idle_console_work';

  await db.nexusWorldState.update({
    where: { id: 1 },
    data: {
      currentZone: zone.id,
      posX: zone.x,
      posZ: zone.z,
      yawRad: zone.yaw,
      locomotionState: loco,
      posture: opts.urgent ? 'urgent_stance' : 'console_interaction',
      emotionalState: opts.emotional_state ?? 'focused',
      activeActivitySummary: opts.activity,
      ...(opts.mode_override ? { activeMode: opts.mode_override } : {}),
      activeCameraPreset: opts.camera_override ?? zone.camera_preset,
    },
  });
  return serializeWorld();
}

export async function interruptForOwner(reason = 'Owner addressed JARVIS') {
  await ensureSeed();
  const state = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  if (!state) throw new Error('World state missing');

  let stack: Array<Record<string, unknown>> = [];
  try {
    stack = JSON.parse(state.interruptedTaskStackJson || '[]');
  } catch {
    stack = [];
  }

  if (state.activeActivitySummary && !state.activeActivitySummary.startsWith('Attending to Owner')) {
    stack.push({
      zone: state.currentZone,
      mode: state.activeMode,
      activity: state.activeActivitySummary,
      posture: state.posture,
      emotional_state: state.emotionalState,
      camera: state.activeCameraPreset,
      saved_at: new Date().toISOString(),
    });
    stack = stack.slice(-5);
  }

  await db.nexusWorldState.update({
    where: { id: 1 },
    data: {
      interruptedTaskStackJson: JSON.stringify(stack),
      locomotionState: 'acknowledge_turn',
      posture: 'conversational_focus',
      emotionalState: 'listening',
      activeActivitySummary: `Attending to Owner (${reason})`,
      activeCameraPreset: 'conversation',
    },
  });
  return serializeWorld();
}

export async function resumeInterruptedWork() {
  await ensureSeed();
  const state = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  if (!state) throw new Error('World state missing');

  let stack: Array<Record<string, unknown>> = [];
  try {
    stack = JSON.parse(state.interruptedTaskStackJson || '[]');
  } catch {
    stack = [];
  }

  if (stack.length === 0) {
    return commandMoveToZone({
      zone_id: 'central_operations',
      activity: 'Reviewing primary systems assembly at Central Operations.',
      emotional_state: 'focused',
      mode_override: 'living_presence',
    });
  }

  const prior = stack.pop()!;
  await db.nexusWorldState.update({
    where: { id: 1 },
    data: { interruptedTaskStackJson: JSON.stringify(stack) },
  });
  return commandMoveToZone({
    zone_id: (prior.zone as string) ?? 'central_operations',
    activity: (prior.activity as string) ?? 'Resuming authorised work.',
    emotional_state: (prior.emotional_state as string) ?? 'focused',
    mode_override: (prior.mode as string) ?? 'living_presence',
    camera_override: (prior.camera as string) ?? null,
  });
}

export async function getPrimaryConversation() {
  await ensureSeed();
  let conv = await db.conversation.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!conv) {
    conv = await db.conversation.create({ data: { title: 'Primary Sanctuary Session' } });
  }
  return conv;
}
