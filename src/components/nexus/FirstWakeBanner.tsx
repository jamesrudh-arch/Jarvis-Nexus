'use client';

import type { NexusClient } from '@/nexus/client';

export default function FirstWakeBanner({ client }: { client: NexusClient | null }) {
  return (
    <section id="first-wake-banner" className="wake-banner" aria-live="polite">
      <div className="wake-header">SANCTUARY INITIALIZED · TRUTHFUL CORE STATUS</div>
      <p id="wake-status-copy">
        NEXUS is online inside Central Operations, embodied and listening. Reasoning runs on the private NEXUS
        inference route; a Local PC 4-bit CUDA worker or Private Kaggle GPU session can be attached later for
        fully offline neural work — or say &ldquo;show me&rdquo; and she will construct an interactive 3D scenario.
      </p>
      <div className="wake-actions">
        <button className="btn-primary" onClick={() => client?.completeOnboarding('compute')}>
          Configure Local / Kaggle GPU
        </button>
        <button className="btn-secondary" onClick={() => client?.completeOnboarding('scenario')}>
          &ldquo;Let Me Show You&rdquo; (3D Scenario)
        </button>
        <button className="btn-ghost" onClick={() => client?.completeOnboarding('dismiss')}>
          Enter Sanctuary
        </button>
      </div>
    </section>
  );
}
