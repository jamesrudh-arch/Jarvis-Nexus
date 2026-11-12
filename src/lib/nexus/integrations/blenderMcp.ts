/**
 * JARVIS NEXUS → Blender MCP-style bridge client (CORE side).
 * Connects to blender/jarvis_blender/mcp_server.py (newline-delimited JSON
 * over TCP :9876, running inside Blender via the addon).
 */
import * as net from 'net';

export interface BlenderMcpStatus {
  configured: boolean;
  reachable: boolean;
  blenderVersion: string | null;
  detail: string;
}

export interface BlenderMcpResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export class BlenderMcpClient {
  private get host(): string {
    return process.env.BLENDER_MCP_HOST ?? '127.0.0.1';
  }
  private get port(): number {
    return Number(process.env.BLENDER_MCP_PORT ?? 9876);
  }

  async status(): Promise<BlenderMcpStatus> {
    const res = await this.call('ping', {}, 3000);
    if (res.ok) {
      const r = res.result as { blender?: string } | undefined;
      return {
        configured: true, reachable: true, blenderVersion: r?.blender ?? null,
        detail: `Blender bridge online (${r?.blender ?? 'unknown version'})`,
      };
    }
    return {
      configured: true, reachable: false, blenderVersion: null,
      detail: `Blender bridge unreachable at ${this.host}:${this.port} — start Blender with the JARVIS NEXUS Automation addon enabled (see blender/README.md). ${res.error ?? ''}`,
    };
  }

  /** Execute a whitelisted tool inside Blender. */
  call(tool: string, args: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<BlenderMcpResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let buffer = '';
      const finish = (r: BlenderMcpResult) => {
        socket.destroy();
        clearTimeout(timer);
        resolve(r);
      };
      const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
      socket.connect(this.port, this.host, () => {
        socket.write(JSON.stringify({ tool, args }) + '\n');
      });
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf-8');
        if (buffer.includes('\n')) {
          try {
            finish(JSON.parse(buffer.trim()));
          } catch {
            finish({ ok: false, error: 'invalid response' });
          }
        }
      });
      socket.on('error', (err) => finish({ ok: false, error: err.message }));
    });
  }
}
