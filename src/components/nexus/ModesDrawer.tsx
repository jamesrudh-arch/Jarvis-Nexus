'use client';

import type { NexusClient, NexusSnapshot } from '@/nexus/client';
import { isOwnerAuthRejection, notifyAuthRequired, ownerKeyHeaders } from '@/nexus/ownerKeyClient';

const QUICK_MOVES: Array<[string, string, boolean]> = [
  ['central_operations', 'Walk: Central Ops', false],
  ['memory_archive', 'Walk: Memory Archive', false],
  ['research_area', 'Walk: Research', false],
  ['media_presentation', 'Walk: Media Wall', false],
  ['defensive_security', 'Urgent Run: Security Alert', true],
];

export default function ModesDrawer({
  open,
  snap,
  client,
  onClose,
}: {
  open: boolean;
  snap: NexusSnapshot;
  client: NexusClient | null;
  onClose: () => void;
}) {
  const world = snap.world;
  if (!world || !open) return null;

  const move = async (zoneId: string, urgent: boolean) => {
    try {
      const res = await fetch('/api/v1/world/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...ownerKeyHeaders() },
        body: JSON.stringify({
          zone_id: zoneId,
          activity: urgent
            ? 'Urgent defensive perimeter inspection triggered!'
            : `Walking to ${zoneId.replaceAll('_', ' ')}.`,
          emotional_state: urgent ? 'urgent' : 'focused',
          urgent,
          ...(urgent ? { mode_override: 'defensive_security' } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (isOwnerAuthRejection(res, data.detail)) notifyAuthRequired();
        return;
      }
      const data = await res.json();
      if (res.ok) client?.applyWorldState(data, false);
    } catch { /* ignore */ }
  };

  return (
    <aside id="modes-drawer" className="side-drawer left-drawer" aria-label="Operational Modes">
      <div className="drawer-head">
        <h2>15 Connected Operational Modes</h2>
        <button className="btn-close" onClick={onClose} aria-label="Close modes drawer">×</button>
      </div>
      <p className="drawer-sub">
        Every mode operates inside the same persistent 3D world—moving NEXUS physically to the appropriate station.
      </p>
      <div id="modes-list" className="modes-grid">
        {(world.modes || []).map((m) => (
          <button
            key={m.id}
            className={`mode-row-btn ${m.id === world.active_mode ? 'active' : ''}`}
            onClick={() => client?.setMode(m.id)}
          >
            <span>{String(m.index).padStart(2, '0')}. {m.label}</span>
            <span className="mode-zone">{m.zone.replaceAll('_', ' ')}</span>
          </button>
        ))}
      </div>
      <div className="drawer-section">
        <h3>Quick Locomotion & Performance Checks</h3>
        <div className="quick-actions-row">
          {QUICK_MOVES.map(([zoneId, label, urgent]) => (
            <button
              key={zoneId}
              className={`btn-chip ${urgent ? 'btn-amber' : ''}`}
              onClick={() => void move(zoneId, urgent)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="drawer-section">
        <h3>Deliberate Cinema Camera Framing</h3>
        <div className="quick-actions-row">
          <select
            className="compact-select"
            defaultValue="auto"
            onChange={(e) => client?.setCameraPreset(e.target.value)}
            aria-label="Camera preset"
            style={{ flex: '1 1 160px' }}
          >
            <option value="auto">Auto Director</option>
            <option value="living_presence">40mm Living Presence</option>
            <option value="conversation">65mm Conversational Focus</option>
            <option value="follow_jarvis">35mm Follow Tracking</option>
            <option value="scenario_stage">28mm Volumetric Stage</option>
            <option value="video_presentation">35mm Media Wall</option>
            <option value="memory_archive">40mm Memory Colonnade</option>
            <option value="security_alert">35mm Security Vault</option>
            <option value="wide_sanctuary">24mm Sanctuary Overview</option>
          </select>
        </div>
      </div>
      <div className="drawer-section">
        <label className="toggle-row">
          <input
            type="checkbox"
            id="chk-reduced-motion"
            checked={Boolean(world.reduced_motion)}
            onChange={(e) => client?.setReducedMotion(e.target.checked)}
          />
          <span>Reduced Motion (gentle cuts, zero camera sweep)</span>
        </label>
      </div>
    </aside>
  );
}
