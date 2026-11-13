/**
 * JARVIS NEXUS — owner-switch enforcement gates (Phase 1, Part 13).
 *
 * The seven switches are BACKEND-ENFORCED permissions, not UI hints. This
 * module centralises their enforcement for the production Next.js app and
 * mirrors the FastAPI CORE semantics established in Gate 0:
 *
 *   master        OFF → all privileged routes denied except the control plane
 *                      (health, switches, owner-key verification) — the
 *                      carve-out exists so the owner can always switch the
 *                      system back on (an unrecoverable lockout would
 *                      otherwise make master OFF a denial-of-service against
 *                      the owner). Cascade: microphone + camera released,
 *                      running agent work paused, scenario playback paused,
 *                      world state to standby. (FastAPI main.py equivalent.)
 *   microphone    OFF → no audio capture (asr, voice-modality send)
 *   camera        OFF → no video capture (vision-modality send)
 *   autonomy      OFF → direct owner requests only (no self-initiated work)
 *   remote_compute OFF → no remote worker dispatch (no dispatch queue exists
 *                      in this app yet — enforcement point wired when it does)
 *   computer_control OFF → no tool execution
 *   embodiment    OFF → no embodiment-specific world modes
 *
 * microphone and camera default OFF on every fresh database (seed) and on
 * every restart (persisted state), per Part 13.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export type SwitchMap = Record<string, boolean>;

export const SEVEN_SWITCH_KEYS = [
  'master',
  'microphone',
  'camera',
  'autonomy',
  'remote_compute',
  'computer_control',
  'embodiment',
] as const;

/** Modes that require the embodiment switch (mirrors the FastAPI CORE set). */
export const EMBODIMENT_MODES = new Set(['digital_human_embodiment', 'holographic_presence']);

export async function getSwitchMap(): Promise<SwitchMap> {
  const rows = await db.ownerSwitch.findMany();
  return Object.fromEntries(rows.map((s) => [s.switchKey, s.enabled]));
}

/**
 * Pure gate evaluation — unit-testable without a database.
 * Returns a denial reason string or null when allowed.
 */
export function evaluateSwitchGate(map: SwitchMap, key: string): string | null {
  const on = map[key];
  if (on === undefined) return `Unknown switch: ${key}`;
  if (!on) {
    const labels: Record<string, string> = {
      master: 'Master switch is OFF. Only health, switch control and owner verification remain available.',
      microphone: 'Microphone switch is OFF. Audio capture is disabled.',
      camera: 'Camera switch is OFF. Video capture is disabled.',
      autonomy: 'Autonomy switch is OFF. Only direct owner requests are permitted.',
      remote_compute: 'Remote Compute switch is OFF. Remote workers are disabled.',
      computer_control: 'Computer Control switch is OFF. Tool execution is disabled.',
      embodiment: 'Embodiment switch is OFF. JARVIS has no body in the world.',
    };
    return labels[key] ?? `Switch ${key} is OFF.`;
  }
  return null;
}

/** Route-helper: 403 response when the switch is OFF, else null. */
export function requireSwitchOn(map: SwitchMap, key: string): NextResponse | null {
  const reason = evaluateSwitchGate(map, key);
  if (!reason) return null;
  return NextResponse.json(
    { detail: reason, switch: key, switch_enabled: false },
    { status: 403, headers: { 'X-Switch-Required': key } },
  );
}

/**
 * Master-OFF cascade (mirrors the FastAPI CORE effects):
 *   - microphone and camera switches forced OFF (capture released)
 *   - running specialist agents paused
 *   - active scenario playback paused
 *   - world state to standby posture
 * Returns the effects list for the audit event.
 */
export async function applyMasterOffCascade(): Promise<string[]> {
  const effects: string[] = [];
  for (const key of ['microphone', 'camera']) {
    const sw = await db.ownerSwitch.findUnique({ where: { switchKey: key } });
    if (sw?.enabled) {
      await db.ownerSwitch.update({ where: { switchKey: key }, data: { enabled: false } });
      effects.push(`${key}_released`);
    }
  }
  const pausedAgents = await db.specialistAgent.updateMany({
    where: { status: 'running' },
    data: { status: 'paused', currentTask: 'Master Power OFF — paused.' },
  });
  if (pausedAgents.count > 0) effects.push(`paused_agent_runs:${pausedAgents.count}`);

  const state = await db.nexusWorldState.findUnique({ where: { id: 1 } });
  if (state) {
    let interrupted: unknown[] = [];
    try {
      interrupted = JSON.parse(state.interruptedTaskStackJson || '[]');
    } catch {
      interrupted = [];
    }
    await db.nexusWorldState.update({
      where: { id: 1 },
      data: {
        locomotionState: 'idle_attentive',
        posture: 'standby',
        emotionalState: 'neutral',
        activeActivitySummary: 'Master Power OFF — Standby (all capture and execution halted).',
        interruptedTaskStackJson: JSON.stringify(interrupted),
        activeCameraPreset: 'living_presence',
      },
    });
    effects.push('world_state_standby');
  }
  return effects;
}
