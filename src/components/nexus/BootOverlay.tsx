'use client';

import type { NexusSnapshot } from '@/nexus/client';

export default function BootOverlay({ snap, onEnter }: { snap: NexusSnapshot | null; onEnter: () => void }) {
  const ready = Boolean(snap?.ready);
  const error = snap?.error || null;

  return (
    <div className="boot-overlay" role="status" aria-live="polite">
      <div className="boot-title">JARVIS NEXUS</div>
      <div className="boot-sub">Embodied Spatial Sanctuary · Oslo Node</div>
      <div className="boot-progress" />
      <div className="boot-status">
        {error ? `CORE link degraded: ${error}` : ready ? 'All systems nominal.' : snap?.loadingText || 'Igniting sanctuary emitters…'}
      </div>
      {ready && (
        <button className="boot-enter" onClick={onEnter}>
          Enter Sanctuary
        </button>
      )}
      {!ready && !error && (
        <div className="boot-hint">Loading the rigged 3D character (14 MB) — first boot takes a moment.</div>
      )}
    </div>
  );
}
