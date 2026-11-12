/**
 * JARVIS NEXUS — Integration registry.
 * Single live status surface for every external service (§integrations).
 * Responses NEVER contain credentials — only connection state + identities.
 */
import { KaggleResourceManager, type KaggleAccountState } from './kaggle';
import { CloudflareR2Client, type R2Status } from './r2';
import { SupabaseClient, type SupabaseStatus } from './supabase';
import { EosIntegration, type EosStatus } from './eos';
import { GitHubRepoClient, type GitHubStatus } from './github';
import { UnrealBridgeClient, type UnrealBridgeStatus } from './unrealBridge';
import { BlenderMcpClient, type BlenderMcpStatus } from './blenderMcp';

export interface IntegrationSnapshot {
  checkedAt: number;
  github: GitHubStatus;
  kaggle: { accounts: KaggleAccountState[]; connectedCount: number; configuredCount: number };
  cloudflare: R2Status;
  supabase: SupabaseStatus;
  railway: { configured: boolean; authenticated: boolean; projects: number; detail: string };
  eos: EosStatus;
  unreal: UnrealBridgeStatus;
  blender: BlenderMcpStatus;
}

const kaggleManager = new KaggleResourceManager();
const r2Client = new CloudflareR2Client();
const supabaseClient = new SupabaseClient();
const eosIntegration = new EosIntegration();
const githubClient = new GitHubRepoClient();
const unrealBridge = new UnrealBridgeClient();
const blenderMcp = new BlenderMcpClient();

let cache: { at: number; snap: IntegrationSnapshot } | null = null;
const CACHE_MS = 30_000;

async function railwayStatus(): Promise<IntegrationSnapshot['railway']> {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    return { configured: false, authenticated: false, projects: 0, detail: 'RAILWAY_API_TOKEN not configured' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch('https://backboard.railway.app/graphql/v2', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ projects { edges { node { id name } } } }' }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => null)) as {
      data?: { projects?: { edges?: Array<{ node: { id: string; name: string } }> } };
    } | null;
    const edges = data?.data?.projects?.edges ?? [];
    if (!res.ok || !data?.data) {
      return {
        configured: true,
        authenticated: false,
        projects: 0,
        detail: `Railway GraphQL HTTP ${res.status}`,
      };
    }
    // Live deployment state (write-verified 2026-11-12: variableUpsert/
    // variableDelete/volumeCreate mutations confirmed; service deployed from
    // GitHub jamesrudh-arch/Jarvis-Nexus main via repo trigger).
    let detail = `Workspace token authenticated — ${edges.length} project(s).`;
    const first = edges[0]?.node;
    if (first) {
      const dep = await fetch('https://backboard.railway.app/graphql/v2', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query($id: String!) { project(id: $id) { deployments(first: 1) `
            + `{ edges { node { status staticUrl meta } } } } }`,
          variables: { id: first.id },
        }),
        signal: controller.signal,
        cache: 'no-store',
      }).then((r) => r.json().catch(() => null)) as {
        data?: { project?: { deployments?: { edges?: Array<{ node: {
          status: string; staticUrl: string | null; meta?: { repo?: string; branch?: string };
        } }> } } };
      } | null;
      const node = dep?.data?.project?.deployments?.edges?.[0]?.node;
      if (node) {
        const src = node.meta?.repo ? ` (${node.meta.repo}@${node.meta.branch ?? 'main'})` : '';
        detail = `Project ${first.name}: latest deployment ${node.status}${src}`
          + (node.staticUrl ? ` — live at https://${node.staticUrl}` : '');
      }
    }
    return {
      configured: true,
      authenticated: true,
      projects: edges.length,
      detail,
    };
  } catch {
    return { configured: true, authenticated: false, projects: 0, detail: 'Railway API unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

export async function getIntegrationSnapshot(force = false): Promise<IntegrationSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.snap;

  const [github, kaggleAccounts, cloudflare, supabase, railway, unreal, blender] = await Promise.all([
    githubClient.status(),
    kaggleManager.verifyAll(),
    r2Client.status(),
    supabaseClient.status(),
    railwayStatus(),
    unrealBridge.status(),
    blenderMcp.status(),
  ]);

  const snap: IntegrationSnapshot = {
    checkedAt: Date.now(),
    github,
    kaggle: {
      accounts: kaggleAccounts,
      connectedCount: kaggleAccounts.filter((a) => a.connected).length,
      configuredCount: kaggleAccounts.filter((a) => a.configured).length,
    },
    cloudflare,
    supabase,
    railway,
    eos: eosIntegration.status(),
    unreal,
    blender,
  };
  cache = { at: Date.now(), snap };
  return snap;
}

export { kaggleManager, r2Client, supabaseClient };
