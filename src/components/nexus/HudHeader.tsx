'use client';

import type { NexusClient, NexusSnapshot } from '@/nexus/client';

const SWITCH_DEFS: Array<[string, string]> = [
  ['master', 'MASTER'],
  ['microphone', 'MIC'],
  ['camera', 'CAM'],
  ['autonomy', 'AUTO'],
  ['remote_compute', 'KAGGLE'],
  ['computer_control', 'TOOLS'],
  ['embodiment', 'BODY'],
];

const CAMERA_PRESETS = [
  ['auto', 'Cam: Auto Director'],
  ['living_presence', '40mm Living Presence'],
  ['conversation', '65mm Conversational Focus'],
  ['follow_jarvis', '35mm Follow Tracking'],
  ['scenario_stage', '28mm Volumetric Stage'],
  ['video_presentation', '35mm Media Wall'],
  ['memory_archive', '40mm Memory Colonnade'],
  ['security_alert', '35mm Security Vault'],
  ['wide_sanctuary', '24mm Sanctuary Overview'],
];

export default function HudHeader({
  snap,
  client,
  onOpenModes,
  onOpenInspector,
}: {
  snap: NexusSnapshot;
  client: NexusClient | null;
  onOpenModes: () => void;
  onOpenInspector: () => void;
}) {
  const world = snap.world;
  if (!world) return null;

  const modeObj = (world.modes || []).find((m) => m.id === world.active_mode);
  const switches = world.switches || {};

  return (
    <header id="hud-top">
      <div className="hud-cluster hud-brand-cluster">
        <button id="btn-modes-drawer" className="hud-pill-btn" title="15 Operational Modes & Spatial Zones" onClick={onOpenModes}>
          <span className="status-dot" />
          <span className="brand-mark">JARVIS NEXUS</span>
          <span className="sep">/</span>
          <span id="active-mode-label">{modeObj ? modeObj.label : world.active_mode}</span>
        </button>
        <div className="activity-readout">
          <span className="meta-tag" id="jarvis-zone-badge">
            {(world.current_zone || '').replaceAll('_', ' ')}
          </span>
          <span id="jarvis-activity-text">{world.active_activity_summary || ''}</span>
        </div>
      </div>

      <div className="hud-cluster hud-right-controls">
        <div id="switches-strip" className="switches-strip" role="group" aria-label="Owner Hardware & Privacy Switches">
          {SWITCH_DEFS.map(([key, short]) => {
            const on = Boolean(switches[key]);
            let cls = 'hw-switch-btn';
            if (key === 'master' && !on) cls += ' master-off';
            else if ((key === 'microphone' || key === 'camera') && on) cls += ' sensor-on';
            else if (on) cls += ' on';
            return (
              <button
                key={key}
                className={cls}
                title={`Toggle ${key}: currently ${on ? 'ON' : 'OFF'}`}
                onClick={() => client?.toggleSwitch(key)}
              >
                {short}:{on ? 'ON' : 'OFF'}
              </button>
            );
          })}
        </div>

        <div className="camera-bar">
          <select
            id="camera-preset-select"
            title="Deliberate Cinema Camera Framing"
            onChange={(e) => client?.setCameraPreset(e.target.value)}
            defaultValue="auto"
          >
            {CAMERA_PRESETS.map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button
            id="btn-reset-view"
            className="hud-icon-btn"
            title="Reset View — re-frame the camera on the current preset and recover from any stuck/framed-out state"
            onClick={() => client?.resetView()}
          >
            RESET VIEW
          </button>
          <button
            id="btn-hologram-toggle"
            className="hud-icon-btn"
            title="Physical Holographic Projection Output (Pepper's Ghost / 4-Face)"
            onClick={() => client?.setMode(world.active_mode === 'holographic_presence' ? 'living_presence' : 'holographic_presence')}
          >
            HOLO
          </button>
          <button id="btn-inspector-drawer" className="hud-icon-btn" title="Open Contextual Sanctuary Inspector" onClick={onOpenInspector}>
            INSPECT
          </button>
        </div>
      </div>
    </header>
  );
}
