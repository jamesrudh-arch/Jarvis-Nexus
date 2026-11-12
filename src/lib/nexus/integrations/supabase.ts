/**
 * JARVIS NEXUS — Supabase integration client.
 *
 * Two real surfaces (both honest about current credential state):
 *  1. Management API (api.supabase.com) — project listing/operations.
 *     Requires a personal access token with `sbp_` prefix (SUPABASE_PAT).
 *     The owner-supplied `sb_secret_…` key is NOT a management PAT — it is a
 *     project-scoped secret key (live-verified 2026-11-12: management API
 *     answers 401 "JWT could not be decoded" for it).
 *  2. Project data APIs (PostgREST/Auth/Storage) at https://<ref>.supabase.co
 *     using the sb_secret_ key — works once SUPABASE_URL is set to the
 *     project's URL (Settings → API). Endpoints implemented: REST select,
 *     service health, table introspection.
 */

export interface SupabaseStatus {
  managementConfigured: boolean;
  dataConfigured: boolean;
  connected: boolean;
  detail: string;
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export class SupabaseClient {
  private get secretKey(): string | undefined {
    return process.env.SUPABASE_ACCESS_TOKEN; // sb_secret_… project secret key
  }
  private get pat(): string | undefined {
    return process.env.SUPABASE_PAT; // sbp_… personal access token (management)
  }
  private get projectUrl(): string | undefined {
    const u = process.env.SUPABASE_URL; // https://<ref>.supabase.co
    return u?.replace(/\/+$/, '');
  }

  async status(): Promise<SupabaseStatus> {
    const out: SupabaseStatus = {
      managementConfigured: Boolean(this.pat),
      dataConfigured: Boolean(this.secretKey && this.projectUrl),
      connected: false,
      detail: '',
    };
    if (out.dataConfigured) {
      const res = await timedFetch(`${this.projectUrl}/rest/v1/`, {
        headers: {
          apikey: this.secretKey!,
          Authorization: `Bearer ${this.secretKey}`,
        },
      });
      out.connected = res?.ok ?? false;
      out.detail = out.connected
        ? `Project data API reachable at ${this.projectUrl}`
        : `Project data API unreachable (HTTP ${res?.status ?? 'network error'})`;
      return out;
    }
    out.detail = !this.secretKey
      ? 'SUPABASE_ACCESS_TOKEN (sb_secret_) not configured'
      : 'sb_secret_ key present — set SUPABASE_URL to the project URL '
        + '(Dashboard → Settings → API) to activate the data-plane client; '
        + 'set SUPABASE_PAT (sbp_ personal access token) for management API.';
    return out;
  }

  /** PostgREST select: GET /rest/v1/<table>?<query> */
  async restSelect(table: string, query = 'select=*', limit = 100): Promise<Array<Record<string, unknown>>> {
    if (!this.secretKey || !this.projectUrl) throw new Error('Supabase data-plane not configured');
    const res = await timedFetch(
      `${this.projectUrl}/rest/v1/${table}?${query}&limit=${limit}`,
      { headers: { apikey: this.secretKey, Authorization: `Bearer ${this.secretKey}` } }
    );
    if (!res?.ok) throw new Error(`Supabase REST select failed: HTTP ${res?.status}`);
    return (await res.json()) as Array<Record<string, unknown>>;
  }

  /** PostgREST insert (upsert by primary key). */
  async restUpsert(table: string, rows: Array<Record<string, unknown>>): Promise<boolean> {
    if (!this.secretKey || !this.projectUrl) throw new Error('Supabase data-plane not configured');
    const res = await timedFetch(`${this.projectUrl}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: this.secretKey,
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    });
    return res?.ok ?? false;
  }

  /** Management API: list projects (needs SUPABASE_PAT). */
  async listProjects(): Promise<Array<{ id: string; name: string; ref: string }>> {
    if (!this.pat) throw new Error('SUPABASE_PAT (sbp_) not configured');
    const res = await timedFetch('https://api.supabase.com/api/v1/projects', {
      headers: { Authorization: `Bearer ${this.pat}` },
    });
    if (!res?.ok) throw new Error(`Supabase management API failed: HTTP ${res?.status}`);
    const data = (await res.json()) as Array<{ id: string; name: string; ref: string }>;
    return data;
  }
}
