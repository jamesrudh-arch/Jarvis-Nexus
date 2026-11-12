'use client';

import { useState } from 'react';
import type { NexusClient, NexusSnapshot } from '@/nexus/client';
import { evalBranchCondition } from '@/nexus/world/branchCondition.js';

export default function ScenarioBar({ snap, client }: { snap: NexusSnapshot; client: NexusClient | null }) {
  const sd = client?.scenarioDirector;
  // The director is a JS module (allowJs) whose `variables` infers as {} from
  // its constructor; at runtime it is always Record<string, number>.
  const vars = (sd?.variables ?? {}) as Record<string, number>;
  const [playing, setPlaying] = useState(Boolean(sd?.playing));
  const [recording, setRecording] = useState(snap.recording);
  const def = snap.activeScenarioDef;
  if (!def || !sd) return null;

  const updateBranchBanner = () => {
    // Single source of truth: the same shared evaluator the Media Wall feed uses
    // (ScenarioDirector3D.getMediaFeedState). The old per-scenario hardcoded
    // if-chains were a duplicate implementation that could drift out of sync.
    for (const b of def.branches || []) {
      if (evalBranchCondition(b.condition, vars)) return b;
    }
    return null;
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
            value={String(sd.playbackRate)}
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
          value={sd.currentTime}
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
              {v.label}: <strong className="tabular">{vars[v.key] ?? v.default}</strong>
            </span>
            <input
              type="range"
              min={v.min}
              max={v.max}
              step={v.step}
              value={vars[v.key] ?? v.default}
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
