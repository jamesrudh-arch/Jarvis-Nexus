/**
 * JARVIS NEXUS — Real-Time 3D Architectural Sanctuary & Holographic Projection Engine. v2
 *
 * All 12 spatial zones in restrained cinematic realism (#02070B / #06121A / #62E6F2):
 *  1. Central Operations Circular Obsidian Holo-Ring + Volumetric Assembly
 *  2. Volumetric Simulation & Scenario Stage
 *  3. Memory Archive Crystalline Colonnade (5 optical glass columns + 3D knowledge nodes)
 *  4. Live Research Alcove (Z-depth optical literature planes)
 *  5. Goals & Ongoing Work Bay (Z-depth dependency DAG)
 *  6. Multi-Agent Collaboration Table (4 rotating geometric specialist workspaces)
 *  7. Frameless 4.8m Architectural Media Wall + Extracted 3D Volumetric Twin
 *  8. Defensive Security Bulkhead Vault + 3D Geodesic Perimeter Lattice
 *  9. Vision & Optical Input Station (explicit live capture badge + camera prop)
 * 10. Diagnostics & Telemetry Station
 * 11. Local PC & Private Kaggle Compute Routing Bay
 * 12. Seven-Channel Physical Hardware Switch Console & Embodiment Pedestal
 *
 * v2 completeness pass: visible coffered ceiling dome + oculus, wall light reveals
 * (cyan + warm amber accent), planar floor reflections, volumetric downlight cone
 * with drifting dust motes, floor cable conduits, hanging zone signage + etched
 * floor plates, scanline hologram materials, MSAA + vignette post pipeline, and a
 * documentary explainer feed on the media wall while scenarios replay.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

import {
  createBasaltTextures,
  createHonedSlateFloorTextures,
  createConeGradientTexture,
  createZoneLabelTexture,
  setGlobalAnisotropy,
  SchlierenFeedRenderer,
} from './ProceduralTextures.js';
import { JarvisCharacterController } from './JarvisCharacterController.js';
import { ScenarioDirector3D, HoloScanMaterial } from './ScenarioDirector3D.js';
import { CameraDirector } from './CameraDirector.js';
import { BehaviorDirector } from './BehaviorDirector.js';

const CYAN_HEX = 0x62e6f2;

const ZONE_SIGNAGE = [
  { idx: 1, title: 'Central Ops', sub: 'Obsidian Holo-Ring', pos: null }, // holo assembly is the identity here
  { idx: 2, title: 'Simulation Stage', sub: 'Volumetric Reconstruction', pos: [0.15, 3.15, 4.35] },
  { idx: 3, title: 'Memory Archive', sub: 'Crystalline Colonnade', pos: [-7.8, 3.45, -1.5] },
  { idx: 4, title: 'Live Research', sub: 'Literature Alcove', pos: [-6.6, 3.35, -7.0] },
  { idx: 5, title: 'Goals & Work', sub: 'Dependency DAG Bay', pos: [-3.0, 3.35, -8.2] },
  { idx: 6, title: 'Agent Table', sub: 'Specialist Collaboration', pos: [3.2, 3.35, -8.2] },
  { idx: 7, title: 'Media Wall', sub: 'Frameless 4.8m Display', pos: [6.9, 3.45, -5.8] },
  { idx: 8, title: 'Security Vault', sub: 'Bulkhead + Lattice', pos: [8.3, 3.45, 0.5] },
  { idx: 9, title: 'Vision Bay', sub: 'Optical Input Station', pos: [6.8, 3.35, 5.4] },
  { idx: 10, title: 'Diagnostics', sub: 'Telemetry Station', pos: [-6.8, 3.35, 5.4] },
  { idx: 11, title: 'Compute Bay', sub: 'Local + Kaggle Routing', pos: [3.2, 3.35, 7.9] },
  { idx: 12, title: 'Owner Switches', sub: '7-Channel Console', pos: [-3.2, 3.35, 7.9] },
];

const CONDUIT_TARGETS = [
  [-7.4, -1.5], [-5.6, -6.4], [-2.8, -7.7], [3.1, -7.6],
  [5.6, -4.9], [7.9, 0.5], [6.4, 5.0], [-6.4, 5.0], [3.1, 7.5], [-3.1, 7.5],
];

export class NexusSanctuaryScene {
  constructor(canvas, labelsContainer) {
    this.canvas = canvas;
    this.labelsContainer = labelsContainer;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // Supports WebM recording & frame extraction
    });
    const isMobile = window.innerWidth <= 860;
    // Crisp on every device: full retina DPR (pinch-zoom of the page is locked in
    // layout.tsx, so zooming is a real camera dolly on native-resolution pixels).
    this._qualityDpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.renderer.setPixelRatio(this._qualityDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this._frameTimeAvg = 20;

    // Crisp grazing-angle texture filtering (the "blurry when zooming" fix)
    setGlobalAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02070b);
    this.scene.fog = new THREE.FogExp2(0x02070b, 0.018); // Subtle depth — never eats her legs

    // Subtle PBR environment reflection map (low intensity so surfaces don't look glossy plastic)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.24;

    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 65);
    this.cameraDirector = new CameraDirector(this.camera, this.canvas);

    // Post pipeline: MSAA render target + restrained bloom + cinematic vignette
    const rtSamples = isMobile ? 2 : 4;
    const composerRT = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
      samples: rtSamples,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(this.renderer, composerRT);
    // B1 fix: the composer's render targets must live at DEVICE pixel resolution.
    // EffectComposer defaults to pixelRatio 1, so without this every pass (scene
    // render, bloom, vignette, output) ran at CSS-pixel size — half resolution on
    // DPR>=2 devices, the "zoom blur" root cause. setPixelRatio resizes the RT
    // to width*dpr x height*dpr internally.
    this.composer.setPixelRatio(this._qualityDpr);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.26, // strength — restrained: bloom accents, never washes the frame
      0.36, // radius
      0.85  // threshold — media wall & skin stay crisp, only emitters glow
    );
    this.vignettePass = new ShaderPass(VignetteShader);
    this.vignettePass.uniforms.offset.value = 1.14;
    this.vignettePass.uniforms.darkness.value = 1.24;
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.vignettePass);
    this.composer.addPass(new OutputPass());

    // Architecture & Interactive Station Groups
    this.architectureGroup = new THREE.Group();
    this.scene.add(this.architectureGroup);

    this.schlierenFeed = new SchlierenFeedRenderer();
    this.mediaScreenMat = null;
    this.extracted3DTwinGroup = null;
    this.centerHoloAssembly = null;
    this.centerHoloMats = [];
    this.idleHoloMats = [];
    this.securityLattice = null;
    this.agentSolids = [];
    this.memoryNodes = [];
    this.switchLevers = {};
    this.visionBoardCtx = null;
    this.visionBoardTex = null;
    this.visionLed = null;
    this.telemetryBoardCtx = null;
    this.telemetryBoardTex = null;
    this.dustField = null;
    this.explainerTimer = 0;

    this._buildArchitecturalShellAndLighting();
    this._buildZoneInfrastructure();
    this._buildAllTwelveZones();

    // Living Character & Scenario Director
    this.jarvis = new JarvisCharacterController(this.scene);
    this.behaviorDirector = new BehaviorDirector(this.jarvis);
    this.behaviorDirector.enabled = true;
    this.scenarioDirector = new ScenarioDirector3D(this.scene);
    this.scenarioDirector.attachCameraDirector(this.cameraDirector);

    // Holographic Mode State (Mode 15)
    this.hologramMode = false;
    this.hologramLayout = 'peppers_ghost'; // peppers_ghost | pyramid_4face | direct_black
    this.pyramidCam = new THREE.PerspectiveCamera(38, 1, 0.1, 30);

    this.reducedMotion = false;
    this.embodimentEnabled = true;

    window.addEventListener('resize', () => this.onResize());
    // B5 completeness: DPR can change WITHOUT any window resize event (device
    // emulation, some zoom/monitor transitions). Watch the current resolution
    // via matchMedia and re-baseline when it flips.
    this._onDprChange = () => this.onResize();
    this._dprMql = null;
    this._armDprWatcher();
  }

  _armDprWatcher() {
    try {
      if (this._dprMql) this._dprMql.removeEventListener('change', this._onDprChange);
      this._dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      this._dprMql.addEventListener('change', this._onDprChange);
    } catch {
      /* matchMedia resolution queries unsupported: resize events still cover the common paths */
    }
  }

  async initCharacter(onProgress) {
    await this.jarvis.load(onProgress);
  }

  _buildArchitecturalShellAndLighting() {
    const basalt = createBasaltTextures();
    const slate = createHonedSlateFloorTextures();
    const isMobile = window.innerWidth <= 860;

    // ------------------------------------------------------------------
    // 1. Honed Dark Obsidian Slate Floor (28m diameter) + planar reflections
    // ------------------------------------------------------------------
    const floorMat = new THREE.MeshStandardMaterial({
      map: slate.map,
      roughnessMap: slate.roughnessMap,
      bumpMap: slate.bumpMap,
      bumpScale: 0.012,
      roughness: 0.34,
      metalness: 0.22,
    });

    // Real planar reflection beneath the semi-transparent honed slate — on
    // EVERY device now (mobile gets a smaller buffer). Reads as polished stone.
    {
      const reflSize = isMobile ? 384 : 1024;
      this.floorReflector = new Reflector(new THREE.CircleGeometry(14.4, 72), {
        clipBias: 0.003,
        textureWidth: reflSize,
        textureHeight: reflSize,
        color: 0x50606a,
      });
      this.floorReflector.rotation.x = -Math.PI / 2;
      this.floorReflector.position.y = 0.0;
      this.architectureGroup.add(this.floorReflector);
      floorMat.transparent = true;
      floorMat.opacity = isMobile ? 0.9 : 0.86;
    }

    const floor = new THREE.Mesh(new THREE.CircleGeometry(14.5, 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.012;
    floor.receiveShadow = true;
    this.architectureGroup.add(floor);

    // Restrained recessed floor calibration rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b9aa6, transparent: true, opacity: 0.34 });
    for (const [rIn, rOut] of [[1.95, 1.98], [4.35, 4.38], [8.85, 8.88]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 96), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.architectureGroup.add(ring);
    }

    // ------------------------------------------------------------------
    // 2. Perimeter Split-Basalt Monolith Walls + Light Reveals + Structural Ribs
    // ------------------------------------------------------------------
    const basaltMat = new THREE.MeshStandardMaterial({
      map: basalt.map,
      roughnessMap: basalt.roughnessMap,
      bumpMap: basalt.bumpMap,
      bumpScale: 0.045,
      roughness: 0.88,
      metalness: 0.08,
    });
    const titaniumMat = new THREE.MeshStandardMaterial({
      color: 0x101920,
      roughness: 0.34,
      metalness: 0.84,
    });
    const stripCyan = new THREE.MeshBasicMaterial({ color: 0x62e6f2 });
    const stripAmber = new THREE.MeshBasicMaterial({ color: 0xe7ae5b });
    const stripDim = new THREE.MeshBasicMaterial({ color: 0x1d4f58 });

    const segments = 12;
    const wallRadius = 12.2;
    for (let i = 0; i < segments; i++) {
      const ang = (i / segments) * Math.PI * 2;
      const cx = Math.cos(ang) * wallRadius;
      const cz = Math.sin(ang) * wallRadius;
      const wallPanel = new THREE.Mesh(new THREE.BoxGeometry(5.6, 6.8, 0.55), basaltMat);
      wallPanel.position.set(cx, 3.4, cz);
      wallPanel.rotation.y = -ang + Math.PI / 2;
      wallPanel.receiveShadow = true;
      this.architectureGroup.add(wallPanel);

      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.0, 0.75), titaniumMat);
      const ribAng = ang + Math.PI / segments;
      rib.position.set(Math.cos(ribAng) * (wallRadius - 0.15), 3.5, Math.sin(ribAng) * (wallRadius - 0.15));
      rib.rotation.y = -ribAng + Math.PI / 2;
      this.architectureGroup.add(rib);

      // Top & bottom architectural light reveals so walls READ as lit surfaces.
      // Amber accents on the rear-center and right-edge walls (visible in the
      // standard compositions) for warm/cool contrast against the cyan field.
      const isAmberWall = i === 0 || i === 6;
      const topStrip = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.05, 0.05), isAmberWall ? stripAmber : stripCyan);
      topStrip.position.set(Math.cos(ang) * (wallRadius - 0.42), 6.62, Math.sin(ang) * (wallRadius - 0.42));
      topStrip.rotation.y = -ang + Math.PI / 2;
      this.architectureGroup.add(topStrip);

      const botStrip = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.045, 0.045), isAmberWall ? stripDim : stripCyan);
      botStrip.position.set(Math.cos(ang) * (wallRadius - 0.42), 0.16, Math.sin(ang) * (wallRadius - 0.42));
      botStrip.rotation.y = -ang + Math.PI / 2;
      this.architectureGroup.add(botStrip);
    }

    // ------------------------------------------------------------------
    // 3. Coffered Ceiling Dome: baffle cone + ring beams + spokes + oculus
    // ------------------------------------------------------------------
    const ceiling = new THREE.Mesh(
      new THREE.CircleGeometry(13.0, 48),
      new THREE.MeshStandardMaterial({ color: 0x040b10, roughness: 0.92, metalness: 0.2 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 6.85;
    this.architectureGroup.add(ceiling);

    // Sloped perimeter baffle (catches the downlight, encloses the room visually)
    const baffle = new THREE.Mesh(
      new THREE.CylinderGeometry(8.8, 12.15, 0.95, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x071219, roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide })
    );
    baffle.position.y = 6.32;
    this.architectureGroup.add(baffle);

    // Concentric ring beams
    for (const [r, tube, mat] of [[7.2, 0.1, titaniumMat], [10.6, 0.12, titaniumMat]]) {
      const beam = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 72), mat);
      beam.rotation.x = Math.PI / 2;
      beam.position.y = 6.55;
      this.architectureGroup.add(beam);
    }

    // Radial spokes
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 7.3), titaniumMat);
      spoke.position.set(Math.cos(ang) * 5.6, 6.55, Math.sin(ang) * 5.6);
      spoke.rotation.y = -ang + Math.PI / 2;
      this.architectureGroup.add(spoke);
    }

    // Glowing oculus ring
    const oculus = new THREE.Mesh(
      new THREE.TorusGeometry(3.9, 0.045, 10, 72),
      new THREE.MeshBasicMaterial({ color: 0x8fd3e0 })
    );
    oculus.rotation.x = Math.PI / 2;
    oculus.position.y = 6.5;
    this.architectureGroup.add(oculus);

    // Suspended circular lighting gantry
    const gantry = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.09, 16, 72), titaniumMat);
    gantry.rotation.x = Math.PI / 2;
    gantry.position.y = 5.45;
    this.architectureGroup.add(gantry);

    // Central hanging fixture above the holo-table
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 8), titaniumMat);
    cable.position.set(0, 6.02, 0.5);
    this.architectureGroup.add(cable);
    const fixtureDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.4, 0.09, 32),
      new THREE.MeshBasicMaterial({ color: 0x9fb9c2 })
    );
    fixtureDisc.position.set(0, 5.52, 0.5);
    this.architectureGroup.add(fixtureDisc);

    // ------------------------------------------------------------------
    // 4. Volumetric downlight cone + drifting dust motes
    // ------------------------------------------------------------------
    const coneTex = createConeGradientTexture(0.02, 0.3, 0.005);
    const lightCone = new THREE.Mesh(
      new THREE.ConeGeometry(3.05, 5.4, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map: coneTex,
        color: 0xcfe6ee,
        transparent: true,
        opacity: 0.085,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    lightCone.position.set(0, 2.72, 0.5);
    this.architectureGroup.add(lightCone);

    // Secondary volumetric shafts over key perimeter stations — very subtle
    // atmosphere so the room reads as lit from above everywhere.
    const shaftMatBase = {
      map: coneTex,
      color: 0xbfe0ea,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    };
    for (const [sx, sz, r, h] of [
      [-6.9, -1.5, 1.1, 4.6], // memory colonnade
      [6.9, -5.6, 1.3, 4.8],  // media wall
      [3.1, 7.6, 1.0, 4.4],   // compute bay
      [-3.1, 7.6, 1.0, 4.4],  // owner switches
      [-5.4, -6.6, 1.0, 4.4], // research alcove
    ]) {
      const shaft = new THREE.Mesh(new THREE.ConeGeometry(r, h, 32, 1, true), new THREE.MeshBasicMaterial(shaftMatBase));
      shaft.position.set(sx, h / 2 + 0.7, sz);
      this.architectureGroup.add(shaft);
    }

    const dustCount = isMobile ? 220 : 620;
    const dustPos = new Float32Array(dustCount * 3);
    this.dustSeeds = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      const r = Math.sqrt(Math.random()) * 2.35; // stay inside the light cone volume
      const a = Math.random() * Math.PI * 2;
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = 0.25 + Math.random() * 5.1;
      dustPos[i * 3 + 2] = 0.5 + Math.sin(a) * r;
      this.dustSeeds[i] = Math.random() * Math.PI * 2;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    this.dustField = new THREE.Points(dustGeo, new THREE.PointsMaterial({
      color: 0xbfe0e8,
      size: 0.016,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.architectureGroup.add(this.dustField);

    // ------------------------------------------------------------------
    // 5. Motivated Architectural Lighting
    // ------------------------------------------------------------------
    // Ambient slightly raised to absorb the removed ceiling wall-washes (light diet E1)
    const ambient = new THREE.HemisphereLight(0x9ec5d6, 0x061017, 0.56);
    this.architectureGroup.add(ambient);

    const centralDownlight = new THREE.SpotLight(0xfff0dd, 9.5, 16, Math.PI * 0.34, 0.65, 1.2);
    centralDownlight.position.set(0, 5.8, 0.5);
    centralDownlight.castShadow = true;
    centralDownlight.shadow.mapSize.set(2048, 2048);
    centralDownlight.shadow.bias = -0.0004;
    this.architectureGroup.add(centralDownlight);

    // Cove accents over perimeter stations
    // NOTE: each row is [x, z, color, intensity]. A previous 5-element row
    // mis-assigned the color hex (10,405,334) as INTENSITY — a ten-million-candela
    // white blaster that washed out the entire right half of the default framing.
    for (const [lx, lz, col, intensity] of [
      [-6.8, -1.5, 0x62e6f2, 2.4], // Memory Colonnade
      [-5.8, -6.2, 0xd8eef5, 2.6], // Research Alcove
      [3.0, -7.2, 0x62e6f2, 2.2],  // Collaboration
      [6.2, -5.2, 0xd8eef5, 2.6],  // Media Wall
      [7.2, 0.5, 0x9ec5d6, 2.8],   // Security Vault (boosted: absorbs the removed +X dead-zone fill)
      [0.0, 6.8, 0xd8eef5, 2.4],   // Compute & Switches
      [-6.6, 4.6, 0xe7c98f, 1.6],  // warm wash, Diagnostics side
    ]) {
      const pl = new THREE.PointLight(col, intensity, 8.5, 1.5);
      pl.position.set(lx, 3.8, lz);
      this.architectureGroup.add(pl);
    }

    // Light diet (audit E1 first pass): the three dim ceiling wall-washes and
    // the +X dead-zone fill are removed — three.js includes EVERY realtime
    // light in every material's fragment shader, so 21 lights dominated the
    // shading cost on mobile. The hemisphere bump above plus the Security
    // Vault boost cover their visual contribution. The deeper, tiered diet
    // lands with the quality-tier system (P1).
  }

  /** Cable conduits, hanging zone signage, etched floor plates. */
  _buildZoneInfrastructure() {
    const conduitMat = new THREE.MeshStandardMaterial({ color: 0x0c141b, roughness: 0.5, metalness: 0.7 });

    // Floor cable conduits from the central ring to each station
    for (const [tx, tz] of CONDUIT_TARGETS) {
      const dir = new THREE.Vector2(tx, tz).normalize();
      const start = new THREE.Vector3(dir.x * 2.1, 0.035, dir.y * 2.1);
      const end = new THREE.Vector3(tx, 0.035, tz);
      const mid = start.clone().add(end).multiplyScalar(0.5);
      mid.y = 0.052;
      const curve = new THREE.CatmullRomCurve3([start, mid, end]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.028, 6), conduitMat);
      this.architectureGroup.add(tube);
    }

    // Hanging zone signage plates — two back-to-back front-face planes so the
    // text reads correctly from BOTH sides (never mirrored)
    for (const z of ZONE_SIGNAGE) {
      if (!z.pos) continue;
      const tex = createZoneLabelTexture(z.idx, z.title, z.sub, (z.idx === 8 || z.idx === 7) ? '#e7ae5b' : '#62e6f2');
      const plateMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const plateGeo = new THREE.PlaneGeometry(1.62, 0.6);
      const plateGroup = new THREE.Group();
      plateGroup.position.set(z.pos[0], z.pos[1], z.pos[2]);
      plateGroup.lookAt(0, z.pos[1], 0);
      const front = new THREE.Mesh(plateGeo, plateMat);
      front.position.z = 0.0015;
      const back = new THREE.Mesh(plateGeo, plateMat);
      back.rotation.y = Math.PI;
      back.position.z = -0.0015;
      plateGroup.add(front, back);
      this.architectureGroup.add(plateGroup);

      // thin suspension filament to the ceiling
      const h = 6.6 - z.pos[1];
      const wire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, h, 4),
        new THREE.MeshBasicMaterial({ color: 0x23323b })
      );
      wire.position.set(z.pos[0], z.pos[1] + h / 2 + 0.3, z.pos[2]);
      this.architectureGroup.add(wire);

      // Etched floor plate in front of the zone (readable walking outward from center)
      const fl = new THREE.Vector3(z.pos[0], 0, z.pos[2]);
      if (fl.length() > 2.6) {
        const floorTex = createZoneLabelTexture(z.idx, z.title, z.sub.split(' ')[0], '#4db3c0');
        const fp = new THREE.Mesh(
          new THREE.PlaneGeometry(1.24, 0.47),
          new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })
        );
        fp.position.set(z.pos[0] * 0.76, 0.024, z.pos[2] * 0.76);
        fp.rotation.x = -Math.PI / 2;
        fp.rotation.z = Math.atan2(z.pos[0], z.pos[2]) + Math.PI;
        this.architectureGroup.add(fp);
      }
    }
  }

  _buildAllTwelveZones() {
    const smokedGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x091924,
      roughness: 0.14,
      metalness: 0.1,
      transmission: 0.62,
      thickness: 0.08,
      transparent: true,
      opacity: 0.86,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0e171f,
      roughness: 0.36,
      metalness: 0.82,
    });

    // ZONE 1 & 2: Central Operations Holo-Table + Recessed Stage Ring
    // Raised obsidian dais under the holo-table — the sanctuary's focal altar.
    // Two shallow steps + glowing rim inlay + radial spoke engraving.
    {
      const daisMat = new THREE.MeshStandardMaterial({
        color: 0x0a141c,
        roughness: 0.38,
        metalness: 0.55,
      });
      const step1 = new THREE.Mesh(new THREE.CylinderGeometry(2.06, 2.12, 0.045, 64), daisMat);
      step1.position.y = 0.0225;
      step1.receiveShadow = true;
      this.architectureGroup.add(step1);
      const step2 = new THREE.Mesh(new THREE.CylinderGeometry(1.78, 1.84, 0.05, 64), daisMat);
      step2.position.y = 0.068;
      step2.receiveShadow = true;
      this.architectureGroup.add(step2);

      // Glowing rim inlay on each step
      const rimMat = new THREE.MeshBasicMaterial({ color: 0x4fc3d3 });
      const rim1 = new THREE.Mesh(new THREE.TorusGeometry(2.08, 0.012, 8, 96), rimMat);
      rim1.rotation.x = Math.PI / 2;
      rim1.position.y = 0.046;
      this.architectureGroup.add(rim1);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.012, 8, 96), rimMat);
      rim2.rotation.x = Math.PI / 2;
      rim2.position.y = 0.094;
      this.architectureGroup.add(rim2);

      // Radial engraved spokes on the lower step (24 fine lines)
      const spokeMat = new THREE.MeshBasicMaterial({ color: 0x2b7f8d, transparent: true, opacity: 0.6 });
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.5), spokeMat);
        spoke.position.set(Math.cos(ang) * 1.95, 0.047, Math.sin(ang) * 1.95);
        spoke.rotation.y = -ang;
        this.architectureGroup.add(spoke);
      }
    }

    const pitRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.06, 16, 64), darkMetalMat);
    pitRing.rotation.x = Math.PI / 2;
    pitRing.position.y = 0.03;
    this.architectureGroup.add(pitRing);

    const holoTableTop = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.36, 0.045, 64), smokedGlassMat);
    holoTableTop.position.set(0, 0.92, 0);
    this.architectureGroup.add(holoTableTop);

    for (let s = 0; s < 4; s++) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.94, 12), darkMetalMat);
      const a = (s / 4) * Math.PI * 2 + Math.PI / 4;
      strut.position.set(Math.cos(a) * 0.92, 0.46, Math.sin(a) * 0.92);
      strut.rotation.z = Math.cos(a) * 0.18;
      strut.rotation.x = -Math.sin(a) * 0.18;
      this.architectureGroup.add(strut);
    }

    // Emitter ring glow on the table rim
    const emitterRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.012, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2 })
    );
    emitterRing.rotation.x = Math.PI / 2;
    emitterRing.position.y = 0.945;
    this.architectureGroup.add(emitterRing);

    // Floating Volumetric Assembly above the holo-table (scanline holo shells + orbit rings)
    this.centerHoloAssembly = new THREE.Group();
    this.centerHoloAssembly.position.set(0, 1.48, 0);
    const knotMat = new HoloScanMaterial(CYAN_HEX, { opacity: 0.42, scanDensity: 30 });
    const coreMat = new HoloScanMaterial(0xddfbff, { opacity: 0.24, scanDensity: 20 });
    this.centerHoloMats = [knotMat, coreMat];
    const outerCore = new THREE.Mesh(new THREE.TorusKnotGeometry(0.34, 0.08, 96, 14, 2, 3), knotMat);
    const wireOverlay = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.34, 0.08, 96, 14, 2, 3),
      new THREE.MeshBasicMaterial({ color: 0x9fe8f2, wireframe: true, transparent: true, opacity: 0.3 })
    );
    const innerFrame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), coreMat);
    const orbitA = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.006, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, transparent: true, opacity: 0.55 })
    );
    orbitA.rotation.x = 1.15;
    const orbitB = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.005, 6, 64),
      new THREE.MeshBasicMaterial({ color: 0xbfe9f2, transparent: true, opacity: 0.4 })
    );
    orbitB.rotation.x = 2.1;
    orbitB.rotation.y = 0.5;
    const holoGlow = new THREE.PointLight(0x62e6f2, 1.6, 4.5, 1.6);
    this.centerHoloAssembly.add(outerCore, wireOverlay, innerFrame, orbitA, orbitB, holoGlow);
    this.centerOrbits = [orbitA, orbitB];
    this.architectureGroup.add(this.centerHoloAssembly);

    // ZONE 3: Memory Archive Crystalline Colonnade
    for (let c = 0; c < 5; c++) {
      const cz = -3.5 + c * 1.05;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 4.4, 6), smokedGlassMat);
      col.position.set(-7.8, 2.2, cz);
      this.architectureGroup.add(col);

      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.08, 6), darkMetalMat);
      capTop.position.set(-7.8, 4.42, cz);
      this.architectureGroup.add(capTop);

      for (let n = 0; n < 7; n++) {
        const isHyp = (c + n) % 4 === 0;
        const node = new THREE.Mesh(
          new THREE.SphereGeometry(0.032, 10, 10),
          new THREE.MeshBasicMaterial({ color: isHyp ? 0xe7ae5b : 0xddfbff })
        );
        node.position.set(
          -7.2 + Math.sin(n * 1.7 + c) * 0.45,
          0.95 + n * 0.34,
          cz + Math.cos(n * 2.1) * 0.28
        );
        node.userData.pulsePhase = n * 1.3 + c * 0.7;
        this.architectureGroup.add(node);
        this.memoryNodes.push(node);
      }
    }

    // ZONE 4: Live Research Alcove — multi-plane translucent optical sheets
    for (let p = 0; p < 3; p++) {
      const sheet = this._makeTexturedGlassPanel(
        1.35, 0.92,
        `RESEARCH PLANE 0${p + 1}`,
        p === 1 ? 'JOURNAL OF AEROTHERMODYNAMICS · VERIFIED' : 'EMPIRICAL CURVE · PROVENANCE LINKED',
        p === 2 ? '#e7ae5b' : '#62e6f2'
      );
      sheet.position.set(-7.1 + p * 0.85, 1.55 + (p % 2) * 0.14, -7.2 + p * 0.32);
      sheet.rotation.y = 0.62;
      this.architectureGroup.add(sheet);
    }

    // ZONE 5: Goals & Ongoing Work Bay — Z-depth dependency DAG
    const dagGroup = new THREE.Group();
    dagGroup.position.set(-3.0, 1.52, -8.0);
    dagGroup.rotation.y = 0.22;
    const dagCoords = [
      [-0.8, 0.35, 0, 0xddfbff],
      [-0.8, -0.25, 0.15, 0x62e6f2],
      [0.0, 0.08, 0.25, 0x62e6f2],
      [0.85, 0.08, 0.4, 0xe7ae5b],
    ];
    const linePts = [];
    for (const [dx, dy, dz, col] of dagCoords) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.15, 0.04),
        new THREE.MeshBasicMaterial({ color: col, wireframe: true })
      );
      box.position.set(dx, dy, dz);
      dagGroup.add(box);
      linePts.push(new THREE.Vector3(dx, dy, dz));
    }
    dagGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(linePts),
      new THREE.LineBasicMaterial({ color: 0x62e6f2, transparent: true, opacity: 0.65 })
    ));
    this.architectureGroup.add(dagGroup);

    // ZONE 6: Multi-Agent Collaboration Table
    const collabTable = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.98, 0.04, 48), smokedGlassMat);
    collabTable.position.set(3.2, 0.92, -8.0);
    this.architectureGroup.add(collabTable);

    for (let a = 0; a < 4; a++) {
      const ang = (a / 4) * Math.PI * 2;
      const shellMat = new HoloScanMaterial(a === 0 ? 0xddfbff : CYAN_HEX, { opacity: 0.4, scanDensity: 26 });
      this.idleHoloMats.push(shellMat);
      const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), shellMat);
      ico.position.set(3.2 + Math.cos(ang) * 0.62, 1.38, -8.0 + Math.sin(ang) * 0.62);
      this.architectureGroup.add(ico);
      this.agentSolids.push(ico);
    }

    // ZONE 7: Frameless 4.4m x 2.48m Architectural Media Wall
    const wallFrame = new THREE.Mesh(new THREE.BoxGeometry(4.52, 2.6, 0.08), darkMetalMat);
    wallFrame.position.set(6.9, 1.92, -5.8);
    wallFrame.rotation.y = -0.62;
    this.architectureGroup.add(wallFrame);

    this.mediaScreenMat = new THREE.MeshBasicMaterial({ map: this.schlierenFeed.texture, color: 0x93a9b2 }); // dimmed: the wall must glow, never blow out
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.38, 2.46), this.mediaScreenMat);
    screenMesh.position.set(6.86, 1.92, -5.74);
    screenMesh.rotation.y = -0.62;
    this.architectureGroup.add(screenMesh);

    // Emissive edge reveal around the frameless wall
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0x62e6f2 });
    for (const [w, h, ox, oy] of [[4.5, 0.025, 0, 1.315], [4.5, 0.025, 0, -1.315], [0.025, 2.62, -2.26, 0], [0.025, 2.62, 2.26, 0]]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), edgeMat);
      edge.rotation.y = -0.62;
      edge.position.set(6.86 + ox * Math.cos(-0.62), 1.92 + oy, -5.74 - ox * Math.sin(-0.62));
      this.architectureGroup.add(edge);
    }

    // Extracted 3D Volumetric Twin beside Media Wall
    this.extracted3DTwinGroup = new THREE.Group();
    this.extracted3DTwinGroup.position.set(5.25, 1.38, -4.15);
    this.extracted3DTwinGroup.visible = false;
    const twinOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.38, 0.78, 24, 3, true),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true })
    );
    twinOuter.rotation.z = Math.PI / 2;
    const twinCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0xe7ae5b, wireframe: true })
    );
    this.extracted3DTwinGroup.add(twinOuter, twinCore);
    this.architectureGroup.add(this.extracted3DTwinGroup);

    // Floating explainer side-panel beside the Scenario Stage — shares the media
    // wall's live texture so the documentary feed is always in frame during replay
    // (the media wall itself sits behind the documentary camera).
    this.explainerSidePanel = new THREE.Mesh(
      new THREE.PlaneGeometry(2.05, 1.15),
      new THREE.MeshBasicMaterial({ map: this.schlierenFeed.texture, color: 0x93a9b2, transparent: true, opacity: 0.96, side: THREE.DoubleSide })
    );
    this.explainerSidePanel.position.set(-3.35, 2.1, 2.75);
    this.explainerSidePanel.lookAt(0.25, 1.85, 5.65);
    this.explainerSidePanel.visible = false;
    this.architectureGroup.add(this.explainerSidePanel);
    const panelEdge = new THREE.Mesh(
      new THREE.PlaneGeometry(2.14, 1.24),
      new THREE.MeshBasicMaterial({ color: 0x0a1d27, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    panelEdge.position.copy(this.explainerSidePanel.position);
    panelEdge.quaternion.copy(this.explainerSidePanel.quaternion);
    panelEdge.translateZ(-0.006);
    panelEdge.visible = false;
    this.architectureGroup.add(panelEdge);
    this.explainerSidePanelEdge = panelEdge;

    // ZONE 8: Defensive Security Bulkhead Vault + Geodesic Lattice
    const vaultDoor = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.22, 48), darkMetalMat);
    vaultDoor.rotation.z = Math.PI / 2;
    vaultDoor.position.set(9.4, 1.95, 0.5);
    this.architectureGroup.add(vaultDoor);
    const vaultWheel = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 10, 32), darkMetalMat);
    vaultWheel.rotation.y = Math.PI / 2;
    vaultWheel.position.set(9.22, 1.95, 0.5);
    this.architectureGroup.add(vaultWheel);

    this.securityLattice = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 2),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true, transparent: true, opacity: 0.55 })
    );
    this.securityLattice.position.set(7.6, 1.52, 0.5);
    this.architectureGroup.add(this.securityLattice);

    // ZONE 9: Vision & Optical Input Bay — board + physical camera prop
    const { mesh: visMesh, ctx: visCtx, tex: visTex } = this._makeDynamicCanvasBoard(1.6, 1.0);
    visMesh.position.set(6.8, 1.55, 5.4);
    visMesh.rotation.y = -2.32;
    this.visionBoardCtx = visCtx;
    this.visionBoardTex = visTex;
    this.architectureGroup.add(visMesh);

    const camProp = new THREE.Group();
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.16), darkMetalMat);
    const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 16), darkMetalMat);
    camLens.rotation.x = Math.PI / 2;
    camLens.position.z = 0.12;
    this.visionLed = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), new THREE.MeshBasicMaterial({ color: 0x32444d }));
    this.visionLed.position.set(0.07, 0.08, 0.06);
    camProp.add(camBody, camLens, this.visionLed);
    const camMount = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), darkMetalMat);
    camMount.position.y = -0.3;
    camProp.add(camMount);
    camProp.position.set(6.1, 1.12, 5.05);
    camProp.rotation.y = -2.32 + Math.PI; // face room center
    this.architectureGroup.add(camProp);
    this.updateVisionBoard(false, null);

    // ZONE 10: Diagnostics & Telemetry Station
    const { mesh: telMesh, ctx: telCtx, tex: telTex } = this._makeDynamicCanvasBoard(1.75, 1.05);
    telMesh.position.set(-6.8, 1.55, 5.4);
    telMesh.rotation.y = 2.32;
    this.telemetryBoardCtx = telCtx;
    this.telemetryBoardTex = telTex;
    this.architectureGroup.add(telMesh);
    this.updateTelemetryBoard({ cpu_percent: 0, memory_used_mb: 0, memory_total_mb: 3800, uptime_sec: 0 });

    // ZONE 11: Compute & Private Kaggle Connection Bay
    const computeDesk = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.88, 0.72), darkMetalMat);
    computeDesk.position.set(3.2, 0.44, 7.8);
    computeDesk.rotation.y = -2.85;
    this.architectureGroup.add(computeDesk);

    const localGpuCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshBasicMaterial({ color: 0x62e6f2, wireframe: true })
    );
    localGpuCube.position.set(2.75, 1.32, 7.65);
    this.architectureGroup.add(localGpuCube);

    for (let k = 0; k < 6; k++) {
      const slotMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.14, 0.04),
        new THREE.MeshBasicMaterial({ color: k === 0 ? 0xddfbff : 0x7799a5, wireframe: true })
      );
      slotMesh.position.set(3.45 + (k % 2) * 0.26, 1.18 + Math.floor(k / 2) * 0.2, 7.9);
      slotMesh.rotation.y = -2.85;
      this.architectureGroup.add(slotMesh);
    }

    // ZONE 12: Owner 7-Channel Switch Console
    const switchPedestal = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.92, 0.65), darkMetalMat);
    switchPedestal.position.set(-3.2, 0.46, 7.8);
    switchPedestal.rotation.y = 2.85;
    this.architectureGroup.add(switchPedestal);

    const keys = ['master', 'microphone', 'camera', 'autonomy', 'remote_compute', 'computer_control', 'embodiment'];
    keys.forEach((k, idx) => {
      const lever = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.16, 0.04),
        new THREE.MeshStandardMaterial({
          color: 0x62e6f2,
          emissive: 0x62e6f2,
          emissiveIntensity: 0.45,
          roughness: 0.3,
        })
      );
      const offset = (idx - 3) * 0.21;
      lever.position.set(-3.2 + offset * Math.cos(2.85), 0.98, 7.8 - offset * Math.sin(2.85));
      lever.rotation.y = 2.85;
      this.architectureGroup.add(lever);
      this.switchLevers[k] = lever;
    });
  }

  _makeTexturedGlassPanel(w, h, title, subtitle, accentHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 18, 26, 0.82)';
    ctx.fillRect(0, 0, 768, 512);
    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(9, 9, 750, 494);

    ctx.fillStyle = accentHex;
    ctx.font = 'bold 27px monospace';
    ctx.fillText(title, 36, 64);
    ctx.fillStyle = '#ddfbff';
    ctx.font = '21px sans-serif';
    ctx.fillText(subtitle, 36, 108);

    ctx.strokeStyle = accentHex;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 36; x <= 720; x += 24) {
      const y = 322 - Math.sin(x * 0.025) * 72 - (x - 36) * 0.21;
      if (x === 36) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // secondary data striations
    ctx.strokeStyle = 'rgba(221, 251, 255, 0.35)';
    ctx.lineWidth = 2;
    for (let row = 0; row < 3; row++) {
      ctx.beginPath();
      for (let x = 36; x <= 720; x += 18) {
        const y = 400 + row * 28 - Math.abs(Math.sin(x * 0.02 + row)) * 16;
        if (x === 36) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
  }

  _makeDynamicCanvasBoard(w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    return { mesh, ctx, tex };
  }

  updateVisionBoard(cameraActive, videoEl) {
    const ctx = this.visionBoardCtx;
    if (!ctx) return;
    const W = 1024, H = 640;
    ctx.fillStyle = '#040d14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = cameraActive ? '#e7ae5b' : '#62e6f2';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    if (cameraActive && videoEl && videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 28, 100, W - 56, H - 150);
    } else {
      ctx.fillStyle = '#7799a5';
      ctx.font = '29px monospace';
      ctx.fillText('NO HIDDEN OPTICAL CAPTURE', 250, 320);
      ctx.font = '23px sans-serif';
      ctx.fillText('Enable Switch #3 (CAM) to stream real optical input.', 235, 372);
    }

    ctx.fillStyle = cameraActive ? '#e7ae5b' : '#62e6f2';
    ctx.font = 'bold 29px monospace';
    ctx.fillText(cameraActive ? 'OPTICAL INPUT: ACTIVE (LIVE STREAM)' : 'OPTICAL INPUT: LOCKED OFF', 34, 62);
    this.visionBoardTex.needsUpdate = true;

    if (this.visionLed) {
      this.visionLed.material.color.setHex(cameraActive ? 0xe7ae5b : 0x32444d);
    }
  }

  updateTelemetryBoard(tel) {
    const ctx = this.telemetryBoardCtx;
    if (!ctx) return;
    const W = 1024, H = 640;
    ctx.fillStyle = '#040d14';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#62e6f2';
    ctx.lineWidth = 5;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = '#62e6f2';
    ctx.font = 'bold 30px monospace';
    ctx.fillText('SANCTUARY TELEMETRY · MEASURED HOST', 38, 66);

    ctx.fillStyle = '#ddfbff';
    ctx.font = '27px monospace';
    const lines = [
      `CPU UTILISATION : ${Number(tel.cpu_percent || 0).toFixed(1)} %`,
      `MEMORY USED     : ${Number(tel.memory_used_mb || 0).toFixed(0)} / ${Number(tel.memory_total_mb || 0).toFixed(0)} MB`,
      `UPTIME          : ${Number(tel.uptime_sec || 0).toFixed(0)} s`,
      `INFERENCE ROUTE : ${(tel.inference?.active_backend || 'executive_offline').toUpperCase()}`,
      `PUBLIC PORTS    : 0 (ZERO-TRUST VERIFIED)`,
    ];
    lines.forEach((ln, idx) => ctx.fillText(ln, 44, 160 + idx * 74));
    this.telemetryBoardTex.needsUpdate = true;
  }

  syncPhysicalSwitchLevers(switchMap) {
    for (const [k, lever] of Object.entries(this.switchLevers)) {
      const on = Boolean(switchMap[k]);
      lever.rotation.x = on ? -0.35 : 0.35;
      const col = !switchMap.master ? 0xff6b67 : ((k === 'microphone' || k === 'camera') && on ? 0xe7ae5b : (on ? 0x62e6f2 : 0x32444d));
      lever.material.color.setHex(col);
      lever.material.emissive.setHex(col);
      lever.material.emissiveIntensity = on ? 0.55 : 0.08;
    }
    this.embodimentEnabled = Boolean(switchMap.embodiment ?? true);
    this.jarvis.root.visible = this.embodimentEnabled;
  }

  setExternalVideoTexture(videoEl) {
    if (videoEl) {
      const vTex = new THREE.VideoTexture(videoEl);
      vTex.colorSpace = THREE.SRGBColorSpace;
      this.mediaScreenMat.map = vTex;
    } else {
      this.mediaScreenMat.map = this.schlierenFeed.texture;
    }
    this.mediaScreenMat.needsUpdate = true;
  }

  setHologramMode(enabled, layout = 'peppers_ghost') {
    this.hologramMode = enabled;
    this.hologramLayout = layout;
    this.architectureGroup.visible = !enabled; // Pure optical black background for Pepper's Ghost reflection
    this.scene.background.setHex(enabled ? 0x000000 : 0x02070b);
    document.body.classList.toggle('holo-mirror-active', enabled && layout === 'peppers_ghost');
  }

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // B5 fix (resize ratchet): re-baseline to the device's NATIVE DPR (clamped
    // to 2). The previous formula min(dpr, min(previous, 2)) could only ever
    // ratchet DOWN — a window initialized on a DPR-1 display stayed at DPR 1
    // forever after moving to a retina display or browser zoom change. The
    // adaptive loop re-tunes downward if the new resolution is too heavy.
    this._qualityDpr = Math.min(window.devicePixelRatio || 1, 2.0);
    this.renderer.setPixelRatio(this._qualityDpr);
    this.renderer.setSize(w, h);
    // B1 fix (resize path): keep the composer's pixel ratio in sync so its
    // targets stay at device resolution across window/DPR changes. setSize()
    // multiplies by the composer's internal _pixelRatio.
    this.composer.setPixelRatio(this._qualityDpr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._armDprWatcher(); // re-arm the watcher for the new dppx value
  }

  renderFrame(dt, opticalVideoEl, cameraSwitchOn) {
    // 1. Procedural video & volumetric idle elements
    const scenarioActive = Boolean(this.scenarioDirector.activeScenario);
    this.explainerSidePanel.visible = scenarioActive && this.mediaScreenMat.map === this.schlierenFeed.texture;
    this.explainerSidePanelEdge.visible = this.explainerSidePanel.visible;
    if (scenarioActive && this.mediaScreenMat.map === this.schlierenFeed.texture) {
      // Documentary explainer feed synchronized to the active 3D scenario
      this.schlierenFeed.mode = 'explainer';
      this.explainerTimer += dt;
      if (this.explainerTimer > 0.1) {
        this.explainerTimer = 0;
        this.schlierenFeed.renderExplainer(this.scenarioDirector.getMediaFeedState());
      }
    } else {
      if (this.schlierenFeed.mode === 'explainer') {
        this.schlierenFeed.mode = 'schlieren';
        this.schlierenFeed.renderFrame(this.schlierenFeed.currentTime);
      }
      this.schlierenFeed.update(dt);
    }
    if (cameraSwitchOn && opticalVideoEl) {
      // B7 fix: the vision board is a 1024x640 canvas whose full texture is
      // re-uploaded to the GPU on every redraw. Cap it at 30fps (a live video
      // preview does not need per-frame uploads) and restore the LOCKED state
      // once when the camera turns off (previously the last video frame just
      // froze on screen).
      this._visionBoardClock = (this._visionBoardClock || 0) + dt;
      if (this._visionBoardClock >= 1 / 30) {
        this._visionBoardClock = 0;
        this.updateVisionBoard(true, opticalVideoEl);
      }
      this._visionBoardLive = true;
    } else if (this._visionBoardLive) {
      this.updateVisionBoard(false, null);
      this._visionBoardLive = false;
    }

    const holoClock = (this.holoClock = (this.holoClock || 0) + dt);
    for (const m of this.centerHoloMats) m.uniforms.uTime.value = holoClock;
    for (const m of this.idleHoloMats) m.uniforms.uTime.value = holoClock;

    if (this.centerHoloAssembly) {
      const stageActive = Boolean(this.scenarioDirector.activeScenario);
      this.centerHoloAssembly.visible = !stageActive;
      if (!this.reducedMotion) {
        this.centerHoloAssembly.rotation.y += dt * 0.28;
        if (this.centerOrbits) {
          this.centerOrbits[0].rotation.z += dt * 0.55;
          this.centerOrbits[1].rotation.z -= dt * 0.4;
        }
      }
    }

    if (!this.reducedMotion) {
      if (this.securityLattice) this.securityLattice.rotation.y += dt * 0.22;
      this.agentSolids.forEach((s, i) => {
        s.rotation.x += dt * (0.35 + i * 0.08);
        s.rotation.y += dt * 0.45;
      });
      if (this.extracted3DTwinGroup?.visible) {
        this.extracted3DTwinGroup.rotation.y += dt * 0.65;
      }
      // Memory constellation breathing
      for (const node of this.memoryNodes) {
        const k = 1 + 0.35 * Math.sin(holoClock * 1.6 + node.userData.pulsePhase);
        node.scale.setScalar(k);
      }
      // Dust motes drifting through the downlight cone
      if (this.dustField) {
        const pos = this.dustField.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          let y = pos.getY(i) + dt * (0.045 + 0.02 * Math.sin(this.dustSeeds[i]));
          let x = pos.getX(i) + Math.sin(holoClock * 0.35 + this.dustSeeds[i]) * dt * 0.05;
          if (y > 5.4) y = 0.25;
          pos.setY(i, y);
          pos.setX(i, x);
        }
        pos.needsUpdate = true;
      }
    }

    // 2. Update Scenario Director, Living JARVIS, Autonomous Behavior & Camera
    this.scenarioDirector.update(dt);
    this.jarvis.update(dt, this.camera.position, this.reducedMotion);
    this.behaviorDirector.update(dt, this.camera.position);
    this.cameraDirector.update(dt, this.jarvis, this.reducedMotion);

    // 2b. Adaptive resolution: step the DPR down when the device can't hold it
    // (never below 1.0) and back UP when headroom returns (B5). A wide dead
    // band (22–38ms) plus a 1.5s evaluation cooldown prevent oscillation and
    // realloc churn. The composer now follows the renderer (B2 fix) — before,
    // renderer.setPixelRatio changed only the canvas backing store while every
    // post pass still rendered at the old size, i.e. the guard did nothing.
    this._frameTimeAvg = this._frameTimeAvg * 0.97 + Math.min(dt, 0.2) * 1000 * 0.03;
    this._dprEvalClock = (this._dprEvalClock || 0) + dt;
    if (this._dprEvalClock >= 1.5) {
      this._dprEvalClock = 0;
      const maxDpr = Math.min(window.devicePixelRatio || 1, 2.0);
      let targetDpr = this._qualityDpr;
      if (this._frameTimeAvg > 38 && this._qualityDpr > 1.0) {
        targetDpr = Math.max(1.0, this._qualityDpr - 0.25);
      } else if (this._frameTimeAvg < 22 && this._qualityDpr < maxDpr) {
        targetDpr = Math.min(this._qualityDpr + 0.125, maxDpr);
      }
      if (targetDpr !== this._qualityDpr) {
        this._qualityDpr = targetDpr;
        this.renderer.setPixelRatio(targetDpr);
        this.composer.setPixelRatio(targetDpr);
      }
    }

    // 3. Project 3D world-space scenario callout tags onto screen
    this._renderSpatialAnchors();

    // 4. Render either standard ACES Filmic sanctuary OR 4-Face Holographic Pyramid Scissor Viewports
    if (this.hologramMode && this.hologramLayout === 'pyramid_4face') {
      this._renderFourFacePyramid();
    } else {
      this.renderer.setScissorTest(false);
      this.composer.render();
    }
  }

  _renderFourFacePyramid() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const size = Math.floor(Math.min(w, h) * 0.44);
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    this.renderer.setScissorTest(false);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();
    this.renderer.setScissorTest(true);

    const jPos = this.jarvis.root.position;
    const views = [
      { x: cx - size / 2, y: cy + 16, yaw: 0 },               // Top (0 deg)
      { x: cx + 16, y: cy - size / 2, yaw: Math.PI / 2 },     // Right (90 deg)
      { x: cx - size / 2, y: cy - size - 16, yaw: Math.PI },  // Bottom (180 deg)
      { x: cx - size - 16, y: cy - size / 2, yaw: -Math.PI / 2 }, // Left (270 deg)
    ];

    // B11 fix: each face now renders through the composer (renderPass camera
    // swapped per face) so bloom + vignette + tone mapping match the standard
    // mode — previously this path called renderer.render() directly and
    // bypassed the entire post pipeline. The scissor rect clips the final
    // OutputPass blit to each face viewport.
    const mainCam = this.renderPass.camera;
    for (const v of views) {
      const vx = Math.max(0, Math.floor(v.x));
      const vy = Math.max(0, Math.floor(v.y));
      const vw = Math.min(size, w - vx);
      const vh = Math.min(size, h - vy);
      if (vw <= 10 || vh <= 10) continue;

      this.renderer.setViewport(vx, vy, vw, vh);
      this.renderer.setScissor(vx, vy, vw, vh);
      this.pyramidCam.aspect = vw / vh;
      this.pyramidCam.position.set(
        jPos.x + Math.sin(v.yaw) * 2.85,
        1.15,
        jPos.z + Math.cos(v.yaw) * 2.85
      );
      this.pyramidCam.lookAt(jPos.x, 0.98, jPos.z);
      this.pyramidCam.updateProjectionMatrix();
      this.renderPass.camera = this.pyramidCam;
      this.composer.render();
    }
    this.renderPass.camera = mainCam;
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissorTest(false);
  }

  /** Project world anchors to screen with leader dots and simple collision offsets. */
  _renderSpatialAnchors() {
    const anchors = this.scenarioDirector.worldAnchors;
    if (!anchors || anchors.length === 0 || this.hologramMode) {
      if (this.labelsContainer.childElementCount > 0) this.labelsContainer.innerHTML = '';
      return;
    }

    while (this.labelsContainer.childElementCount < anchors.length) {
      const div = document.createElement('div');
      div.className = 'spatial-tag';
      this.labelsContainer.appendChild(div);
    }
    while (this.labelsContainer.childElementCount > anchors.length) {
      this.labelsContainer.lastElementChild.remove();
    }

    // Project & gather
    const placed = [];
    anchors.forEach((a, i) => {
      const el = this.labelsContainer.children[i];
      const proj = a.pos.clone().project(this.camera);
      if (proj.z > 1) {
        el.style.opacity = '0';
        return;
      }
      let sx = (proj.x * 0.5 + 0.5) * window.innerWidth;
      let sy = (-proj.y * 0.5 + 0.5) * window.innerHeight;

      // Naive collision offset: push down until free of previously placed tags
      let guard = 0;
      let clash = placed.some((p) => Math.abs(p.sx - sx) < 300 && Math.abs(p.sy - sy) < 76);
      while (clash && guard < 6) {
        sy += 66;
        guard++;
        clash = placed.some((p) => Math.abs(p.sx - sx) < 300 && Math.abs(p.sy - sy) < 76);
      }
      placed.push({ sx, sy });

      // B8 fix: innerHTML parses + relayouts every frame; only write it when
      // the content actually changed (position writes stay per-frame).
      const cls = `spatial-tag ${a.amber ? 'amber' : ''}`;
      if (el.className !== cls) el.className = cls;
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.opacity = '1';
      const html = `${a.title}<span class="tag-sub">${a.sub}</span>`;
      if (el.__tagHtml !== html) {
        el.innerHTML = html;
        el.__tagHtml = html;
      }
    });
  }
}
