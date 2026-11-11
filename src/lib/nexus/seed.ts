/**
 * JARVIS NEXUS — canonical seed content: 12 spatial zones, 15 operational modes,
 * 7 owner switches, scenario definitions, specialist agents, initial memories & goals.
 * Ported verbatim from the approved reference repository baseline.
 */

export interface ZoneDef {
  id: string;
  label: string;
  x: number;
  z: number;
  yaw: number;
  look_target: [number, number, number];
  camera_preset: string;
  description: string;
}

export const SPATIAL_ZONES: Record<string, ZoneDef> = {
  central_operations: {
    id: 'central_operations',
    label: 'Central Operations Holo-Ring',
    x: 1.45, z: 0.95, yaw: -0.42,
    look_target: [0.0, 1.25, 0.0],
    camera_preset: 'living_presence',
    description: 'Primary circular obsidian holo-table and master assembly workspace.',
  },
  simulation_stage: {
    id: 'simulation_stage',
    label: 'Volumetric Simulation & Scenario Stage',
    x: 0.0, z: 1.85, yaw: 0.0,
    look_target: [0.0, 1.4, 4.8],
    camera_preset: 'scenario_stage',
    description: 'Recessed emitter floor for room-scale 3D LiDAR reconstructions and parallel physics simulations.',
  },
  memory_archive: {
    id: 'memory_archive',
    label: 'Memory Archive Colonnade',
    x: -6.2, z: -1.2, yaw: 1.32,
    look_target: [-7.8, 1.55, -1.5],
    camera_preset: 'memory_archive',
    description: 'Crystalline smoked-glass optical columns separating verified facts from provisional hypotheses.',
  },
  research_area: {
    id: 'research_area',
    label: 'Live Research Alcove',
    x: -5.3, z: -5.6, yaw: 0.72,
    look_target: [-6.5, 1.5, -6.9],
    camera_preset: 'research',
    description: 'Multi-plane primary literature, empirical telemetry curves, and citation provenance bay.',
  },
  goals_projects: {
    id: 'goals_projects',
    label: 'Goals & Ongoing Work Bay',
    x: -2.6, z: -6.8, yaw: 0.25,
    look_target: [-3.0, 1.55, -8.2],
    camera_preset: 'goals_projects',
    description: 'Z-depth dependency DAG and scheduled autonomous work timeline.',
  },
  agent_collaboration: {
    id: 'agent_collaboration',
    label: 'Multi-Agent Collaboration Table',
    x: 2.7, z: -6.6, yaw: -0.32,
    look_target: [3.2, 1.45, -8.0],
    camera_preset: 'collaboration',
    description: 'Radial workspace coordinating specialist Systems, Research, Audit, and Simulation agents.',
  },
  media_presentation: {
    id: 'media_presentation',
    label: 'Architectural Media & Video Wall',
    x: 4.55, z: -4.55, yaw: -0.58,
    look_target: [6.9, 1.85, -5.8],
    camera_preset: 'video_presentation',
    description: 'Frameless 4.8m media wall where JARVIS stands beside video evidence to extract 3D reconstructions.',
  },
  defensive_security: {
    id: 'defensive_security',
    label: 'Defensive Security Vault',
    x: 6.4, z: 0.45, yaw: -1.35,
    look_target: [8.1, 1.55, 0.5],
    camera_preset: 'security_alert',
    description: 'Titanium security bulkhead and 3D network-perimeter quarantine lattice.',
  },
  vision_station: {
    id: 'vision_station',
    label: 'Vision & Optical Input Bay',
    x: 5.4, z: 4.4, yaw: -2.25,
    look_target: [6.8, 1.5, 5.4],
    camera_preset: 'vision_station',
    description: 'Explicit optical input inspection plane with mandatory capture-state badging.',
  },
  diagnostics_telemetry: {
    id: 'diagnostics_telemetry',
    label: 'Diagnostics & Telemetry Station',
    x: -5.4, z: 4.4, yaw: 2.25,
    look_target: [-6.8, 1.5, 5.4],
    camera_preset: 'diagnostics',
    description: 'Hardware, database, latency, and subsystem health instrumentation.',
  },
  compute_connections: {
    id: 'compute_connections',
    label: 'Local PC & Kaggle Compute Bay',
    x: 2.6, z: 6.4, yaw: -2.75,
    look_target: [3.2, 1.45, 7.8],
    camera_preset: 'compute_connections',
    description: 'Local 4-bit CUDA primary worker node and 6-slot encrypted Kaggle outbound tunnel router.',
  },
  embodiment_switches: {
    id: 'embodiment_switches',
    label: 'Owner Switches & Embodiment Bay',
    x: -2.6, z: 6.4, yaw: 2.75,
    look_target: [-3.2, 1.35, 7.8],
    camera_preset: 'owner_switches',
    description: 'Seven hardware-grade owner kill switches and live holographic/device projection sync.',
  },
};

export interface ModeDef {
  id: string;
  index: number;
  label: string;
  zone: string;
  camera: string;
}

export const OPERATIONAL_MODES: ModeDef[] = [
  { id: 'wake_auth', index: 1, label: 'Wake & Initialization', zone: 'central_operations', camera: 'arrival_wake' },
  { id: 'living_presence', index: 2, label: 'Living Presence', zone: 'central_operations', camera: 'living_presence' },
  { id: 'conversational_focus', index: 3, label: 'Conversational Focus', zone: 'central_operations', camera: 'conversation' },
  { id: 'memory_exploration', index: 4, label: 'Memory Exploration', zone: 'memory_archive', camera: 'memory_archive' },
  { id: 'goals_ongoing_work', index: 5, label: 'Goals & Ongoing Work', zone: 'goals_projects', camera: 'goals_projects' },
  { id: 'multi_agent_collaboration', index: 6, label: 'Multi-Agent Collaboration', zone: 'agent_collaboration', camera: 'collaboration' },
  { id: 'tools_execution', index: 7, label: 'Tools & Guarded Execution', zone: 'diagnostics_telemetry', camera: 'diagnostics' },
  { id: 'live_research', index: 8, label: 'Live Research', zone: 'research_area', camera: 'research' },
  { id: 'simulation_comparison', index: 9, label: 'Simulation & Scenario Director', zone: 'simulation_stage', camera: 'scenario_stage' },
  { id: 'vision_understanding', index: 10, label: 'Vision & Optical Input', zone: 'vision_station', camera: 'vision_station' },
  { id: 'defensive_security', index: 11, label: 'Defensive Security', zone: 'defensive_security', camera: 'security_alert' },
  { id: 'telemetry_diagnostics', index: 12, label: 'Telemetry & Diagnostics', zone: 'diagnostics_telemetry', camera: 'diagnostics' },
  { id: 'connections_compute', index: 13, label: 'Connections & Private Compute', zone: 'compute_connections', camera: 'compute_connections' },
  { id: 'digital_human_embodiment', index: 14, label: 'Digital-Human Embodiment', zone: 'embodiment_switches', camera: 'conversation' },
  { id: 'holographic_presence', index: 15, label: 'Physical Holographic Presence', zone: 'simulation_stage', camera: 'hologram_prism' },
];

export const DEFAULT_SWITCHES = [
  {
    switchKey: 'master',
    label: 'Master Operational Power',
    enabled: true,
    description: 'Halts all active capture, autonomous work, remote compute, and tool execution while retaining safe reactivation.',
    enforcementScope: 'All active sensors, background schedulers, workers, and execution pipelines.',
  },
  {
    switchKey: 'microphone',
    label: 'Microphone Capture',
    enabled: false,
    description: 'Controls live audio input acquisition. Disabled by default until explicitly enabled by owner.',
    enforcementScope: 'Browser MediaStream audio tracks and CORE voice transcription endpoint.',
  },
  {
    switchKey: 'camera',
    label: 'Optical Camera Capture',
    enabled: false,
    description: 'Controls live camera acquisition for Vision mode. Never captures silently in background.',
    enforcementScope: 'Browser video capture tracks and CORE vision analysis adapter.',
  },
  {
    switchKey: 'autonomy',
    label: 'Authorised Autonomy',
    enabled: true,
    description: 'Permits scheduled goal progression and background verification within defined boundaries.',
    enforcementScope: 'Autonomous goal scheduler and background specialist agent runs.',
  },
  {
    switchKey: 'remote_compute',
    label: 'Remote Kaggle Compute',
    enabled: true,
    description: 'Permits routing inference jobs over outbound authenticated WebSocket to private Kaggle GPU sessions.',
    enforcementScope: 'Kaggle GPU worker dispatch queue in the inference router.',
  },
  {
    switchKey: 'computer_control',
    label: 'Guarded Computer Control',
    enabled: true,
    description: 'Permits allowlisted diagnostic and workspace tool execution (destructive actions still require explicit confirmation).',
    enforcementScope: 'GuardedToolRunner internal and external execution endpoints.',
  },
  {
    switchKey: 'embodiment',
    label: '3D & Holographic Embodiment',
    enabled: true,
    description: 'Enables real-time 3D character rendering, speech synthesis, MetaHuman bridge, and holographic projection output.',
    enforcementScope: "3D character viewport, Pepper's Ghost hologram view, and embodiment broadcast stream.",
  },
];

export const SEED_SCENARIOS = [
  {
    id: 'cryo_manifold_forensic',
    title: 'Cryogenic Manifold Cascade — Forensic Reconstruction',
    classification: 'source_backed_reconstruction',
    summary:
      'Room-scale 18,000-point LiDAR voxel reconstruction separating measured pressure/thermal sensor telemetry [Fact] from harmonic valve-seat fatigue [Inference], with wireframe technician trajectories and branching pressure-relief variables.',
    durationSec: 20.0,
    variables: [
      { key: 'line_pressure_mpa', label: 'Manifold Line Pressure (MPa)', min: 110, max: 240, default: 210, step: 5, unit: 'MPa' },
      { key: 'relief_valve_ms', label: 'Bypass Valve Actuation Delay (ms)', min: 15, max: 180, default: 125, step: 5, unit: 'ms' },
    ],
    branches: [
      {
        id: 'catastrophic_shear',
        condition: 'line_pressure_mpa >= 185 and relief_valve_ms > 70',
        label: 'Observed Event: Flange Shear at T-00.0s (210 MPa)',
        outcome: 'Acoustic shockwave induces 210 MPa hoop stress at Flange B-4; fracture vector propagates 34 deg NE.',
        severity: 'critical',
      },
      {
        id: 'controlled_bypass',
        condition: 'otherwise',
        label: 'Counterfactual Branch: Sub-70ms Relief Venting',
        outcome: 'Peak transient damped to <= 152 MPa; structural margin preserved at 1.42x yield strength.',
        severity: 'nominal',
      },
    ],
    timeline: [
      { t: 0.0, phase: 'Baseline Laminar Cryo Flow', camera: 'scenario_wide', narration: 'At T minus 6 seconds, manifold flow is nominal at 138 MPa. Notice the cyan voxel cloud represents verified laser-scan geometry.' },
      { t: 5.5, phase: 'Acoustic Oscillation Onset [Inference]', camera: 'scenario_actor_track', narration: 'At T minus 2.8 seconds, sensor S-4 records a 410 Hz vibration spike. Technician A moves toward manual isolation.' },
      { t: 11.2, phase: 'Critical Flange Stress Spike [Measured Fact]', camera: 'scenario_origin_closeup', narration: 'Here at T minus 1.4 seconds—pausing playback—thermal imaging confirms 180 degrees Celsius friction heating right at the B-4 collar before rupture.' },
      { t: 16.0, phase: 'Branching Mitigation Comparison', camera: 'scenario_wide', narration: 'Adjust the valve actuation delay below 70 milliseconds to see how early venting eliminates the fracture cascade.' },
    ],
    actorsProps: {
      voxel_structure: 'cryo_manifold_riser',
      wireframe_actors: [
        { id: 'tech_alpha', label: 'Actor A (Inspection Path)', start: [-2.1, 0.0, 1.4], end: [-1.05, 0.0, 1.75] },
        { id: 'tech_beta', label: 'Actor B (Isolation Console)', start: [2.0, 0.0, 1.9], end: [1.35, 0.0, 1.65] },
      ],
      causal_vectors: [
        { origin: [0.15, 1.45, 1.85], direction: [0.78, 0.34, 0.52], label: '210 MPa Shear Vector [Measured]', epistemic: 'verified_fact' },
        { origin: [0.0, 1.15, 1.85], direction: [-0.35, 0.65, 0.15], label: 'Seat Cavitation [Inference: p=0.84]', epistemic: 'hypothesis' },
      ],
    },
    evidenceNotes: [
      { kind: 'verified_fact', text: 'Strain gauge SG-09 logged 210.4 MPa peak 80 ms prior to loss of telemetry.' },
      { kind: 'hypothesis', text: 'Micro-cavitation on primary check-valve seat inferred from 410 Hz FFT harmonic.' },
    ],
  },
  {
    id: 'dual_turbine_sim',
    title: 'Parallel Turbine Stator Comparison — Variant A vs Variant B',
    classification: 'data_driven_simulation',
    summary:
      'Side-by-side coupled aerodynamic & thermal simulation comparing swept stator geometry (Variant A, laminar cyan) against conventional straight vanes (Variant B, turbulent amber).',
    durationSec: 16.0,
    variables: [
      { key: 'rotor_rpm', label: 'Shaft Speed (RPM)', min: 4000, max: 16000, default: 11500, step: 500, unit: 'RPM' },
      { key: 'inlet_temp_k', label: 'Turbine Inlet Temp (K)', min: 950, max: 1550, default: 1320, step: 25, unit: 'K' },
    ],
    branches: [
      {
        id: 'variant_a_optimal',
        condition: 'inlet_temp_k <= 1450',
        label: 'Variant A Maintains Attached Boundary Layer',
        outcome: 'Variant A reduces blade-tip thermal creep by 28.4% with +3.1% adiabatic efficiency.',
        severity: 'nominal',
      },
      {
        id: 'thermal_limit_exceeded',
        condition: 'otherwise',
        label: 'Both Variants Exceed TBC Coating Margin',
        outcome: 'Above 1450 K without film-cooling augmentation, both geometries breach creep threshold.',
        severity: 'warning',
      },
    ],
    timeline: [
      { t: 0.0, phase: 'Cold Spool Baseline', camera: 'scenario_wide', narration: 'Both stator assemblies initialize at identical mass-flow boundary conditions.' },
      { t: 6.0, phase: 'Vortex Shedding Divergence', camera: 'scenario_origin_closeup', narration: 'Notice Variant B on the right developing amber hub-corner stall vortices above 10,500 RPM.' },
      { t: 12.0, phase: 'Steady-State Efficiency Delta', camera: 'scenario_wide', narration: 'Variant A sustains laminar attachment across the shroud ring. I recommend locking Variant A for prototype fabrication.' },
    ],
    actorsProps: {
      voxel_structure: 'dual_turbines',
      wireframe_actors: [],
      causal_vectors: [
        { origin: [-1.35, 1.45, 1.85], direction: [0.0, 0.0, 1.0], label: 'Variant A: Re=4.1e5 Laminar', epistemic: 'verified_fact' },
        { origin: [1.35, 1.45, 1.85], direction: [0.25, 0.35, 0.85], label: 'Variant B: Tip Vortex Loss 6.8%', epistemic: 'verified_fact' },
      ],
    },
    evidenceNotes: [
      { kind: 'verified_fact', text: 'Coupled 1D/2D compressible nozzle-stator equations integrated live at 60 Hz.' },
    ],
  },
  {
    id: 'zerotrust_compute_flow',
    title: 'Zero-Trust Private Compute & Outbound Kaggle Tunnel',
    classification: 'illustration',
    summary:
      'Interactive 3D system architecture demonstrating why JARVIS NEXUS rejects inbound public ports on remote GPUs in favor of outbound authenticated WebSockets.',
    durationSec: 14.0,
    variables: [
      { key: 'expose_public_port', label: 'Simulate Public Port Exposure (0=Zero-Trust, 1=Exposed)', min: 0, max: 1, default: 0, step: 1, unit: 'mode' },
    ],
    branches: [
      {
        id: 'zerotrust_secure',
        condition: 'expose_public_port == 0',
        label: 'Outbound Authenticated Tunnel Active',
        outcome: 'Kaggle GPU dials outbound with JARVIS_WORKER_TOKEN; unsolicited external probes drop at perimeter.',
        severity: 'nominal',
      },
      {
        id: 'public_port_compromise',
        condition: 'otherwise',
        label: 'Failure Demonstration: Exposed Tunnel Endpoint',
        outcome: 'Scanner traffic reaches unauthenticated tunnel proxy within 9 seconds; prompts & weights exposed.',
        severity: 'critical',
      },
    ],
    timeline: [
      { t: 0.0, phase: 'Sanctuary CORE Dispatch', camera: 'scenario_wide', narration: 'CORE prefers your local 4-bit CUDA GPU worker first, keeping prompts entirely inside local memory.' },
      { t: 5.0, phase: 'Outbound Kaggle Handshake', camera: 'scenario_origin_closeup', narration: 'When remote compute is authorised, the Kaggle session initiates an outbound TLS WebSocket using Kaggle Secrets.' },
      { t: 10.0, phase: 'Attack Surface Comparison', camera: 'scenario_wide', narration: 'Toggle Public Port Exposure to see why unauthenticated ngrok-style ports fail under automated probing.' },
    ],
    actorsProps: { voxel_structure: 'network_topology', wireframe_actors: [], causal_vectors: [] },
    evidenceNotes: [
      { kind: 'verified_fact', text: 'Architectural illustration of CORE inference routing rules.' },
    ],
  },
];

export const SEED_AGENTS = [
  {
    id: 'agent_architect',
    name: 'Systems Architect',
    roleSummary: 'Evaluates repository structure, module boundaries, database schemas, and architectural trade-offs.',
    allowedTools: ['inspect_workspace', 'check_runtime_health', 'verify_migrations'],
    permissionBoundary: 'Read-only workspace & schema inspection; zero external network or file deletion.',
    status: 'idle',
  },
  {
    id: 'agent_researcher',
    name: 'Empirical Researcher',
    roleSummary: 'Synthesizes workspace documents, technical telemetry, and source-backed evidence while flagging unverified claims.',
    allowedTools: ['search_memories', 'inspect_workspace', 'run_parametric_sweep'],
    permissionBoundary: 'Read-only memory & simulation parameter sweeps; cannot promote hypothesis to fact unilaterally.',
    status: 'idle',
  },
  {
    id: 'agent_security',
    name: 'Security & Integrity Auditor',
    roleSummary: 'Audits owner switch enforcement, secret encryption hygiene, worker authentication tokens, and tool logs.',
    allowedTools: ['audit_security_posture', 'check_runtime_health'],
    permissionBoundary: 'Defensive posture verification only; strictly non-offensive.',
    status: 'idle',
  },
  {
    id: 'agent_simulation',
    name: 'Simulation & Scenario Analyst',
    roleSummary: 'Executes differential-equation engineering sweeps and prepares 3D volumetric scenarios for JARVIS.',
    allowedTools: ['run_parametric_sweep', 'list_scenarios'],
    permissionBoundary: 'Sandboxed mathematical solver only.',
    status: 'idle',
  },
];

export const SEED_MEMORIES = [
  {
    category: 'preference',
    epistemicStatus: 'owner_stated',
    title: 'Direct Executive Communication & Spatial Demonstration',
    content:
      "Owner prefers direct, candid technical analysis without filler or moralising, backed by interactive 3D volumetric reconstructions ('Let me show you') when diagnosing complex systems.",
    confidence: 1.0,
    sourceRef: 'Owner Baseline Directive',
    projectTag: 'JARVIS_NEXUS',
  },
  {
    category: 'project',
    epistemicStatus: 'verified_fact',
    title: 'JARVIS NEXUS Persistent Sanctuary Architecture',
    content:
      'Core architecture separates the Three.js real-time 3D world & rigged character performance from Next.js orchestration, typed persistence, and private Local/Kaggle GPU inference workers.',
    confidence: 1.0,
    sourceRef: 'CORE orchestration layer',
    projectTag: 'JARVIS_NEXUS',
  },
  {
    category: 'source_research',
    epistemicStatus: 'source_backed',
    title: '4-Bit NF4 Quantisation Memory Budget for Qwen2.5-14B',
    content:
      'huihui-ai/Qwen2.5-14B-Instruct-abliterated in 4-bit NF4 requires ~9.2 GB VRAM for weights plus KV-cache headroom, fitting comfortably on a 16 GB local GPU or dual-T4 Kaggle session.',
    confidence: 0.96,
    sourceRef: 'worker hardware estimator',
    projectTag: 'Inference',
  },
  {
    category: 'agent_finding',
    epistemicStatus: 'hypothesis',
    title: 'Provisional Stator Tip-Clearance Sensitivity',
    content:
      'Preliminary aerodynamic sweep suggests blade-tip clearance above 1.4% chord may trigger early corner stall; pending full mesh convergence verification.',
    confidence: 0.72,
    sourceRef: 'Simulation Analyst Run #01',
    projectTag: 'Propulsion_Study',
  },
];

export const SEED_GOALS = [
  {
    id: 'goal-private-inference',
    title: 'Verify Private Local or Kaggle GPU Inference Link',
    description:
      'Establish authenticated private worker connection (huihui-ai/Qwen2.5-14B-Instruct-abliterated) without relying on commercial APIs.',
    priority: 1,
    status: 'active',
    progress: 40,
    dependsOn: [] as string[],
    scheduleSpec: 'on_boot + continuous_heartbeat',
    assignedZone: 'compute_connections',
    nextAction: 'Awaiting local worker launch or Kaggle Worker Package deployment.',
  },
  {
    id: 'goal-cryo-forensics',
    title: 'Complete Cryogenic Manifold B-4 Root-Cause Validation',
    description: 'Cross-validate strain-gauge SG-09 spike against check-valve cavitation hypothesis in Scenario Director.',
    priority: 2,
    status: 'active',
    progress: 65,
    dependsOn: [] as string[],
    scheduleSpec: 'authorised_background',
    assignedZone: 'simulation_stage',
    nextAction: 'Compare sub-70ms bypass valve branch against measured 210 MPa transient.',
  },
  {
    id: 'goal-stator-prototype',
    title: 'Lock Swept Turbine Stator Variant A Geometry',
    description: 'Finalize Variant A laminar stator specification once thermal creep margin is reviewed by Owner.',
    priority: 3,
    status: 'pending',
    progress: 20,
    dependsOn: ['goal-cryo-forensics'],
    scheduleSpec: 'milestone_gated',
    assignedZone: 'research_area',
    nextAction: 'Blocked on completion of Cryogenic Manifold B-4 thermal cross-check.',
  },
];
