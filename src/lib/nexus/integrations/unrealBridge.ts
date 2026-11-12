/**
 * JARVIS NEXUS → Unreal Engine 5 bridge client (CORE side).
 *
 * Sends whitelisted JSON commands to the in-editor HTTP bridge
 * (unreal/Python/jarvis_http_bridge.py, port 8765). The bridge must run on
 * the owner's UE workstation — see unreal/README.md for exact bring-up.
 */
export interface UnrealBridgeResult {
  ok: boolean;
  status: number;
  detail: string;
}

export interface UnrealBridgeStatus {
  configured: boolean;
  reachable: boolean;
  engineVersion: string | null;
  detail: string;
}

type BridgeCommand =
  | 'ping' | 'get_state' | 'load_level' | 'spawn_character' | 'play_animation'
  | 'set_camera' | 'set_light' | 'capture_frame' | 'list_assets';

export class UnrealBridgeClient {
  private get url(): string | null {
    const base = process.env.UNREAL_BRIDGE_URL; // e.g. http://192.168.1.20:8765
    return base ? base.replace(/\/+$/, '') : null;
  }

  async status(): Promise<UnrealBridgeStatus> {
    const base = this.url;
    if (!base) {
      return {
        configured: false, reachable: false, engineVersion: null,
        detail: 'UNREAL_BRIDGE_URL not configured — set it to the UE workstation address once unreal/Python/jarvis_http_bridge.py is running (see unreal/README.md).',
      };
    }
    const res = await this.command('ping', {}, 4000);
    return {
      configured: true,
      reachable: res.ok,
      engineVersion: res.ok ? res.detail || null : null,
      detail: res.ok ? `Bridge online — Unreal Engine ${res.detail}` : `Bridge unreachable at ${base} (${res.detail})`,
    };
  }

  /** Execute a whitelisted command on the engine. */
  async command(
    cmd: BridgeCommand,
    args: Record<string, unknown> = {},
    timeoutMs = 15_000
  ): Promise<UnrealBridgeResult> {
    const base = this.url;
    if (!base) return { ok: false, status: 0, detail: 'UNREAL_BRIDGE_URL not configured' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/jarvis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd, args }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const detail = typeof data.engine === 'string'
        ? String(data.engine)
        : typeof data.error === 'string' ? String(data.error) : JSON.stringify(data).slice(0, 200);
      return { ok: res.ok, status: res.status, detail };
    } catch (err) {
      return { ok: false, status: 0, detail: (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message };
    } finally {
      clearTimeout(timer);
    }
  }
}
