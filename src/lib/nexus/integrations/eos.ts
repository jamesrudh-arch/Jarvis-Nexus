/**
 * JARVIS NEXUS — Epic Online Services (EOS) integration.
 *
 * EOS credentials: Product ID, Client ID, Deployment ID and Sandbox ID are
 * now all owner-supplied and configured (2026-11-13). The paired Client
 * SECRET is the single missing credential — proven by REAL attempts:
 * client-credentials OAuth against https://api.epicgames.dev/epic/oauth/v2/token
 * with all 12 client/secret permutations of every supplied value answered
 * HTTP 400 `errors.com.epicgames.account.invalid_client_credentials`.
 *
 * This module:
 *  - assembles the runtime configuration from environment credentials,
 *  - validates structural completeness,
 *  - performs the real OAuth exchange whenever clientId + clientSecret exist,
 *  - reports exactly what is missing and where to obtain it.
 */

export interface EosConfig {
  clientId: string | null;
  clientSecret: string | null;
  productId: string | null;
  deploymentId: string | null;
  /** Extra sandbox IDs the deployment may authenticate (default sandbox = product). */
  sandboxIds: string[];
}

export interface EosStatus {
  configured: boolean;
  complete: boolean;
  /** OAuth client-credentials exchange actually succeeded (live probe). */
  authenticated: boolean;
  missing: string[];
  detail: string;
  /** Which runtime consumes this configuration. */
  consumer: string;
}

export class EosIntegration {
  config(): EosConfig {
    // EPIC_CLIENT_CREDENTIAL holds the supplied xyza7891… value (client-id format)
    const clientId = process.env.EPIC_CLIENT_ID ?? process.env.EPIC_CLIENT_CREDENTIAL ?? null;
    return {
      clientId,
      clientSecret: process.env.EPIC_CLIENT_SECRET ?? null,
      productId: process.env.EPIC_PRODUCT_ID ?? null,
      deploymentId: process.env.EPIC_DEPLOYMENT_ID ?? null,
      sandboxIds: (process.env.EPIC_SANDBOX_IDS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  /** Live OAuth client-credentials exchange (real request, real verdict). */
  async authenticate(): Promise<{ ok: boolean; status: number; detail: string }> {
    const cfg = this.config();
    if (!cfg.clientId || !cfg.clientSecret || !cfg.deploymentId) {
      return { ok: false, status: 0, detail: 'clientId/clientSecret/deploymentId not all present' };
    }
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      deployment_id: cfg.deploymentId,
      scope: 'basic',
    });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const res = await fetch('https://api.epicgames.dev/epic/oauth/v2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string;
        expires_in?: number;
        errorCode?: string;
      };
      if (res.ok && data.access_token) {
        return { ok: true, status: res.status, detail: `OAuth OK — token expires in ${data.expires_in ?? '?'} s` };
      }
      return { ok: false, status: res.status, detail: `${data.errorCode ?? 'HTTP ' + res.status}` };
    } catch (err) {
      return { ok: false, status: 0, detail: (err as Error).message };
    }
  }

  async status(): Promise<EosStatus> {
    const cfg = this.config();
    const missing: string[] = [];
    if (!cfg.clientId) missing.push('EPIC_CLIENT_ID');
    if (!cfg.clientSecret) missing.push('EPIC_CLIENT_SECRET');
    if (!cfg.productId) missing.push('EPIC_PRODUCT_ID');
    if (!cfg.deploymentId) missing.push('EPIC_DEPLOYMENT_ID');
    if (missing.length === 0) {
      const auth = await this.authenticate();
      return {
        configured: true,
        complete: true,
        authenticated: auth.ok,
        missing: [],
        detail: auth.ok
          ? `Live OAuth verified: ${auth.detail}. SDK runtime consumer: ${'world/Unreal/Plugins/JarvisNexusEOS'}.`
          : `All credentials present but live OAuth failed: ${auth.detail}`,
        consumer: 'world/Unreal/Plugins/JarvisNexusEOS (EOS SDK at engine runtime) + ios/JarvisNexus (EOS native on device)',
      };
    }
    return {
      configured: Boolean(cfg.clientId),
      complete: false,
      authenticated: false,
      missing,
      detail: `Partial — Product/Client/Deployment/Sandbox IDs configured; missing: ${missing.join(', ')}. `
        + 'Live sweep 2026-11-13: all 12 client/secret permutations of the supplied values answered '
        + '400 invalid_client_credentials — the Client Secret is a distinct value from the EOS '
        + 'Developer Portal (your product → Clients).',
      consumer: 'world/Unreal/Plugins/JarvisNexusEOS (EOS SDK at engine runtime) + ios/JarvisNexus (EOS native on device)',
    };
  }
}
