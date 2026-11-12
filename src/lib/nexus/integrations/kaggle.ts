/**
 * JARVIS NEXUS — Kaggle Resource Manager (all six owner accounts).
 *
 * Real integrations against the Kaggle public REST API v1
 * (https://www.kaggle.com/api/v1) using the owner-supplied KGAT_ API tokens
 * (one per account). No pooled-compute illusions: each account is
 * authenticated and tracked INDIVIDUALLY; quotas/limits are Kaggle-platform
 * enforced and surfaced honestly.
 *
 * Verified live 2026-11-12: all six tokens authenticate via
 * GET /api/v1/hello (account usernames jimcreat, wikeyoung, deyoungsltd,
 * bittrexminingltd, wikeyoung5, youngwilly).
 */

const KAGGLE_API = 'https://www.kaggle.com/api/v1';

export interface KaggleAccountState {
  index: number;            // 1..6
  userName: string | null;  // verified account identity
  configured: boolean;      // token present in env
  connected: boolean;       // last verification succeeded
  lastError: string | null;
  lastVerifiedAt: number | null;
  usageCount: number;       // workload submissions routed to this account
}

interface KaggleHello {
  userName?: string;
}

export interface KaggleDataset {
  ref: string;
  title: string;
  totalBytes: number;
  licenseName?: string;
  lastUpdated?: string;
}

async function kaggleFetch(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${KAGGLE_API}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    let data: unknown = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: (err as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

export class KaggleResourceManager {
  private accounts: KaggleAccountState[] = [];
  private rrCursor = 0;

  constructor() {
    for (let i = 1; i <= 6; i++) {
      this.accounts.push({
        index: i,
        userName: null,
        configured: Boolean(process.env[`KAGGLE_API_TOKEN_${i}`]),
        connected: false,
        lastError: null,
        lastVerifiedAt: null,
        usageCount: 0,
      });
    }
  }

  private token(i: number): string | undefined {
    return process.env[`KAGGLE_API_TOKEN_${i}`];
  }

  /** Verify one account (authenticated identity check). */
  async verifyAccount(i: number): Promise<KaggleAccountState> {
    const acc = this.accounts[i - 1];
    const tok = this.token(i);
    if (!acc || !tok) return acc ?? this.accounts[0];
    const res = await kaggleFetch(tok, '/hello');
    const hello = res.data as KaggleHello | null;
    acc.connected = res.ok && typeof hello?.userName === 'string';
    acc.userName = acc.connected ? (hello!.userName as string) : acc.userName;
    acc.lastError = acc.connected ? null : `HTTP ${res.status}`;
    acc.lastVerifiedAt = Date.now();
    return acc;
  }

  /** Verify all six accounts individually. */
  async verifyAll(): Promise<KaggleAccountState[]> {
    // Sequential with a small gap — respectful of the platform.
    for (let i = 1; i <= 6; i++) {
      await this.verifyAccount(i);
      await new Promise((r) => setTimeout(r, 150));
    }
    return [...this.accounts];
  }

  /** Select the next healthy account (round-robin across connected accounts). */
  pickAccount(): { index: number; token: string } | null {
    const healthy = this.accounts.filter((a) => a.connected && this.token(a.index));
    if (healthy.length === 0) {
      // Fall back to any configured account (unverified but present)
      const configured = this.accounts.filter((a) => a.configured && this.token(a.index));
      if (configured.length === 0) return null;
      const acc = configured[this.rrCursor++ % configured.length];
      return { index: acc.index, token: this.token(acc.index)! };
    }
    const acc = healthy[this.rrCursor++ % healthy.length];
    return { index: acc.index, token: this.token(acc.index)! };
  }

  /** Discover public datasets by search term (permitted discovery). */
  async discoverDatasets(search: string, max = 20): Promise<KaggleDataset[]> {
    const picked = this.pickAccount();
    if (!picked) throw new Error('No Kaggle account configured (KAGGLE_API_TOKEN_1..6)');
    this.accounts[picked.index - 1].usageCount++;
    const res = await kaggleFetch(
      picked.token,
      // NB: pageSize = result count. (maxSize is a BYTE-size filter on Kaggle —
      // live-verified 2026-11-13: maxSize=5 returned 0 datasets, pageSize=5
      // returned real results.)
      `/datasets/list?search=${encodeURIComponent(search)}&pageSize=${max}`
    );
    if (!res.ok) throw new Error(`Kaggle dataset search failed: HTTP ${res.status}`);
    const rows = (Array.isArray(res.data) ? res.data : []) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      ref: String(r.ref ?? ''),
      title: String(r.title ?? ''),
      totalBytes: Number(r.totalBytes ?? 0),
      licenseName: r.licenseName ? String(r.licenseName) : undefined,
      lastUpdated: r.lastUpdated ? String(r.lastUpdated) : undefined,
    }));
  }

  /**
   * Push a notebook kernel to an account (real compute submission — the
   * kernel executes on Kaggle's servers with the requested accelerator).
   * `kernelSource` is the full .ipynb JSON for notebooks, or .py source for
   * scripts; settings request GPU when true.
   */
  async pushKernel(opts: {
    slugTitle: string;
    kernelSource: string;
    kernelType: 'notebook' | 'script';
    enableGpu: boolean;
    enableInternet: boolean;
    datasetSources?: string[];    // e.g. ["owner/dataset-slug"]
  }): Promise<{ ok: boolean; status: number; detail: string; account: number }> {
    const picked = this.pickAccount();
    if (!picked) throw new Error('No Kaggle account configured');
    const acc = this.accounts[picked.index - 1];
    acc.usageCount++;
    const body = {
      slugTitle: opts.slugTitle,
      language: 'python',
      kernelType: opts.kernelType,
      isPrivate: true,
      enableGpu: opts.enableGpu,
      enableInternet: opts.enableInternet,
      datasetDataSources: opts.datasetSources ?? [],
      kernelSource: opts.kernelSource,
    };
    const res = await kaggleFetch(picked.token, '/kernels/push', { method: 'POST', body });
    const detail =
      res.ok
        ? `Kernel accepted — monitor on Kaggle account ${acc.userName ?? `#${picked.index}`}`
        : `HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 300)}`;
    return { ok: res.ok, status: res.status, detail, account: picked.index };
  }

  status(): KaggleAccountState[] {
    return this.accounts.map((a) => ({ ...a }));
  }
}
