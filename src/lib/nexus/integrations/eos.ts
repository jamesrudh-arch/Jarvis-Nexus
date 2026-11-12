/**
 * JARVIS NEXUS — Epic Online Services (EOS) configuration assembly.
 *
 * EOS is a native SDK (C/C++ with platform bindings) — there is NO public
 * REST endpoint that can validate credentials; authentication happens inside
 * `EOS_Platform_Create` at engine runtime. This module therefore:
 *  - assembles the runtime configuration from environment credentials,
 *  - validates structural completeness (which IDs exist / are missing),
 *  - states precisely what cannot be verified outside the SDK.
 *
 * Credential state (2026-11-12): one Epic credential supplied by the owner,
 * value prefix `xyza7891…` — Epic's CLIENT ID format. The paired client
 * SECRET value, plus ProductId and DeploymentId (EOS Developer Portal →
 * your product → EOS settings) are still required for a complete platform
 * configuration. Missing values are surfaced — never invented.
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

  status(): EosStatus {
    const cfg = this.config();
    const missing: string[] = [];
    if (!cfg.clientId) missing.push('EPIC_CLIENT_ID (supplied xyza7891… credential)');
    if (!cfg.clientSecret) missing.push('EPIC_CLIENT_SECRET');
    if (!cfg.productId) missing.push('EPIC_PRODUCT_ID (EOS Developer Portal)');
    if (!cfg.deploymentId) missing.push('EPIC_DEPLOYMENT_ID (EOS Developer Portal)');
    return {
      configured: Boolean(cfg.clientId),
      complete: missing.length === 0,
      missing,
      detail: missing.length === 0
        ? 'Complete — verify at engine runtime via EOS_Platform_Create (unreal/JarvisNexusEOS plugin).'
        : `Partial: ${missing.length} credential(s) missing (${missing.join(', ')}). `
          + 'SDK authentication cannot be verified outside the engine — no REST endpoint exists.',
      consumer: 'unreal/JarvisNexusEOS (EOS SDK at engine runtime) + ios/JarvisNexus (EOS native on device)',
    };
  }
}
