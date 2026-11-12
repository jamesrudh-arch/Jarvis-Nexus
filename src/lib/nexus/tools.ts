/**
 * JARVIS NEXUS — Tool execution registry (server-side only).
 *
 * Real tool calls proposed by the brain's directive (`tool_calls`) are
 * executed HERE against live services — never simulated. Each tool returns
 * an honest result the voice layer speaks back to the owner. The pure
 * contract (validation + coercion + catalog text) lives in ./toolContract
 * so it is unit-testable without network or bundler resolution.
 */
import { SupabaseClient } from './integrations/supabase';
import { KaggleResourceManager } from './integrations/kaggle';
import {
  sanitizeStorageKey,
  TOOL_MAX_TEXT_BYTES,
  TOOL_GET_PREVIEW_BYTES,
  type ToolCall,
  type ToolResult,
} from './toolContract';

export {
  sanitizeStorageKey,
  coerceToolCalls,
  detectImplicitStorageTool,
  composeToolReply,
  MAX_TOOL_CALLS_PER_TURN,
  TOOL_MAX_TEXT_BYTES,
  TOOL_GET_PREVIEW_BYTES,
  TOOL_RULES,
} from './toolContract';
export type { ToolCall, ToolResult } from './toolContract';

const supabase = new SupabaseClient();
const kaggle = new KaggleResourceManager();

/** Execute one tool call against the real service. Never throws. */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case 'storage.put': {
        const key = sanitizeStorageKey(call.args.key);
        const text = call.args.text;
        if (!key) return { tool: call.tool, ok: false, detail: 'invalid key (relative path, letters/digits/._-/ only, ≤128 chars)' };
        if (typeof text !== 'string' || !text.trim()) {
          return { tool: call.tool, ok: false, detail: 'missing or empty text' };
        }
        if (new TextEncoder().encode(text).byteLength > TOOL_MAX_TEXT_BYTES) {
          return { tool: call.tool, ok: false, detail: `text exceeds ${TOOL_MAX_TEXT_BYTES} byte cap` };
        }
        const res = await supabase.putObject(key, text, 'text/plain; charset=utf-8');
        return {
          tool: call.tool,
          ok: res.ok && res.verified,
          detail: res.ok
            ? (res.verified
              ? `stored ${res.bytes} bytes at ${key} (readback verified)`
              : `stored ${res.bytes} bytes at ${key} but readback could not be verified`)
            : `storage write failed: ${res.detail}`,
        };
      }
      case 'storage.get': {
        const key = sanitizeStorageKey(call.args.key);
        if (!key) return { tool: call.tool, ok: false, detail: 'invalid key' };
        const res = await supabase.getObject(key);
        if (!res.ok || res.data === null) {
          return { tool: call.tool, ok: false, detail: `no object at ${key} (${res.detail})` };
        }
        const text = new TextDecoder().decode(res.data.slice(0, TOOL_GET_PREVIEW_BYTES));
        return {
          tool: call.tool,
          ok: true,
          detail: `retrieved ${res.data.byteLength} bytes from ${key}`,
          data: { key, bytes: res.data.byteLength, text },
        };
      }
      case 'storage.list': {
        const [objs, usage] = await Promise.all([
          supabase.listObjects('', 100),
          supabase.usageEstimateBytes(),
        ]);
        if (objs === null) return { tool: call.tool, ok: false, detail: 'storage listing failed (not configured or unreachable)' };
        return {
          tool: call.tool,
          ok: true,
          detail: `${objs.length} object(s), ~${((usage ?? 0) / 1024).toFixed(1)} KiB used of 1 GiB free tier`,
          data: { objects: objs.slice(0, 50), usageBytes: usage },
        };
      }
      case 'storage.delete': {
        const key = sanitizeStorageKey(call.args.key);
        if (!key) return { tool: call.tool, ok: false, detail: 'invalid key' };
        // Honesty guard (session 7): Supabase deletes are idempotent — a
        // missing object ALSO answers success. Verify existence via a prefix
        // listing (no body download) so the spoken result can never claim a
        // deletion that deleted nothing. A failed/unconfigured listing (null)
        // falls through to the actual delete, which reports its own error.
        const listing = await supabase.listObjects(key, 100);
        if (Array.isArray(listing) && !listing.some((o) => o.name === key)) {
          return {
            tool: call.tool,
            ok: false,
            detail: `not found: ${key} (nothing was deleted — it was already gone)`,
          };
        }
        const res = await supabase.deleteObject(key);
        return { tool: call.tool, ok: res.ok, detail: res.ok ? `deleted ${key}` : `delete failed: ${res.detail}` };
      }
      case 'kaggle.datasets': {
        const search = call.args.search;
        if (typeof search !== 'string' || !search.trim()) {
          return { tool: call.tool, ok: false, detail: 'missing search term' };
        }
        const datasets = await kaggle.discoverDatasets(search.trim().slice(0, 80), 5);
        return {
          tool: call.tool,
          ok: true,
          detail: `${datasets.length} public dataset(s) for "${search.trim().slice(0, 40)}"`,
          data: { datasets },
        };
      }
      default:
        return { tool: call.tool, ok: false, detail: 'unknown tool' };
    }
  } catch (err) {
    return { tool: call.tool, ok: false, detail: `tool error: ${(err as Error).message}` };
  }
}
