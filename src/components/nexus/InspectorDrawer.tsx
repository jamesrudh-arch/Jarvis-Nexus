'use client';

import { useCallback, useEffect, useState } from 'react';
import type { NexusClient, Telemetry } from '@/nexus/client';

type Tab = 'scenarios' | 'memory' | 'goals' | 'agents' | 'compute' | 'diagnostics';

interface MemoryRow {
  id: string; category: string; epistemic_status: string; title: string;
  content: string; confidence: number; source_ref: string | null; project_tag: string | null;
}
interface GoalRow {
  id: string; title: string; description: string; priority: number; status: string;
  progress: number; schedule_spec: string; next_action: string; unmet_dependencies: string[];
}
interface AgentRow {
  id: string; name: string; role_summary: string; allowed_tools: string[];
  permission_boundary: string; status: string; last_output: string | null;
}
interface ScenarioRow {
  id: string; title: string; classification: string; summary: string;
}
interface SecurityEvent { severity: string; category: string; message: string; created_at: string }

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
  return res.json();
}
async function jpost(url: string, body?: unknown, method = 'POST') {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
  return data;
}

export default function InspectorDrawer({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client: NexusClient | null;
}) {
  const [tab, setTab] = useState<Tab>('scenarios');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);

  const [memForm, setMemForm] = useState({ category: 'owner_fact', epistemic_status: 'owner_stated', title: '', content: '' });
  const [goalForm, setGoalForm] = useState({ title: '', description: '', priority: '2' });

  const load = useCallback(async (t: Tab) => {
    setBusy(true);
    setNotice('');
    try {
      if (t === 'scenarios') {
        const res = await jget<{ scenarios: ScenarioRow[] }>('/api/v1/scenarios');
        setScenarios(res.scenarios || []);
      } else if (t === 'memory') {
        setMemories(await jget<MemoryRow[]>('/api/v1/memories'));
      } else if (t === 'goals') {
        setGoals(await jget<GoalRow[]>('/api/v1/goals'));
      } else if (t === 'agents') {
        const res = await jget<{ agents: AgentRow[] }>('/api/v1/agents');
        setAgents(res.agents || []);
      } else if (t === 'diagnostics') {
        const [tel, sec] = await Promise.all([
          jget<Telemetry>('/api/v1/telemetry'),
          jget<{ events: SecurityEvent[] }>('/api/v1/security/events'),
        ]);
        setTelemetry(tel);
        setSecurityEvents(sec.events || []);
      }
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load(tab);
  }, [open, tab, load]);

  if (!open) return null;

  const tabs: Array<[Tab, string]> = [
    ['scenarios', 'Scenarios'],
    ['memory', 'Memory'],
    ['goals', 'Goals'],
    ['agents', 'Agents & Tools'],
    ['compute', 'Kaggle / GPU'],
    ['diagnostics', 'Diagnostics'],
  ];

  return (
    <aside id="inspector-drawer" className="side-drawer right-drawer" aria-label="Sanctuary Inspector">
      <div className="drawer-head">
        <div className="inspector-tabs" id="inspector-tabs">
          {tabs.map(([id, label]) => (
            <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn-close" onClick={onClose} aria-label="Close inspector">×</button>
      </div>
      <div id="inspector-body" className="inspector-body">
        {busy && <p className="drawer-sub">Synchronizing with CORE…</p>}
        {notice && <p className="drawer-sub" style={{ color: 'var(--red)' }}>{notice}</p>}

        {tab === 'scenarios' && (
          <>
            <div className="panel-card">
              <h4>Scenario Director — &ldquo;Let Me Show You&rdquo;</h4>
              <p>
                Launch a room-scale 3D reconstruction, parallel simulation, or architectural flow directly onto the
                Volumetric Stage. NEXUS walks to the stage and directs the evidence.
              </p>
            </div>
            {scenarios.map((s) => (
              <div className="panel-card" key={s.id}>
                <span className="badge fact">{s.classification.replaceAll('_', ' ')}</span>
                <h4 style={{ marginTop: 6 }}>{s.title}</h4>
                <p>{s.summary}</p>
                <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      void client?.activateScenario(s.id);
                      onClose();
                    }}
                  >
                    Construct on 3D Stage
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'memory' && (
          <>
            <div className="panel-card">
              <h4>Store Typed Memory Record</h4>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await jpost('/api/v1/memories', memForm);
                    setMemForm({ ...memForm, title: '', content: '' });
                    await load('memory');
                  } catch (err) {
                    setNotice((err as Error).message);
                  }
                }}
              >
                <select value={memForm.category} onChange={(e) => setMemForm({ ...memForm, category: e.target.value })}>
                  <option value="owner_fact">Owner Fact</option>
                  <option value="preference">Preference</option>
                  <option value="commitment">Commitment</option>
                  <option value="project">Project</option>
                  <option value="source_research">Source-Backed Research</option>
                  <option value="agent_finding">Agent Finding</option>
                  <option value="sensitive">Sensitive</option>
                </select>
                <select
                  value={memForm.epistemic_status}
                  onChange={(e) => setMemForm({ ...memForm, epistemic_status: e.target.value })}
                >
                  <option value="owner_stated">Owner Stated</option>
                  <option value="verified_fact">Verified Fact</option>
                  <option value="source_backed">Source Backed</option>
                  <option value="hypothesis">Hypothesis (Never auto-promoted)</option>
                </select>
                <input
                  type="text"
                  placeholder="Memory title"
                  required
                  value={memForm.title}
                  onChange={(e) => setMemForm({ ...memForm, title: e.target.value })}
                />
                <textarea
                  rows={2}
                  placeholder="Factual detail or preference…"
                  required
                  value={memForm.content}
                  onChange={(e) => setMemForm({ ...memForm, content: e.target.value })}
                />
                <button type="submit" className="btn-primary">Save to Memory Archive</button>
              </form>
            </div>
            {memories.map((m) => (
              <div className="panel-card" key={m.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${m.epistemic_status === 'hypothesis' ? 'hypothesis' : 'fact'}`}>
                    {m.category} · {m.epistemic_status}
                  </span>
                  <button
                    className="btn-chip btn-danger-outline"
                    onClick={async () => {
                      await fetch(`/api/v1/memories/${m.id}`, { method: 'DELETE' });
                      await load('memory');
                    }}
                  >
                    Forget
                  </button>
                </div>
                <h4 style={{ marginTop: 5 }}>{m.title}</h4>
                <p>{m.content}</p>
              </div>
            ))}
          </>
        )}

        {tab === 'goals' && (
          <>
            <div className="panel-card">
              <h4>Create Goal with Priority & Schedule</h4>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await jpost('/api/v1/goals', { ...goalForm, priority: Number(goalForm.priority) });
                    setGoalForm({ title: '', description: '', priority: '2' });
                    await load('goals');
                  } catch (err) {
                    setNotice((err as Error).message);
                  }
                }}
              >
                <input
                  type="text"
                  placeholder="Goal title"
                  required
                  value={goalForm.title}
                  onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Objective & verification criteria"
                  required
                  value={goalForm.description}
                  onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                />
                <select value={goalForm.priority} onChange={(e) => setGoalForm({ ...goalForm, priority: e.target.value })}>
                  <option value="1">Priority P1 (Critical)</option>
                  <option value="2">Priority P2 (High)</option>
                  <option value="3">Priority P3 (Standard)</option>
                </select>
                <button type="submit" className="btn-primary">Register Goal</button>
              </form>
            </div>
            {goals.map((g) => (
              <div className="panel-card" key={g.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className={`badge ${g.unmet_dependencies.length ? 'hypothesis' : 'fact'}`}>
                    P{g.priority} · {g.status} · {g.progress}%
                  </span>
                  <span className="tabular" style={{ fontSize: 11, color: 'var(--muted)' }}>{g.schedule_spec}</span>
                </div>
                <h4 style={{ marginTop: 5 }}>{g.title}</h4>
                <p>{g.description}</p>
                {g.unmet_dependencies.length > 0 && (
                  <p style={{ color: 'var(--amber)', marginTop: 4 }}>Blocked on: {g.unmet_dependencies.join(', ')}</p>
                )}
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    className="btn-chip"
                    onClick={async () => {
                      try { await jpost(`/api/v1/goals/${g.id}/status`, { status: 'active' }, 'PATCH'); await load('goals'); }
                      catch (err) { setNotice((err as Error).message); }
                    }}
                  >
                    Activate
                  </button>
                  <button
                    className="btn-chip"
                    onClick={async () => {
                      await jpost(`/api/v1/goals/${g.id}/status`, { status: 'paused' }, 'PATCH');
                      await load('goals');
                    }}
                  >
                    Pause
                  </button>
                  <button
                    className="btn-chip btn-cyan-outline"
                    onClick={async () => {
                      await jpost(`/api/v1/goals/${g.id}/status`, { status: 'completed', progress: 100 }, 'PATCH');
                      await load('goals');
                    }}
                  >
                    Mark Complete
                  </button>
                  <button
                    className="btn-chip btn-danger-outline"
                    onClick={async () => {
                      await jpost(`/api/v1/goals/${g.id}/status`, { status: 'cancelled' }, 'PATCH');
                      await load('goals');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'agents' && (
          <>
            <div className="panel-card">
              <h4>Specialist Agents (Bounded Permissions)</h4>
              <p>
                Every specialist operates within explicit tool allowlists and respects the Authorised Autonomy and
                Computer Control switches.
              </p>
            </div>
            {agents.map((a) => (
              <div className="panel-card" key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong>{a.name}</strong>
                  <span className="badge fact">{a.status}</span>
                </div>
                <p>{a.role_summary}</p>
                <p style={{ marginTop: 4, fontSize: 10.5 }}>
                  Tools: <code>{a.allowed_tools.join(', ')}</code>
                </p>
                {a.last_output && <p style={{ marginTop: 5, color: 'var(--ice)' }}>{a.last_output}</p>}
                <button
                  style={{ marginTop: 7 }}
                  className="btn-primary"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await jpost(`/api/v1/agents/${a.id}/dispatch`, {
                        objective: 'Execute live sanctuary integrity and parameter verification.',
                      });
                      setNotice(`${a.name}: ${res.output}`);
                      await load('agents');
                    } catch (err) {
                      setNotice((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Dispatch Audit Run
                </button>
              </div>
            ))}
          </>
        )}

        {tab === 'compute' && (
          <>
            <div className="panel-card">
              <h4>Private Inference Routing</h4>
              <table className="kv-table">
                <tbody>
                  <tr><td>Active Backend</td><td>nexus_cloud_route (z-ai SDK, server-side only)</td></tr>
                  <tr><td>Local 4-bit CUDA Worker</td><td>Not connected — reported truthfully</td></tr>
                  <tr><td>Kaggle GPU Workers</td><td>0 connected — 6 encrypted slots standby</td></tr>
                  <tr><td>Public Ports Exposed</td><td>0 (Zero-Trust outbound only)</td></tr>
                </tbody>
              </table>
              <p style={{ marginTop: 6 }}>
                Reasoning currently runs on the private NEXUS cloud route. Attach a local Qwen2.5-14B 4-bit worker
                or a Kaggle dual-T4 session later for fully offline inference — CORE never fabricates worker status.
              </p>
            </div>
            <div className="panel-card">
              <h4>Kaggle GPU Profile Slots (Encrypted, Server-Side)</h4>
              <p>
                Six encrypted profile slots remain reserved. Credentials are stored server-side only; workers dial
                outbound with <code>JARVIS_WORKER_TOKEN</code> — zero public ports.
              </p>
            </div>
          </>
        )}

        {tab === 'diagnostics' && telemetry && (
          <>
            <div className="panel-card">
              <h4>Real Measured Host & Persistence Telemetry</h4>
              <table className="kv-table">
                <tbody>
                  <tr>
                    <td>CPU Utilisation</td>
                    <td>{telemetry.cpu_percent.toFixed(1)}% ({telemetry.cpu_cores} cores)</td>
                  </tr>
                  <tr>
                    <td>RAM Used</td>
                    <td>{telemetry.memory_used_mb} / {telemetry.memory_total_mb} MB ({telemetry.memory_percent}%)</td>
                  </tr>
                  <tr><td>Free Disk</td><td>{telemetry.disk_free_gb} GB</td></tr>
                  <tr>
                    <td>Memories / Goals / Scenarios</td>
                    <td>
                      {telemetry.database_records.memories} /{' '}
                      {telemetry.database_records.goals} /{' '}
                      {telemetry.database_records.scenarios}
                    </td>
                  </tr>
                  <tr><td>Uptime</td><td>{telemetry.uptime_sec} s</td></tr>
                  <tr><td>Inference Route</td><td>{telemetry.inference.active_backend}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="panel-card">
              <h4>Defensive Security Audit Trail</h4>
              {securityEvents.slice(0, 8).map((e, i) => (
                <div key={i} style={{ padding: '5px 0', borderBottom: '1px solid rgba(119,153,165,0.12)' }}>
                  <span
                    className={`badge ${e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'hypothesis' : 'fact'}`}
                  >
                    {e.category}
                  </span>
                  <p style={{ marginTop: 3 }}>{e.message}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
