'use client';

import { useState } from 'react';
import type { NexusClient } from '@/nexus/client';

export default function FirstWakeBanner({ client }: { client: NexusClient | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      id="first-wake-banner"
      className={`wake-banner ${open ? '' : 'collapsed'}`}
      aria-live="polite"
    >
      <button
        type="button"
        className="wake-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>SANCTUARY INITIALIZED · CORE ONLINE</span>
        <span className="wake-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <>
          <p id="wake-status-copy">
            NEXUS is embodied in Central Operations and listening. Reasoning runs on the private
            inference route — a Local 4-bit CUDA worker or Private Kaggle GPU can be attached
            later, or say &ldquo;show me&rdquo; and she will construct an interactive 3D scenario.
          </p>
          <div className="wake-actions">
            <button className="btn-chip" onClick={() => client?.completeOnboarding('compute')}>
              Configure GPU
            </button>
            <button className="btn-chip" onClick={() => client?.completeOnboarding('scenario')}>
              “Let Me Show You” · 3D
            </button>
            <button className="btn-chip" onClick={() => client?.completeOnboarding('dismiss')}>
              Dismiss
            </button>
          </div>
        </>
      )}
    </section>
  );
}
