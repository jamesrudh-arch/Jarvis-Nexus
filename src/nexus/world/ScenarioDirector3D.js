/**
 * JARVIS NEXUS — Volumetric 3D Scenario Director ("Let Me Show You"). v2
 *
 * Iron-Man-style forensic scene reconstruction, upgraded to a real structure
 * compiler: scenario definitions are assembled into RECOGNIZABLE machines
 * (pipes with flange rings, valve bodies, support skids, nacelles, server racks)
 * rendered as: dense LiDAR surface point clouds + scanline hologram shells +
 * wireframe edges. Timeline cues drive stress colorography, fracture bursts,
 * shockwaves, documentary camera cuts, and a synchronized explanatory feed on
 * the architectural Media Wall. Verified facts render cyan; hypotheses amber.
 */
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

const CYAN = 0x62e6f2;
const ICE = 0xddfbff;
const AMBER = 0xe7ae5b;
const RED = 0xff6b67;

/** Scanline hologram shell material (fresnel edge boost + scanlines + flicker). */
export class HoloScanMaterial extends THREE.ShaderMaterial {
  constructor(colorHex, { opacity = 0.4, scanDensity = 22, fresnelPower = 2.4 } = {}) {
    super({
      uniforms: {
        uColor: { value: new THREE.Color(colorHex) },
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uScan: { value: scanDensity },
        uFresnelPower: { value: fresnelPower },
      },
      vertexShader: `
        varying vec3 vNormalW; varying vec3 vPosW; varying vec3 vPosL;
        void main() {
          vPosL = position;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vPosW = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uTime, uOpacity, uScan, uFresnelPower;
        varying vec3 vNormalW; varying vec3 vPosW; varying vec3 vPosL;
        void main() {
          vec3 V = normalize(cameraPosition - vPosW);
          float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), uFresnelPower);
          float scan = 0.82 + 0.18 * sin(vPosL.y * uScan * 6.2831 - uTime * 2.4);
          float flick = 0.93 + 0.07 * sin(uTime * 29.0) * sin(uTime * 17.3);
          float a = (0.18 + 0.82 * fres) * scan * flick * uOpacity;
          gl_FragColor = vec4(uColor * (0.5 + 0.95 * fres), a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
  }
}

/** Simple safe condition evaluator for branch rules ("key <= 1450" / "otherwise"). */
function evalBranchCondition(cond, vars) {
  if (!cond || cond === 'otherwise') return true;
  const parts = cond.split('||');
  for (const part of parts) {
    const m = part.trim().match(/^(\w+)\s*(<=|>=|==|!=|<|>)\s*(-?[\d.]+)$/);
    if (!m) continue;
    const val = Number(vars[m[1]]);
    const ref = Number(m[3]);
    const op = m[2];
    if (op === '<=') { if (val <= ref) return true; }
    else if (op === '>=') { if (val >= ref) return true; }
    else if (op === '==') { if (val === ref) return true; }
    else if (op === '!=') { if (val !== ref) return true; }
    else if (op === '<') { if (val < ref) return true; }
    else if (op === '>') { if (val > ref) return true; }
  }
  return false;
}

export class ScenarioDirector3D {
  constructor(scene) {
    this.scene = scene;
    this.stageRoot = new THREE.Group();
    this.stageRoot.name = 'ScenarioDirector_StageRoot';
    this.stageRoot.visible = false;
    this.scene.add(this.stageRoot);

    // Interactive volumetric light cast onto JARVIS and floor during active scenarios
    this.stageLight = new THREE.PointLight(CYAN, 0.0, 9.5, 1.5);
    this.stageLight.position.set(0, 1.85, 1.85);
    this.scene.add(this.stageLight);

    this.cameraDirector = null; // wired by NexusSanctuaryScene
    this.activeScenario = null;
    this.currentTime = 0;
    this.duration = 20;
    this.playing = false;
    this.playbackRate = 1.0;
    this.variables = {};
    this.worldAnchors = []; // [{ pos, title, sub, amber }]
    this.holoMats = [];     // all HoloScanMaterials for uTime updates
    this.updatables = [];   // per-template animated handles
    this.lastCueIndex = -1;
    this.originPoint = new THREE.Vector3(0.15, 1.4, 1.85);
    this.clock = 0;
  }

  attachCameraDirector(cd) {
    this.cameraDirector = cd;
  }

  loadScenario(scenarioDef, runtimeState = {}) {
    this.clearStage();
    this.activeScenario = scenarioDef;
    this.duration = scenarioDef.duration_sec || scenarioDef.durationSec || 20.0;
    this.currentTime = runtimeState.current_time || 0.0;
    this.playing = runtimeState.playing !== undefined ? runtimeState.playing : true;
    this.playbackRate = runtimeState.playback_rate || 1.0;
    this.variables = { ...(runtimeState.variables || {}) };
    // Fill defaults from the schema so sliders always have values
    for (const v of scenarioDef.variables || []) {
      if (this.variables[v.key] === undefined) this.variables[v.key] = v.default;
    }
    this.lastCueIndex = -1;

    this.stageRoot.visible = true;
    this.stageLight.intensity = 2.4;

    this._buildStageEmitter();

    const kind = scenarioDef.actors_props?.voxel_structure || 'cryo_manifold_riser';
    if (kind === 'cryo_manifold_riser') this._buildCryoManifoldForensic();
    else if (kind === 'dual_turbines') this._buildDualTurbineComparison();
    else this._buildZeroTrustComputeTopology();

    this._buildCausalVectors();
    this._applyCueCamera(true);
  }

  clearStage() {
    while (this.stageRoot.children.length > 0) {
      const child = this.stageRoot.children[0];
      this.stageRoot.remove(child);
      child.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
    this.holoMats = [];
    this.updatables = [];
    this.worldAnchors = [];
    this.activeScenario = null;
    this.playing = false;
    this.stageRoot.visible = false;
    this.stageLight.intensity = 0.0;
    this.lastCueIndex = -1;
  }

  updateVariables(vars) {
    this.variables = { ...this.variables, ...vars };
  }

  // ------------------------------------------------------------------
  // Structure compiler — parts library
  // ------------------------------------------------------------------
  _holoMat(colorHex, opts) {
    const m = new HoloScanMaterial(colorHex, opts);
    this.holoMats.push(m);
    return m;
  }

  _addPart(mesh, { lidar = 0, lidarColor = CYAN, edges = true, edgeOpacity = 0.5 } = {}) {
    mesh.material = mesh.material instanceof HoloScanMaterial ? mesh.material : mesh.material;
    this.stageRoot.add(mesh);
    if (edges) {
      const e = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 24),
        new THREE.LineBasicMaterial({ color: 0x9fe8f2, transparent: true, opacity: edgeOpacity })
      );
      e.position.copy(mesh.position);
      e.quaternion.copy(mesh.quaternion);
      e.scale.copy(mesh.scale);
      this.stageRoot.add(e);
    }
    if (lidar > 0) {
      this._sampleLiDAR(mesh, lidar, lidarColor);
    }
    return mesh;
  }

  _sampleLiDAR(mesh, count, colorHex) {
    try {
      const sampler = new MeshSurfaceSampler(mesh).build();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const c = new THREE.Color(colorHex);
      const cAlt = new THREE.Color(colorHex === CYAN ? ICE : AMBER);
      const p = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        sampler.sample(p);
        positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z;
        const cc = Math.random() > 0.92 ? cAlt : c;
        colors[i * 3] = cc.r; colors[i * 3 + 1] = cc.g; colors[i * 3 + 2] = cc.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.024, vertexColors: true, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      this.stageRoot.add(pts);
    } catch { /* non-mesh or degenerate */ }
  }

  _pipe(from, to, radius, { color = CYAN, lidar = 2200, mat = null } = {}) {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(radius, radius, len, 18, 1, true);
    const mesh = new THREE.Mesh(geo, mat || this._holoMat(color, { opacity: 0.3 }));
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this._addPart(mesh, { lidar, lidarColor: color });
    return mesh;
  }

  _flange(at, radius, { color = CYAN, lidar = 900, mat = null } = {}) {
    const geo = new THREE.TorusGeometry(radius, radius * 0.16, 10, 28);
    const mesh = new THREE.Mesh(geo, mat || this._holoMat(color, { opacity: 0.5 }));
    mesh.position.set(...at);
    mesh.rotation.x = Math.PI / 2;
    this._addPart(mesh, { lidar, lidarColor: color, edgeOpacity: 0.65 });
    return mesh;
  }

  _valve(at, size, { color = CYAN } = {}) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.72, size * 0.6), this._holoMat(color, { opacity: 0.42 }));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.09, size * 0.09, size * 0.7, 10), this._holoMat(color, { opacity: 0.42 }));
    stem.position.y = size * 0.55;
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(size * 0.3, size * 0.055, 8, 22), this._holoMat(ICE, { opacity: 0.6 }));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.y = size * 0.95;
    g.add(body, stem, wheel);
    g.position.set(...at);
    this.stageRoot.add(g);
    for (const m of [body, stem, wheel]) this._sampleLiDAR(m, 420, color);
    g.userData.wheel = wheel;
    return g;
  }

  _supportFrame(at, height, width, { color = ICE } = {}) {
    const g = new THREE.Group();
    const mat = this._holoMat(color, { opacity: 0.26 });
    const legGeo = new THREE.BoxGeometry(0.05, height, 0.05);
    for (const dx of [-width / 2, width / 2]) {
      const leg = new THREE.Mesh(legGeo, mat);
      leg.position.set(dx, height / 2, 0);
      g.add(leg);
    }
    const cross = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.05), mat);
    cross.position.set(0, height - 0.06, 0);
    g.add(cross);
    const cross2 = cross.clone(); cross2.position.y = height * 0.45; g.add(cross2);
    g.position.set(...at);
    this.stageRoot.add(g);
    for (const m of g.children) this._sampleLiDAR(m, 260, color);
    return g;
  }

  _gratingPlatform(center, w, d, { color = ICE } = {}) {
    const g = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), this._holoMat(color, { opacity: 0.2 }));
    g.add(plate);
    // grating bars
    const barMat = new THREE.LineBasicMaterial({ color: 0x9fe8f2, transparent: true, opacity: 0.4 });
    const pts = [];
    for (let x = -w / 2; x <= w / 2 + 0.001; x += 0.22) {
      pts.push(new THREE.Vector3(x, 0.026, -d / 2), new THREE.Vector3(x, 0.026, d / 2));
    }
    for (let z = -d / 2; z <= d / 2 + 0.001; z += 0.22) {
      pts.push(new THREE.Vector3(-w / 2, 0.026, z), new THREE.Vector3(w / 2, 0.026, z));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), barMat);
    g.add(lines);
    g.position.set(...center);
    this.stageRoot.add(g);
    this._sampleLiDAR(plate, 1600, color);
    return g;
  }

  _serverRack(at, { color = CYAN } = {}) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.55), this._holoMat(color, { opacity: 0.24 }));
    shell.position.y = 0.75;
    g.add(shell);
    const ledMat = new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.95 });
    const leds = [];
    for (let s = 0; s < 7; s++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.46), this._holoMat(color, { opacity: 0.18, scanDensity: 40 }));
      slab.position.y = 0.18 + s * 0.19;
      g.add(slab);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.018, 0.02), ledMat.clone());
      led.position.set(0, 0.18 + s * 0.19 + 0.07, 0.245);
      g.add(led);
      leds.push(led);
    }
    g.position.set(...at);
    this.stageRoot.add(g);
    this._sampleLiDAR(shell, 1500, color);
    g.userData.leds = leds;
    return g;
  }

  _createWireframeScenarioActor(colorHex) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.55 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), mat);
    head.position.y = 1.64;
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.58, 10, 2), mat);
    torso.position.y = 1.22;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.88, 8, 2), mat);
    legs.position.y = 0.46;
    g.add(head, torso, legs);
    // small base ring so actors read as volumetric
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.24, 0.27, 24),
      new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    g.add(ring);
    return g;
  }

  // ------------------------------------------------------------------
  // Stage emitter (floor projection ring — anchors the hologram in the room)
  // ------------------------------------------------------------------
  _buildStageEmitter() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.42, 2.52, 72),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0.15, 0.012, 1.85);
    this.stageRoot.add(ring);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(2.42, 48),
      new THREE.MeshBasicMaterial({ color: 0x0a2a33, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(0.15, 0.01, 1.85);
    this.stageRoot.add(disc);

    // tick marks
    const tickMat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.55 });
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(0.15 + Math.cos(a) * 2.32, 0.013, 1.85 + Math.sin(a) * 2.32),
        new THREE.Vector3(0.15 + Math.cos(a) * (i % 6 === 0 ? 2.16 : 2.24), 0.013, 1.85 + Math.sin(a) * (i % 6 === 0 ? 2.16 : 2.24))
      );
    }
    this.stageRoot.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), tickMat));
  }

  // ------------------------------------------------------------------
  // Template A — Cryogenic Manifold Forensic Skid
  // ------------------------------------------------------------------
  _buildCryoManifoldForensic() {
    // Main vertical riser with flanges (stress-ramped color)
    this.stressMat = this._holoMat(CYAN, { opacity: 0.4 });
    const riser = this._pipe([0.15, 0.14, 1.85], [0.15, 1.78, 1.85], 0.24, { mat: this.stressMat, lidar: 3200, color: CYAN });
    this.flangeMat = this._holoMat(CYAN, { opacity: 0.55 });
    this._flange([0.15, 0.52, 1.85], 0.33, { mat: this.flangeMat });
    this._flange([0.15, 2.32, 1.85], 0.3, { mat: this.flangeMat });
    this.b4 = this._flange([0.15, 1.4, 1.85], 0.35, { mat: this.flangeMat, color: AMBER, lidar: 1100 });

    // Horizontal cross-header with end flanges + two isolation valves
    this._pipe([-1.7, 1.78, 1.85], [2.0, 1.78, 1.85], 0.18, { lidar: 2600 });
    this._flange([-1.72, 1.78, 1.85], 0.27, {});
    this._flange([2.02, 1.78, 1.85], 0.27, {});
    this._valve([-0.85, 1.78, 1.85], 0.4);
    this._valve([1.1, 1.78, 1.85], 0.4);

    // Vent riser + relief valve on top
    this._pipe([0.15, 1.78, 1.85], [0.15, 2.6, 1.85], 0.12, { lidar: 900 });
    this.reliefValve = this._valve([0.15, 2.72, 1.85], 0.34, { color: ICE });

    // Support skid + grating
    this._supportFrame([-1.3, 0, 1.85], 1.78, 0.7);
    this._supportFrame([1.55, 0, 1.85], 1.78, 0.7);
    this._gratingPlatform([0.15, 0.045, 1.85], 4.3, 1.5);

    // Instrumentation nodes (sensor SG-09 amber near B-4)
    const sg = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), new THREE.MeshBasicMaterial({ color: AMBER }));
    sg.position.set(0.15, 1.62, 1.62);
    this.stageRoot.add(sg);
    const s4 = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), new THREE.MeshBasicMaterial({ color: ICE }));
    s4.position.set(-0.85, 2.05, 1.62);
    this.stageRoot.add(s4);

    // Scenario actors from the definition (inspection paths)
    this.actors = [];
    const actorsDef = this.activeScenario?.actors_props?.wireframe_actors || [
      { id: 'tech_alpha', start: [-2.2, 0, 1.4], end: [-0.95, 0, 1.75] },
      { id: 'tech_beta', start: [2.15, 0, 2.05], end: [1.35, 0, 1.7] },
    ];
    for (const a of actorsDef) {
      const actor = this._createWireframeScenarioActor(CYAN);
      this.stageRoot.add(actor);
      this.actors.push({
        group: actor,
        start: new THREE.Vector3(...(a.start || [-2, 0, 1.6])),
        end: new THREE.Vector3(...(a.end || [1.4, 0, 1.8])),
      });
      // motion trajectory spline
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.start?.[0] ?? -2, 0.95, a.start?.[2] ?? 1.5),
        new THREE.Vector3((a.start?.[0] + a.end?.[0]) * 0.5, 1.08, (a.start?.[2] + a.end?.[2]) * 0.5 + 0.18),
        new THREE.Vector3(a.end?.[0] ?? 1.2, 1.02, a.end?.[2] ?? 1.8),
      ]);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
      this.stageRoot.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.45 })));
    }

    // Amber fracture shard burst + causal force vector + shockwave at B-4
    const burstGroup = new THREE.Group();
    burstGroup.position.set(0.15, 1.4, 1.85);
    const shardMat = new THREE.MeshBasicMaterial({ color: AMBER, wireframe: true, transparent: true, opacity: 0.9 });
    const shards = [];
    for (let s = 0; s < 30; s++) {
      const sGeo = new THREE.TetrahedronGeometry(0.035 + Math.random() * 0.075, 0);
      const mesh = new THREE.Mesh(sGeo, shardMat);
      const dir = new THREE.Vector3(0.5 + Math.random() * 0.95, (Math.random() - 0.35) * 0.85, (Math.random() - 0.25) * 0.8).normalize();
      mesh.userData = { dir, speed: 0.3 + Math.random() * 0.7 };
      burstGroup.add(mesh);
      shards.push(mesh);
    }
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0.78, 0.34, 0.52).normalize(), new THREE.Vector3(0, 0, 0), 0.95, AMBER, 0.22, 0.12);
    burstGroup.add(arrow);
    this.stageRoot.add(burstGroup);

    // Hairline crack glow at B-4 — intensifies with stress so the timeline state
    // is readable on the geometry BEFORE the rupture event fires
    const crackGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 16, 16),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    crackGlow.position.set(0.15, 1.4, 1.85);
    this.stageRoot.add(crackGlow);

    const shockwave = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.02, 8, 64),
      new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0 })
    );
    shockwave.rotation.x = Math.PI / 2;
    shockwave.position.set(0.15, 1.4, 1.85);
    shockwave.visible = false;
    this.stageRoot.add(shockwave);

    this.updatables.push((dt, refs) => {
      const normT = refs.normT;
      const pLine = Number(this.variables.line_pressure_mpa ?? 210);
      const delayMs = Number(this.variables.relief_valve_ms ?? 125);
      const mitigated = pLine < 185 || delayMs <= 70;
      const ruptureAt = 11.2;
      const ruptured = !mitigated && refs.t >= ruptureAt;

      // Stress colorography on the riser (cyan → amber as stress builds), readable
      // from T+3.5s, with the hologram shell brightening under load
      const stress = mitigated
        ? Math.min(0.35, (refs.t / refs.duration) * 0.35)
        : THREE.MathUtils.clamp((refs.t - 3.5) / (ruptureAt - 3.5), 0, 1);
      const stressColor = new THREE.Color(CYAN).lerp(new THREE.Color(AMBER), stress);
      refs.that.stressMat.uniforms.uColor.value.copy(stressColor);
      refs.that.stressMat.uniforms.uOpacity.value = 0.4 + stress * 0.45;
      refs.that.flangeMat.uniforms.uColor.value.copy(stressColor);
      refs.that.stageLight.color.copy(stressColor);
      refs.that.stageLight.intensity = 2.4 + stress * 2.2;

      // Hairline crack glow pulses at B-4 as stress rises
      const crackPulse = 0.5 + 0.5 * Math.sin(refs.t * 9);
      crackGlow.material.opacity = mitigated ? 0 : (0.12 + stress * 0.5) * crackPulse;
      crackGlow.scale.setScalar(0.6 + stress * 1.1 + crackPulse * 0.08);

      // Actors walk their inspection paths with a walking bob
      refs.that.actors.forEach((a, i) => {
        const seg = THREE.MathUtils.clamp(normT * 1.55 - i * 0.12, 0, 1);
        const eased = seg * seg * (3 - 2 * seg);
        a.group.position.lerpVectors(a.start, a.end, eased);
        a.group.position.y = Math.abs(Math.sin(refs.t * 7 + i)) * 0.03 * (seg > 0 && seg < 1 ? 1 : 0);
        a.group.rotation.y = Math.atan2(a.end.x - a.start.x, a.end.z - a.start.z);
      });

      // Fracture burst driven by the timeline
      const burstProgress = ruptured ? Math.min(1, (refs.t - ruptureAt) / 2.2) : 0.045;
      burstGroup.visible = !mitigated;
      arrow.setColor(new THREE.Color(mitigated ? CYAN : AMBER));
      for (const sh of shards) {
        sh.position.copy(sh.userData.dir).multiplyScalar(burstProgress * sh.userData.speed);
        sh.rotation.x = burstProgress * 3.4;
        sh.rotation.y = burstProgress * 2.1;
      }

      // Expanding shockwave ring at rupture
      if (ruptured && refs.t - ruptureAt < 2.6) {
        shockwave.visible = true;
        const k = (refs.t - ruptureAt) / 2.6;
        shockwave.scale.setScalar(0.2 + k * 3.2);
        shockwave.material.opacity = 0.75 * (1 - k);
      } else {
        shockwave.visible = false;
      }

      // Relief valve handwheel spins when mitigation is active
      if (refs.that.reliefValve?.userData.wheel) {
        refs.that.reliefValve.userData.wheel.rotation.z += dt * (mitigated ? 6.5 : 0.2);
      }
    });

    this.dynamicRefs = { kind: 'cryo', that: this };
    this.originPoint.set(0.15, 1.4, 1.85);
    this.worldAnchors = [
      { pos: new THREE.Vector3(0.62, 1.62, 1.95), title: 'FLANGE B-4 ORIGIN · 210.4 MPa', sub: 'MEASURED FACT · STRAIN GAUGE SG-09', amber: true },
      { pos: new THREE.Vector3(-0.85, 2.3, 1.72), title: 'VALVE SEAT CAVITATION (410 Hz)', sub: 'INFERENCE · CONFIDENCE p=0.84', amber: false },
      { pos: new THREE.Vector3(0.15, 3.05, 1.85), title: 'RELIEF VALVE RV-2 · ' + (this.variables.relief_valve_ms ?? 125) + ' ms', sub: 'OWNER-ADJUSTABLE MITIGATION', amber: false },
    ];
  }

  // ------------------------------------------------------------------
  // Template B — Parallel Turbine Stator Comparison
  // ------------------------------------------------------------------
  _buildDualTurbineComparison() {
    this.turbines = [];
    const createTurbine = (xOffset, colorHex, swept) => {
      const grp = new THREE.Group();
      grp.position.set(xOffset, 1.42, 1.85);

      // Nacelle body (recognizable engine housing)
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.42, 1.15, 24, 1, true),
        this._holoMat(colorHex, { opacity: 0.3 })
      );
      nacelle.rotation.x = Math.PI / 2;
      grp.add(nacelle);

      // Spinner cone
      const spinner = new THREE.Mesh(
        new THREE.ConeGeometry(0.2, 0.38, 18),
        this._holoMat(ICE, { opacity: 0.5 })
      );
      spinner.rotation.x = -Math.PI / 2;
      spinner.position.z = 0.78;
      grp.add(spinner);

      // Shroud ring
      const shroud = new THREE.Mesh(
        new THREE.TorusGeometry(0.68, 0.045, 10, 40),
        this._holoMat(colorHex, { opacity: 0.5 })
      );
      shroud.position.z = 0.62;
      grp.add(shroud);

      // Rotor blades
      const rotor = new THREE.Group();
      rotor.position.z = 0.58;
      for (let b = 0; b < 16; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.5, 0.13),
          new THREE.MeshBasicMaterial({ color: colorHex, wireframe: true, transparent: true, opacity: 0.85 })
        );
        const ang = (b / 16) * Math.PI * 2;
        blade.position.set(Math.cos(ang) * 0.34, Math.sin(ang) * 0.34, 0);
        blade.rotation.z = ang;
        blade.rotation.y = swept ? 0.34 : 0.05;
        rotor.add(blade);
      }
      grp.add(rotor);

      // Pylon down to the floor
      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 1.42, 0.3),
        this._holoMat(ICE, { opacity: 0.24 })
      );
      pylon.position.set(0, -0.71, -0.2);
      grp.add(pylon);

      this.stageRoot.add(grp);
      this._sampleLiDAR(nacelle, 2400, colorHex);
      this._sampleLiDAR(shroud, 800, colorHex);
      this._sampleLiDAR(pylon, 500, ICE);

      // Hub-corner vortex indicator (amber stress rings near hub)
      const vortex = new THREE.Mesh(
        new THREE.TorusGeometry(0.24, 0.02, 8, 30),
        new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0 })
      );
      vortex.position.z = 0.66;
      grp.add(vortex);

      // Stream ribbons through the engine
      const streams = [];
      const streamMat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.6 });
      for (let s = 0; s < 5; s++) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(
          Array.from({ length: 34 }, (_, i) => new THREE.Vector3(0, 0, 0))
        );
        const line = new THREE.Line(lineGeo, streamMat.clone());
        line.userData.seed = s * 1.7;
        grp.add(line);
        streams.push(line);
      }

      return { grp, rotor, vortex, streams, spinner };
    };

    this.turbines.push(createTurbine(-1.25, CYAN, true));   // Variant A — swept
    this.turbines.push(createTurbine(1.25, AMBER, false));  // Variant B — straight

    this.updatables.push((dt, refs) => {
      const rpm = Number(refs.that.variables.rotor_rpm ?? 11500);
      const tempK = Number(refs.that.variables.inlet_temp_k ?? 1320);
      const omega = (rpm / 11500) * 5.2;
      const wob = (rpm - 10500) / 5500 + Math.max(0, tempK - 1450) / 900;

      refs.that.turbines.forEach((t, ti) => {
        const variantB = ti === 1;
        t.rotor.rotation.z += dt * omega * (variantB ? 0.94 : 1);
        t.spinner.rotation.z += dt * omega * 0.4;

        // Variant B develops amber hub-corner stall above thresholds
        const stall = variantB ? THREE.MathUtils.clamp(wob, 0, 1) : 0;
        t.vortex.material.opacity = stall * (0.5 + 0.3 * Math.sin(refs.t * 9));
        t.vortex.scale.setScalar(1 + stall * 0.5);

        // Stream ribbons: laminar (A) vs turbulent wobble (B)
        for (const line of t.streams) {
          const pos = line.geometry.attributes.position;
          const seed = line.userData.seed;
          for (let i = 0; i < pos.count; i++) {
            const k = i / (pos.count - 1);
            const z = 1.35 - k * 2.5;
            const r = 0.18 + Math.sin(seed + k * 2.2) * 0.14;
            const baseA = Math.sin(seed * 3.1) * Math.PI * 2;
            const wobble = variantB ? Math.sin(k * 18 + refs.t * 12 + seed) * 0.09 * (0.3 + wob) : 0;
            pos.setXYZ(i,
              Math.cos(baseA + k * 0.8) * r + wobble,
              Math.sin(baseA + k * 0.8) * r + wobble * 0.6,
              z
            );
          }
          pos.needsUpdate = true;
          line.material.opacity = 0.28 + 0.4 * (variantB ? 0.5 + wob * 0.5 : 1) * (0.7 + 0.3 * Math.sin(refs.t * 3 + seed));
        }
      });
    });

    this.dynamicRefs = { kind: 'turbines', that: this };
    this.originPoint.set(1.25, 1.42, 1.85);
    this.worldAnchors = [
      { pos: new THREE.Vector3(-1.25, 2.42, 1.85), title: 'VARIANT A · SWEPT STATOR', sub: 'DATA-DRIVEN SIM · LAMINAR ATTACHED', amber: false },
      { pos: new THREE.Vector3(1.25, 2.42, 1.85), title: 'VARIANT B · STRAIGHT VANE', sub: 'HUB-CORNER VORTEX LOSS +3.1%', amber: true },
    ];
  }

  // ------------------------------------------------------------------
  // Template C — Zero-Trust Compute Topology
  // ------------------------------------------------------------------
  _buildZeroTrustComputeTopology() {
    // Sanctuary core crystal with geodesic firewall shell
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 1), this._holoMat(ICE, { opacity: 0.5 }));
    core.position.set(-1.8, 1.42, 1.85);
    this.stageRoot.add(core);
    this._sampleLiDAR(core, 1600, ICE);

    this.firewall = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.48, 1),
      new THREE.MeshBasicMaterial({ color: CYAN, wireframe: true, transparent: true, opacity: 0.55 })
    );
    this.firewall.position.set(-1.8, 1.42, 1.85);
    this.stageRoot.add(this.firewall);

    // Two compute racks (local CUDA + private Kaggle)
    this.localRack = this._serverRack([0.0, 0.6, 1.85], { color: CYAN });
    this.kaggleRack = this._serverRack([1.8, 0.6, 1.85], { color: CYAN });

    // Public exposure gate (portal frame, far right)
    this.gate = new THREE.Group();
    const gateMat = new THREE.MeshBasicMaterial({ color: 0x7799a5, transparent: true, opacity: 0.6 });
    for (const dx of [-0.28, 0.28]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), gateMat);
      post.position.set(dx, 0.65, 0);
      this.gate.add(post);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.05), gateMat);
    lintel.position.y = 1.3;
    this.gate.add(lintel);
    this.gate.position.set(3.0, 0.6, 1.85);
    this.stageRoot.add(this.gate);

    // Outbound authenticated tunnels: core → local → kaggle
    const tunnelPath = (a, b) => new THREE.CatmullRomCurve3([
      new THREE.Vector3(...a),
      new THREE.Vector3((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 0.3, (a[2] + b[2]) / 2),
      new THREE.Vector3(...b),
    ]);
    this.tunnels = [
      tunnelPath([-1.8, 1.42, 1.85], [0.0, 1.35, 1.85]),
      tunnelPath([0.0, 1.35, 1.85], [1.8, 1.35, 1.85]),
    ];
    this.tunnelLines = [];
    for (const c of this.tunnels) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(c.getPoints(48)),
        new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.75 })
      );
      this.stageRoot.add(line);
      this.tunnelLines.push(line);
    }

    // Packet particles flowing along tunnels
    const packetCount = 90;
    const packetPos = new Float32Array(packetCount * 3);
    this.packetData = Array.from({ length: packetCount }, () => ({
      tunnel: Math.floor(Math.random() * 2),
      k: Math.random(),
      speed: 0.22 + Math.random() * 0.3,
    }));
    this.packets = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(packetPos, 3)),
      new THREE.PointsMaterial({ color: ICE, size: 0.035, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.stageRoot.add(this.packets);

    // Inbound attack streams (visible only when exposure is simulated)
    this.attackLines = [];
    for (let i = 0; i < 7; i++) {
      const from = new THREE.Vector3(4.4 + Math.random() * 0.6, 0.8 + Math.random() * 1.4, 0.9 + Math.random() * 2.0);
      const to = new THREE.Vector3(1.8, 1.35, 1.85);
      const c = new THREE.CatmullRomCurve3([from, new THREE.Vector3((from.x + to.x) / 2, from.y, (from.z + to.z) / 2), to]);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(c.getPoints(36)),
        new THREE.LineBasicMaterial({ color: RED, transparent: true, opacity: 0 })
      );
      this.stageRoot.add(line);
      this.attackLines.push(line);
    }

    this.updatables.push((dt, refs) => {
      const exposed = Number(refs.that.variables.expose_public_port ?? 0) >= 1;
      refs.that.firewall.rotation.y += dt * 0.7;
      refs.that.firewall.rotation.x += dt * 0.24;
      refs.that.core && (refs.that.core.rotation.y -= dt * 0.4);

      // Firewall & tunnel status colors
      refs.that.firewall.material.color.setHex(exposed ? RED : CYAN);
      refs.that.firewall.material.opacity = exposed ? 0.5 + 0.35 * Math.sin(refs.t * 10) : 0.55;
      for (const l of refs.that.tunnelLines) l.material.color.setHex(exposed ? RED : CYAN);

      // Gate glows when exposure simulated
      refs.that.gate.children.forEach((c) => {
        c.material.color.setHex(exposed ? RED : 0x7799a5);
        c.material.opacity = exposed ? 0.85 : 0.5;
      });

      // Rack LED blinking
      const blink = Math.sin(refs.t * 6) > 0;
      for (const rack of [refs.that.localRack, refs.that.kaggleRack]) {
        rack?.userData.leds?.forEach((led, i) => {
          led.material.color.setHex(exposed && rack === refs.that.kaggleRack && i % 2 === (blink ? 0 : 1) ? RED : ICE);
        });
      }

      // Packets advance along tunnels
      const posAttr = refs.that.packets.geometry.attributes.position;
      refs.that.packetData.forEach((p, i) => {
        p.k += dt * p.speed * (refs.that.playing ? 1 : 0.2);
        if (p.k > 1) p.k -= 1;
        const pt = refs.that.tunnels[p.tunnel].getPoint(p.k);
        posAttr.setXYZ(i, pt.x, pt.y, pt.z);
      });
      posAttr.needsUpdate = true;
      refs.that.packets.material.color.setHex(exposed ? RED : ICE);

      // Attack stream reveal
      const attackOpacity = exposed ? 0.32 + 0.3 * Math.sin(refs.t * 7) : 0;
      for (const l of refs.that.attackLines) l.material.opacity = Math.max(0, attackOpacity);
    });

    this.dynamicRefs = { kind: 'zerotrust', that: this };
    this.originPoint.set(1.8, 1.35, 1.85);
    this.worldAnchors = [
      { pos: new THREE.Vector3(-1.8, 2.15, 1.85), title: 'SANCTUARY CORE · PRIVATE', sub: 'ALL PROMPTS STAY IN LOCAL MEMORY', amber: false },
      { pos: new THREE.Vector3(1.8, 2.3, 1.85), title: 'PRIVATE KAGGLE T4×2', sub: 'OUTBOUND WSS · 0 PUBLIC PORTS', amber: false },
    ];
  }

  // ------------------------------------------------------------------
  // Causal vectors from the scenario definition
  // ------------------------------------------------------------------
  _buildCausalVectors() {
    const vectors = this.activeScenario?.actors_props?.causal_vectors || [];
    for (const v of vectors.slice(0, 4)) {
      const origin = new THREE.Vector3(...(v.origin || [0, 1.4, 1.85]));
      const dir = new THREE.Vector3(...(v.direction || [0.6, 0.3, 0.5])).normalize();
      const isHypothesis = v.epistemic === 'hypothesis';
      const arrow = new THREE.ArrowHelper(dir, origin, 0.9, isHypothesis ? AMBER : CYAN, 0.2, 0.11);
      this.stageRoot.add(arrow);
      this.worldAnchors.push({
        pos: origin.clone().add(dir.clone().multiplyScalar(1.05)).add(new THREE.Vector3(0, 0.16, 0)),
        title: (v.label || 'CAUSAL VECTOR').toUpperCase(),
        sub: isHypothesis ? 'INFERENCE' : 'MEASURED FACT',
        amber: isHypothesis,
      });
    }
  }

  // ------------------------------------------------------------------
  // Documentary camera choreography from timeline cues
  // ------------------------------------------------------------------
  _applyCueCamera(initial = false) {
    if (!this.cameraDirector || !this.activeScenario) return;
    const tl = this.activeScenario.timeline || [];
    let cueIndex = -1;
    for (let i = 0; i < tl.length; i++) {
      if (this.currentTime >= tl[i].t) cueIndex = i;
    }
    if (cueIndex === this.lastCueIndex && !initial) return;
    this.lastCueIndex = cueIndex;
    if (cueIndex < 0) return;
    const cam = tl[cueIndex].camera;
    if (!cam) return;
    const actor = this.actors?.[0]?.group || null;
    this.cameraDirector.setScenarioCue?.(cam, this.originPoint, actor);
  }

  // ------------------------------------------------------------------
  // Explainer feed state for the Media Wall
  // ------------------------------------------------------------------
  getMediaFeedState() {
    if (!this.activeScenario) return null;
    const def = this.activeScenario;
    const tl = def.timeline || [];
    let phase = tl[0]?.phase || 'Scenario Active';
    for (const cue of tl) {
      if (this.currentTime >= cue.t) phase = cue.phase;
    }

    const varSchema = def.variables || [];
    const variables = varSchema.map((v) => ({
      label: v.label,
      value: this.variables[v.key] ?? v.default,
      unit: v.unit || '',
      tone: 'cyan',
    }));

    // Evaluate the active branch
    let branch = null;
    for (const b of def.branches || []) {
      if (evalBranchCondition(b.condition, this.variables)) { branch = b; break; }
    }

    const series = this._computeSeries();

    return {
      title: def.title,
      classification: def.classification,
      phase,
      t: this.currentTime,
      duration: this.duration,
      cues: tl.map((c) => ({ t: c.t, phase: c.phase })),
      variables,
      series,
      branch,
    };
  }

  _computeSeries() {
    const kind = this.activeScenario?.actors_props?.voxel_structure;
    const d = this.duration;
    const pts = (fn, step = 0.5) => {
      const out = [];
      for (let t = 0; t <= d + 0.001; t += step) out.push({ t, v: fn(t) });
      return out;
    };
    if (kind === 'cryo_manifold_riser') {
      const pLine = Number(this.variables.line_pressure_mpa ?? 210);
      const delayMs = Number(this.variables.relief_valve_ms ?? 125);
      const mitigated = pLine < 185 || delayMs <= 70;
      return [
        {
          name: 'Flange B-4 stress (MPa)', color: '#62e6f2', minV: 120, maxV: 260, unit: 'MPa',
          points: pts((t) => (mitigated
            ? 138 + Math.min(1, t / 11.2) * 14
            : 138 + Math.pow(Math.max(0, (t - 4) / 7.2), 2.1) * (pLine - 138))),
        },
        {
          name: 'Predicted unmitigated (inference)', color: '#e7ae5b', minV: 120, maxV: 260, unit: 'MPa',
          points: pts((t) => 138 + Math.pow(Math.max(0, (t - 4) / 7.2), 2.1) * 82),
        },
      ];
    }
    if (kind === 'dual_turbines') {
      const rpm = Number(this.variables.rotor_rpm ?? 11500);
      const tempK = Number(this.variables.inlet_temp_k ?? 1320);
      const stall = THREE.MathUtils.clamp((rpm - 10500) / 5500 + Math.max(0, tempK - 1450) / 900, 0, 1.4);
      return [
        { name: 'Variant A adiabatic eff. delta (%)', color: '#62e6f2', minV: 0, maxV: 8, unit: '%', points: pts((t) => 2.6 + Math.min(1, t / 5) * 0.5) },
        { name: 'Variant B loss (tip vortex)', color: '#e7ae5b', minV: 0, maxV: 8, unit: '%', points: pts((t) => 1.1 + Math.min(1, t / 6) * stall * 4.2) },
      ];
    }
    // zerotrust
    const exposed = Number(this.variables.expose_public_port ?? 0) >= 1;
    return [
      { name: 'Authenticated outbound success (%)', color: '#62e6f2', minV: 0, maxV: 100, unit: '%', points: pts((t) => 96 + Math.sin(t * 1.4) * 3) },
      { name: 'Unauthorized probe reach', color: exposed ? '#ff6b67' : '#e7ae5b', minV: 0, maxV: 100, unit: 'pct', points: pts((t) => (exposed ? Math.min(92, Math.max(0, (t - 2) * 18)) : 0)) },
    ];
  }

  // ------------------------------------------------------------------
  // Per-frame update
  // ------------------------------------------------------------------
  update(dt) {
    if (!this.activeScenario || !this.stageRoot.visible) return;
    this.clock += dt;
    if (this.playing) {
      this.currentTime = (this.currentTime + dt * this.playbackRate) % this.duration;
    }

    for (const m of this.holoMats) m.uniforms.uTime.value = this.clock;

    const refs = {
      t: this.currentTime,
      duration: this.duration,
      normT: this.currentTime / Math.max(1, this.duration),
      that: this,
    };
    for (const fn of this.updatables) fn(dt, refs);

    this._applyCueCamera();
  }
}
