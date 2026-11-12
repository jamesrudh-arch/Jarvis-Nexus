/**
 * JARVIS NEXUS — Tool contract (PURE module: no imports, no side effects).
 *
 * Everything here is importable by both the Next.js bundler (via '../tools')
 * and Node's native type-stripping test runner (tests/unit/tools.test.mjs).
 */

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  detail: string;
  data?: unknown;
}

export const MAX_TOOL_CALLS_PER_TURN = 2;
export const TOOL_MAX_TEXT_BYTES = 64 * 1024;
export const TOOL_GET_PREVIEW_BYTES = 16 * 1024;

const KNOWN_TOOLS = new Set([
  'storage.put', 'storage.get', 'storage.list', 'storage.delete', 'kaggle.datasets',
]);

/**
 * Sanitize a storage key: relative path segments [A-Za-z0-9._-], no `..`,
 * no leading `/`, ≤ 128 chars total, no empty segments. Returns null when
 * the key is unusable.
 */
export function sanitizeStorageKey(key: unknown): string | null {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (trimmed.startsWith('/') || trimmed.includes('\\')) return null;
  if (trimmed.includes('..')) return null;
  const segments = trimmed.split('/');
  if (segments.some((s) => !s || /[^A-Za-z0-9._-]/.test(s))) return null;
  return segments.join('/');
}

/** Coerce raw LLM output into ≤ MAX_TOOL_CALLS_PER_TURN known tool calls. */
export function coerceToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const tool = String((item as Record<string, unknown>).tool ?? '');
    if (!KNOWN_TOOLS.has(tool)) continue;
    const args = (item as Record<string, unknown>).args;
    out.push({
      tool,
      args: args && typeof args === 'object' && !Array.isArray(args)
        ? (args as Record<string, unknown>)
        : {},
    });
    if (out.length >= MAX_TOOL_CALLS_PER_TURN) break;
  }
  return out;
}

/** Prompt text describing the tool catalog for the directive contract. */
export const TOOL_RULES = `TOOL EXECUTION — you may request REAL operations. Include an optional "tool_calls" array (max ${MAX_TOOL_CALLS_PER_TURN} per turn), each { "tool": name, "args": {...} }. The server executes them against live services and the ACTUAL results are spoken back to the owner in your reply. Available tools:
- storage.put {key, text} — permanently store a text note/file in the owner's private cloud storage (Supabase). key is a relative path like "notes/diagnostics-2026.txt".
- storage.get {key} — retrieve stored text.
- storage.list {} — list stored files + storage usage.
- storage.delete {key} — delete a stored file (only when the owner asks).
- kaggle.datasets {search} — search public Kaggle datasets (real discovery).
MANDATORY: whenever the owner asks to store/save/keep, retrieve/read back, list, or delete a file or note, ALWAYS emit the matching tool call THIS turn — NEVER claim an action happened without its tool result. Quoting dialogue history is not retrieval; say nothing is deleted until storage.delete actually returns ok.`;

// ── Deterministic honesty guard ────────────────────────────────────────
// The LLM occasionally CLAIMS storage actions without emitting the tool
// call (observed live 2026-11-13: "the note has been deleted" with the
// object still present). For unambiguous verbs + an explicit key, the
// server force-executes the real operation — the spoken reply is then
// generated from the ACTUAL result.

const KEY_RE = /\b(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:txt|md|json|csv|log|yaml|yml|pdf|png|jpg|jpeg|bin|dat)\b/;
const DELETE_VERBS = /\b(delet\w*|remov\w*|erase\w*|destroy\w*)\b/i;
const GET_VERBS = /\b(retriev\w*|read\b|read back|fetch\w*|open\w*|show me|what('| i)?s in|contents? of)\b/i;
const LIST_VERBS = /\b(list|inventory|what files|which files|how many files)\b/i;
const PUT_VERBS = /\b(store|save|keep|put|record|write|file)\b/i;

/**
 * Deterministic spoken reply built from ACTUAL tool results — used when the
 * speak-back LLM turn is unavailable (e.g. production without an LLM
 * provider credential). Templates only real outcomes; never fabricates.
 */
export function composeToolReply(results: ToolResult[]): string {
  if (results.length === 0) return '';
  const parts = results.map((r) =>
    r.ok ? r.detail : `${r.tool.replace('storage.', '')} failed — ${r.detail}`);
  const allOk = results.every((r) => r.ok);
  const joined = parts.join('; ');
  return allOk
    ? `Done, Boss. ${joined}.`
    : `Partially, Boss — ${joined}.`;
}

/**
 * Detect an unambiguous storage operation the owner explicitly requested
 * (verb + file key, or a plain listing request), or an explicit Kaggle
 * dataset search. Returns null when nothing should be force-executed.
 * Pure — unit tested in tools.test.mjs.
 */
export function detectImplicitStorageTool(content: string): ToolCall | null {
  const text = content.trim();
  if (!text || text.length > 500) return null;
  if (/https?:\/\//i.test(text)) return null; // URLs are not storage keys
  // Explicit Kaggle dataset search: "search kaggle for datasets about X"
  if (/\b(search|find|look\s*up)\b/i.test(text) && /\bkaggle\b/i.test(text) && /\bdatasets?\b/i.test(text)) {
    const about = text.match(/\babout\s+(.+?)\s*[.?!]*$/i)
      ?? text.match(/\bfor\s+(?:public\s+)?datasets?\s+about\s+(.+?)\s*[.?!]*$/i);
    const topic = (about?.[1] ?? '').replace(/["']/g, '').trim();
    if (topic && topic.length >= 3 && topic.length <= 80) {
      return { tool: 'kaggle.datasets', args: { search: topic } };
    }
    return null;
  }
  if (LIST_VERBS.test(text) && /\b(files?|storage|notes?|objects?)\b/i.test(text)) {
    return { tool: 'storage.list', args: {} };
  }
  const keyMatch = text.match(KEY_RE);
  if (!keyMatch) return null;
  const key = sanitizeStorageKey(keyMatch[0]);
  if (!key) return null;
  if (DELETE_VERBS.test(text)) return { tool: 'storage.delete', args: { key } };
  if (GET_VERBS.test(text)) return { tool: 'storage.get', args: { key } };
  // Store intent: "store/save … at <key>: <text>" — requires explicit text
  // after the key so nothing ambiguous is force-written.
  if (PUT_VERBS.test(text)) {
    const after = text.slice((keyMatch.index ?? 0) + keyMatch[0].length);
    const textMatch = after.match(/^\s*(?::|saying|with|containing|-)\s*(.+?)\s*\.?\s*$/i);
    const body = (textMatch?.[1] ?? '').trim();
    if (body) return { tool: 'storage.put', args: { key, text: body } };
  }
  return null;
}
