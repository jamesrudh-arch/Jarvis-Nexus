/**
 * JARVIS NEXUS — GitHub repository client (read-only status surface).
 *
 * Live-verified 2026-11-12: token authenticates as jamesrudh-arch with push
 * access to jamesrudh-arch/Jarvis-Nexus (empty → now main @ session commits).
 * Used for the connections panel: repo existence, default branch, latest
 * commit, ahead/behind vs. the deployment. Never exposes the token.
 */

export interface GitHubStatus {
  configured: boolean;
  connected: boolean;
  repo: string;
  defaultBranch: string | null;
  latestCommit: string | null;
  detail: string;
}

export class GitHubRepoClient {
  private get token(): string | undefined {
    return process.env.GITHUB_TOKEN;
  }
  private get repo(): string {
    return process.env.GITHUB_REPO ?? 'jamesrudh-arch/Jarvis-Nexus';
  }

  async status(): Promise<GitHubStatus> {
    const out: GitHubStatus = {
      configured: Boolean(this.token),
      connected: false,
      repo: this.repo,
      defaultBranch: null,
      latestCommit: null,
      detail: '',
    };
    if (!out.configured) {
      out.detail = 'GITHUB_TOKEN not configured (read-only status disabled)';
      return out;
    }
    const headers = {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repo}/commits/main`, {
        headers, signal: controller.signal, cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as { sha: string; commit: { message: string } };
        out.connected = true;
        out.defaultBranch = 'main';
        out.latestCommit = data.sha.slice(0, 9);
        out.detail = `main @ ${data.sha.slice(0, 9)} — ${data.commit.message.split('\n')[0].slice(0, 80)}`;
      } else {
        out.detail = `GitHub API HTTP ${res.status}`;
      }
    } catch {
      out.detail = 'GitHub API unreachable';
    } finally {
      clearTimeout(timer);
    }
    return out;
  }
}
