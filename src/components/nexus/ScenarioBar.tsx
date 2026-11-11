'use client';

import { useState } from 'react';
import type { NexusClient, NexusSnapshot } from '@/nexus/client';

export default function ScenarioBar({ snap, client }: { snap: NexusSnapshot; client: NexusClient | null }) {
  const sd = client?.scenarioDirector;
  const [playing, setPlaying] = useState(Boolean(sd?.playing));
  const [recording, setRecording] = useState(snap.recording);
  const def = snap.activeScenarioDef;
  if (!def || !sd) return null;

  const updateBranchBanner = () => {
    // Branch selection mirrors the reference logic
    let chosen = def.branches?.[def.branches.length - 1];
    if (!chosen) return { label: '', outcome: '', severity: '' };
    const vars = sd.variables;
    if (def.id === 'cryo_manifold_forensic') {
      const ruptured = Number(vars.line_pressure_mpa ?? 210) >= 185 && Number(vars.relief_valve_ms ?? 125) > 70;
      chosen = ruptured ? def.branches[0] : def.branches[1];
    } else if (def.id === 'dual_turbine_sim') {
      chosen = Number(vars.inlet_temp_k ?? 1320) <= 1450 ? def.branches[0] : def.branches[1];
    } else if (def.id === 'zerotrust_compute_flow') {
      chosen = Number(vars.expose_public_port ?? 0) === 0 ? def.branches[0] : def.branches[1];
    }
    return chosen;
  };
  const branch = updateBranchBanner();

  return (
    <section id="scenario-director-bar" className="scenario-bar" aria-label="Scenario Director">
      <div className="scenario-top-row">
        <div>
          <span className="scenario-class-badge">{(def.classification || '').replaceAll('_', ' ').toUpperCase()}</span>
          <strong>{def.title}</strong>
        </div>
        <div className="scenario-transport">
          <button
            className="btn-chip"
            onClick={() => {
              const nowPlaying = client?.scenarioPlayPause() ?? false;
              setPlaying(nowPlaying);
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn-chip" onClick={() => { client?.scenarioReplay(); setPlaying(true); }}>
            Replay
          </button>
          <select
            className="compact-select"
            defaultValue="1"
            onChange={(e) => client?.scenarioSetRate(Number(e.target.value))}
          >
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1">1.0×</option>
            <option value="2">2.0×</option>
          </select>
          <button
            className="btn-chip"
            title="Record live 3D scenario viewport to WebM"
            onClick={() => setRecording(Boolean(client?.toggleScenarioRecording()))}
          >
            {recording ? 'Stop Rec' : 'Rec WebM'}
          </button>
          <button className="btn-chip btn-danger-outline" onClick={() => client?.restoreScenario()}>
            Restore World
          </button>
        </div>
      </div>
      <div className="scenario-timeline-row">
        <span className="tabular" id="sc-time-readout">{snap.scenarioTimeReadout}</span>
        <input
          type="range"
          id="sc-timeline-slider"
          min={0}
          max={def.duration_sec || 20}
          step={0.1}
          defaultValue={sd.currentTime}
          onInput={(e) => {
            client?.scenarioSeek(Number((e.target as HTMLInputElement).value));
            setPlaying(false);
          }}
        />
        <span id="sc-phase-label" className="sc-phase">{snap.scenarioPhase}</span>
      </div>
      <div id="sc-variables-row" className="scenario-vars-row">
        {(def.variables || []).map((v) => (
          <label className="var-control" key={v.key}>
            <span>
              {v.label}: <strong className="tabular">{sd.variables[v.key] ?? v.default}</strong>
            </span>
            <input
              type="range"
              min={v.min}
              max={v.max}
              step={v.step}
              defaultValue={sd.variables[v.key] ?? v.default}
              onInput={(e) => client?.scenarioUpdateVariable(v.key, Number((e.target as HTMLInputElement).value))}
            />
          </label>
        ))}
      </div>
      {branch && (
        <div
          id="sc-branch-readout"
          className={`scenario-branch-banner ${branch.severity === 'critical' ? 'critical' : ''}`}
        >
          {branch.label} — {branch.outcome}
        </div>
      )}
    </section>
  );
}
