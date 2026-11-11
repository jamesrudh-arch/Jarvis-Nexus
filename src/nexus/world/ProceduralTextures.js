/**
 * JARVIS NEXUS — Procedural PBR Material Maps, Micro-Surface Normals & Feed Renderers.
 *
 * Ensures architectural basalt, honed slate, brushed titanium, spatial displays and
 * the character's skin/suit have distinct, grounded physical response rather than
 * flat uniform plastic. All textures request maximum anisotropic filtering so
 * grazing-angle zoom stays crisp (kills the "blurry when I zoom in" failure).
 */
import * as THREE from 'three';

let MAX_ANISO = 8;
export function setGlobalAnisotropy(n) {
  MAX_ANISO = Math.max(1, Math.min(16, n | 0));
}
function applyAniso(tex) {
  tex.anisotropy = MAX_ANISO;
  tex.needsUpdate = true;
  return tex;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createBasaltTextures() {
  const size = 1024;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#06121a';
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Horizontal split-stone basalt strata + micro fracture grain
  const rand = mulberry32(4219);
  for (let i = 0; i < 5200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const w = 12 + rand() * 92;
    const h = 3 + rand() * 26;
    const v = Math.floor(8 + rand() * 18);
    cCtx.fillStyle = `rgb(${Math.floor(v * 0.45)}, ${Math.floor(v * 0.85)}, ${v + 8})`;
    cCtx.fillRect(x, y, w, h);

    const bVal = Math.floor(70 + rand() * 115);
    bCtx.fillStyle = `rgb(${bVal},${bVal},${bVal})`;
    bCtx.fillRect(x, y, w, h * 0.65);

    const rVal = Math.floor(175 + rand() * 65);
    rCtx.fillStyle = `rgb(${rVal},${rVal},${rVal})`;
    rCtx.fillRect(x, y, w, h);
  }
  // Fine fracture hairlines for close-up readability
  cCtx.strokeStyle = 'rgba(3, 8, 12, 0.55)';
  bCtx.strokeStyle = 'rgba(40, 40, 40, 0.6)';
  for (let i = 0; i < 260; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 30 + rand() * 160;
    const ang = rand() * Math.PI;
    for (const ctx of [cCtx, bCtx]) {
      ctx.lineWidth = rand() > 0.7 ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.22);
      ctx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const t of [map, roughnessMap, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    applyAniso(t);
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap, bumpMap };
}

export function createHonedSlateFloorTextures() {
  const size = 2048;
  const colorCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = roughCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = roughCanvas.height = bumpCanvas.height = size;

  const cCtx = colorCanvas.getContext('2d');
  const rCtx = roughCanvas.getContext('2d');
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#050e15';
  cCtx.fillRect(0, 0, size, size);
  rCtx.fillStyle = '#5c666d';
  rCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#7d7d7d';
  bCtx.fillRect(0, 0, size, size);

  const rand = mulberry32(9913);
  for (let i = 0; i < 11000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 5 + rand() * 52;
    const shade = Math.floor(6 + rand() * 14);
    cCtx.fillStyle = `rgba(${shade}, ${shade + 7}, ${shade + 12}, 0.22)`;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();

    const rv = Math.floor(68 + rand() * 75);
    rCtx.fillStyle = `rgba(${rv}, ${rv}, ${rv}, 0.24)`;
    rCtx.beginPath();
    rCtx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    rCtx.fill();

    const bv = Math.floor(110 + rand() * 60);
    bCtx.fillStyle = `rgba(${bv},${bv},${bv},0.2)`;
    bCtx.beginPath();
    bCtx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    bCtx.fill();
  }

  // Architectural slab expansion joints (with chamfer highlight so seams read at distance)
  const grid = size / 8;
  for (let g = 0; g <= size; g += grid) {
    cCtx.strokeStyle = 'rgba(2, 5, 8, 0.9)';
    cCtx.lineWidth = 5;
    cCtx.beginPath(); cCtx.moveTo(g, 0); cCtx.lineTo(g, size); cCtx.stroke();
    cCtx.beginPath(); cCtx.moveTo(0, g); cCtx.lineTo(size, g); cCtx.stroke();
    cCtx.strokeStyle = 'rgba(70, 105, 120, 0.16)';
    cCtx.lineWidth = 1.4;
    cCtx.beginPath(); cCtx.moveTo(g + 3.4, 0); cCtx.lineTo(g + 3.4, size); cCtx.stroke();
    cCtx.beginPath(); cCtx.moveTo(0, g + 3.4); cCtx.lineTo(size, g + 3.4); cCtx.stroke();
    bCtx.strokeStyle = 'rgba(30,30,30,0.9)';
    bCtx.lineWidth = 6;
    bCtx.beginPath(); bCtx.moveTo(g, 0); bCtx.lineTo(g, size); bCtx.stroke();
    bCtx.beginPath(); bCtx.moveTo(0, g); bCtx.lineTo(size, g); bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  for (const t of [map, roughnessMap, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(7, 7);
    applyAniso(t);
  }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, roughnessMap, bumpMap };
}

/**
 * Tiling micro-surface normal map generated from value noise (finite-difference
 * bump → normal). Gives skin pore-level and fabric weave specular breakup so
 * close-ups never read as airbrushed wax or flat cloth.
 */
export function createMicroNormalTexture({ size = 256, scale = 24, strength = 1.0, weave = false, seed = 1337 } = {}) {
  const height = document.createElement('canvas');
  height.width = height.height = size;
  const hCtx = height.getContext('2d');
  const img = hCtx.createImageData(size, size);
  const rand = mulberry32(seed);

  // Multi-octave value noise field
  const gridN = Math.max(2, Math.round(scale));
  const grids = [];
  for (let o = 0; o < 3; o++) {
    const n = gridN * (1 << o);
    const g = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < g.length; i++) g[i] = rand();
    grids.push({ n, g });
  }
  const sample = (x, y) => {
    let v = 0, amp = 1, tot = 0;
    for (const { n, g } of grids) {
      const fx = x * n, fy = y * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const i00 = g[(y0 % (n + 1)) * (n + 1) + (x0 % (n + 1))];
      const i10 = g[(y0 % (n + 1)) * (n + 1) + ((x0 + 1) % (n + 1))];
      const i01 = g[((y0 + 1) % (n + 1)) * (n + 1) + (x0 % (n + 1))];
      const i11 = g[((y0 + 1) % (n + 1)) * (n + 1) + ((x0 + 1) % (n + 1))];
      v += (i00 * (1 - sx) + i10 * sx) * (1 - sy) * amp + (i01 * (1 - sx) + i11 * sx) * sy * amp;
      tot += amp;
      amp *= 0.5;
    }
    return v / tot;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let h = sample(u, v);
      if (weave) {
        // crossed warp/weft threads
        const warp = Math.sin(u * Math.PI * 2 * 46) * 0.5 + 0.5;
        const weft = Math.sin(v * Math.PI * 2 * 46) * 0.5 + 0.5;
        h = h * 0.45 + Math.max(warp, weft) * 0.4 + Math.min(warp, weft) * 0.15;
      }
      img.data[(y * size + x) * 4] = img.data[(y * size + x) * 4 + 1] = img.data[(y * size + x) * 4 + 2] = h * 255;
      img.data[(y * size + x) * 4 + 3] = 255;
    }
  }
  hCtx.putImageData(img, 0, 0);

  // Finite-difference → normal map (wrap-around for tiling)
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const oCtx = out.getContext('2d');
  const oImg = oCtx.createImageData(size, size);
  const lum = (x, y) => img.data[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
      const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      oImg.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      oImg.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      oImg.data[i + 2] = inv * 255;
      oImg.data[i + 3] = 255;
    }
  }
  oCtx.putImageData(oImg, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  applyAniso(tex);
  return tex;
}

/** Soft radial ground-contact shadow disc (character & props). */
export function createSoftContactShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.5);
  g.addColorStop(0, 'rgba(0,0,0,0.62)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Vertical gradient alpha texture for volumetric light cones & holo projection cones. */
export function createConeGradientTexture(topAlpha = 0.0, midAlpha = 0.34, bottomAlpha = 0.02) {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, `rgba(255,255,255,${topAlpha})`);
  g.addColorStop(0.42, `rgba(255,255,255,${midAlpha})`);
  g.addColorStop(1, `rgba(255,255,255,${bottomAlpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Floating architectural zone signage plate texture (etched glass look). */
export function createZoneLabelTexture(index, title, sub, accent = '#62e6f2') {
  const w = 512, h = 192;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(4, 14, 20, 0.66)';
  ctx.beginPath();
  ctx.roundRect(6, 6, w - 12, h - 12, 14);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // corner ticks
  ctx.lineWidth = 3;
  for (const [cx, cy, dx, dy] of [[18, 18, 1, 1], [w - 18, 18, -1, 1], [18, h - 18, 1, -1], [w - 18, h - 18, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * 16, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * 16);
    ctx.stroke();
  }

  ctx.fillStyle = accent;
  ctx.font = 'bold 17px monospace';
  ctx.fillText(`ZONE ${String(index).padStart(2, '0')}`, 34, 52);
  ctx.fillStyle = '#e6f8ff';
  ctx.font = 'bold 34px monospace';
  ctx.fillText(title.toUpperCase(), 34, 100);
  ctx.fillStyle = '#8fb6c2';
  ctx.font = '19px monospace';
  ctx.fillText(sub.toUpperCase(), 34, 140);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  applyAniso(tex);
  return tex;
}

/**
 * Remaps bright white inner-blouse pixels on Avaturn's suit texture to a tailored
 * midnight-slate knit (#0E1822) and deepens suit charcoal (#1C252E) to match our approved storyboard.
 */
export function tailorSuitAlbedoTexture(sourceTex) {
  if (!sourceTex || !sourceTex.image) return sourceTex;
  const img = sourceTex.image;
  const w = img.width || 1024;
  const h = img.height || 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    if (lum > 145 && sat < 38) {
      // Inner white shirt -> deep midnight mock-neck knit (#0E1822) preserving fold shading
      const shade = lum / 255;
      d[i] = Math.round(14 * shade);
      d[i + 1] = Math.round(25 * shade);
      d[i + 2] = Math.round(36 * shade);
    } else {
      // Tailor grey suit -> rich architectural charcoal-slate (#1D2630)
      const factor = 0.62;
      d[i] = Math.min(255, Math.round(r * factor * 0.92));
      d[i + 1] = Math.min(255, Math.round(g * factor * 0.98));
      d[i + 2] = Math.min(255, Math.round(b * factor * 1.08));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const out = new THREE.CanvasTexture(canvas);
  out.flipY = sourceTex.flipY;
  out.colorSpace = THREE.SRGBColorSpace;
  applyAniso(out);
  out.needsUpdate = true;
  return out;
}

/**
 * Real-time procedural feeds for the frameless Media Wall.
 *  - Schlieren optical stator benchmark (default idle clip)
 *  - Explainer mode: a documentary-style annotated panel synced live to the
 *    active 3D scenario (phase captions, cue timeline, measured curves,
 *    live variable readouts, verified-fact vs inference legend).
 */
export class SchlierenFeedRenderer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1280;
    this.canvas.height = 720;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    applyAniso(this.texture);
    this.currentTime = 14.2;
    this.playing = false;
    this.duration = 24.0;
    this.mode = 'schlieren';
    this.renderFrame(14.2);
  }

  update(dt) {
    if (this.playing) {
      this.currentTime = (this.currentTime + dt) % this.duration;
      this.renderFrame(this.currentTime);
    }
  }

  seek(t) {
    this.currentTime = Math.max(0, Math.min(this.duration, t));
    this.renderFrame(this.currentTime);
  }

  renderFrame(t) {
    if (this.mode === 'explainer') return; // drawn per-state, not per-clock
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // High-contrast monochrome/ice Schlieren optical wind-tunnel field
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#071017');
    grad.addColorStop(0.5, '#172733');
    grad.addColorStop(1, '#060d13');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.48;
    const cy = h * 0.5;
    const outerR = 250;
    const hubR = 96;

    ctx.strokeStyle = '#c8e4ec';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, outerR, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, Math.PI * 2); ctx.stroke();

    const vortexSurge = Math.exp(-Math.pow(t - 14.2, 2) / 6.5);
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + t * 0.65;
      const x1 = cx + Math.cos(ang) * hubR;
      const y1 = cy + Math.sin(ang) * hubR;
      const x2 = cx + Math.cos(ang + 0.14) * outerR;
      const y2 = cy + Math.sin(ang + 0.14) * outerR;

      ctx.strokeStyle = 'rgba(221, 251, 255, 0.86)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(
        cx + Math.cos(ang + 0.09) * ((hubR + outerR) * 0.52),
        cy + Math.sin(ang + 0.09) * ((hubR + outerR) * 0.52),
        x2, y2
      );
      ctx.stroke();

      ctx.strokeStyle = vortexSurge > 0.45 && i % 3 === 0
        ? `rgba(231, 174, 91, ${0.35 + 0.5 * vortexSurge})`
        : 'rgba(98, 230, 242, 0.26)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(cx, cy, hubR + 26 + (i % 5) * 24, ang, ang + 0.24 + vortexSurge * 0.22);
      ctx.stroke();
    }

    if (vortexSurge > 0.35) {
      const vx = cx + 122;
      const vy = cy - 56;
      ctx.strokeStyle = `rgba(231, 174, 91, ${vortexSurge})`;
      ctx.lineWidth = 2.4;
      ctx.strokeRect(vx - 48, vy - 48, 96, 96);
      ctx.fillStyle = '#e7ae5b';
      ctx.font = '17px monospace';
      ctx.fillText('DETACHMENT LOCUS · dP/dr SPIKE', vx + 58, vy - 14);
    }

    // Frame telemetry overlay
    ctx.fillStyle = 'rgba(2, 7, 11, 0.78)';
    ctx.fillRect(0, h - 52, w, 52);
    ctx.fillStyle = '#62e6f2';
    ctx.fillRect(0, h - 52, (t / this.duration) * w, 3);

    ctx.fillStyle = '#ddfbff';
    ctx.font = '17px monospace';
    ctx.fillText(`SCHLIEREN OPTICAL BENCH · TC ${t.toFixed(2).padStart(5, '0')}s / ${this.duration.toFixed(1)}s`, 24, h - 20);
    ctx.fillStyle = '#7799a5';
    ctx.fillText(this.playing ? 'PLAYING · 60 HZ' : 'PAUSED FOR 3D EXTRACTION', w - 330, h - 20);

    this.texture.needsUpdate = true;
  }

  /**
   * Documentary-style explanatory "video frame" for the active scenario.
   * state = { title, classification, phase, t, duration, cues, variables,
   *           series, branch, scrubHint }
   */
  renderExplainer(state) {
    if (!state) return;
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const CYAN = '#62e6f2';
    const AMBER = '#e7ae5b';
    const ICE = '#ddfbff';

    // Base glass panel
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#050f16');
    bg.addColorStop(1, '#030a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // faint grid
    ctx.strokeStyle = 'rgba(98, 230, 242, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Header
    ctx.fillStyle = 'rgba(2, 7, 11, 0.85)';
    ctx.fillRect(0, 0, W, 96);
    ctx.strokeStyle = 'rgba(98, 230, 242, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 96); ctx.lineTo(W, 96); ctx.stroke();

    ctx.fillStyle = CYAN;
    ctx.font = 'bold 21px monospace';
    ctx.fillText('VOLUMETRIC EXPLAINER · LIVE SYNC', 28, 38);
    ctx.fillStyle = ICE;
    ctx.font = 'bold 30px monospace';
    const title = (state.title || 'SCENARIO').toUpperCase();
    ctx.fillText(title.length > 52 ? title.slice(0, 52) + '…' : title, 28, 76);

    // Classification chip
    ctx.font = 'bold 17px monospace';
    const chip = (state.classification || 'illustration').replaceAll('_', ' ').toUpperCase();
    const chipW = ctx.measureText(chip).width + 34;
    ctx.strokeStyle = AMBER;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(W - chipW - 26, 30, chipW, 38);
    ctx.fillStyle = AMBER;
    ctx.fillText(chip, W - chipW - 9, 55);

    // Left column: phase + cue timeline
    const colL = 28;
    const colW = 470;
    let y = 148;
    ctx.fillStyle = '#7799a5';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('ACTIVE PHASE', colL, y);
    y += 42;
    ctx.fillStyle = ICE;
    ctx.font = 'bold 33px monospace';
    const phase = (state.phase || '—').toUpperCase();
    const lines = [];
    let cur = '';
    for (const word of phase.split(' ')) {
      if ((cur + ' ' + word).trim().length > 24) { lines.push(cur.trim()); cur = word; } else cur += ' ' + word;
    }
    if (cur.trim()) lines.push(cur.trim());
    for (const ln of lines.slice(0, 3)) { ctx.fillText(ln, colL, y); y += 42; }

    // Cue timeline with ticks & progress
    y += 28;
    const tlW = colW;
    ctx.strokeStyle = 'rgba(143, 182, 194, 0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(colL, y); ctx.lineTo(colL + tlW, y); ctx.stroke();
    const cues = state.cues || [];
    for (const cue of cues) {
      const cx = colL + (cue.t / Math.max(1, state.duration)) * tlW;
      ctx.strokeStyle = cue.t <= state.t ? CYAN : '#5a727c';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, y - 12); ctx.lineTo(cx, y + 12); ctx.stroke();
      ctx.fillStyle = cue.t <= state.t ? CYAN : '#5a727c';
      ctx.font = '13px monospace';
      const lbl = `T+${cue.t.toFixed(1)}`;
      ctx.fillText(lbl, Math.min(cx + 5, colL + tlW - 52), y + 30);
    }
    const px = colL + (state.t / Math.max(1, state.duration)) * tlW;
    ctx.fillStyle = ICE;
    ctx.beginPath();
    ctx.moveTo(px, y - 9); ctx.lineTo(px - 8, y - 21); ctx.lineTo(px + 8, y - 21);
    ctx.closePath(); ctx.fill();

    // Variables readout
    y += 66;
    ctx.fillStyle = '#7799a5';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('LIVE PARAMETERS (OWNER-ADJUSTABLE)', colL, y);
    y += 16;
    const vars = state.variables || [];
    for (const v of vars.slice(0, 5)) {
      y += 40;
      ctx.strokeStyle = v.tone === 'amber' ? AMBER : CYAN;
      ctx.lineWidth = 1.4;
      ctx.strokeRect(colL, y - 27, tlW, 34);
      ctx.fillStyle = '#9fc0cb';
      ctx.font = '16px monospace';
      ctx.fillText(v.label.toUpperCase().slice(0, 30), colL + 12, y - 5);
      ctx.fillStyle = v.tone === 'amber' ? AMBER : ICE;
      ctx.font = 'bold 19px monospace';
      const valTxt = `${v.value} ${v.unit || ''}`.trim();
      ctx.fillText(valTxt, colL + tlW - 18 - ctx.measureText(valTxt).width, y - 5);
    }

    // Right column: measured curves plot
    const plotX = 540, plotY = 150, plotW = W - plotX - 30, plotH = 360;
    ctx.fillStyle = 'rgba(6, 18, 26, 0.6)';
    ctx.fillRect(plotX, plotY, plotW, plotH);
    ctx.strokeStyle = 'rgba(98, 230, 242, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(plotX, plotY, plotW, plotH);
    ctx.fillStyle = '#7799a5';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('MEASURED TRACES · T-SERIES', plotX + 16, plotY + 32);

    // grid
    ctx.strokeStyle = 'rgba(143, 182, 194, 0.16)';
    ctx.lineWidth = 1;
    for (let gy = 1; gy < 4; gy++) {
      ctx.beginPath(); ctx.moveTo(plotX, plotY + (plotH - 70) * gy / 4 + 20); ctx.lineTo(plotX + plotW, plotY + (plotH - 70) * gy / 4 + 20); ctx.stroke();
    }

    const plotBottom = plotY + plotH - 52;
    const plotTopY = plotY + 56;
    for (const s of (state.series || []).slice(0, 3)) {
      if (!s.points || s.points.length < 2) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      let started = false;
      for (const p of s.points) {
        const x = plotX + 16 + (p.t / Math.max(0.001, state.duration)) * (plotW - 32);
        const vNorm = Math.max(0, Math.min(1, (p.v - s.minV) / Math.max(0.001, s.maxV - s.minV)));
        const yv = plotBottom - vNorm * (plotBottom - plotTopY);
        if (!started) { ctx.moveTo(x, yv); started = true; } else ctx.lineTo(x, yv);
      }
      ctx.stroke();
      // current value dot
      const curP = this._sampleSeries(s, state.t);
      if (curP !== null) {
        const x = plotX + 16 + (state.t / Math.max(0.001, state.duration)) * (plotW - 32);
        const vNorm = Math.max(0, Math.min(1, (curP - s.minV) / Math.max(0.001, s.maxV - s.minV)));
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(x, plotBottom - vNorm * (plotBottom - plotTopY), 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    // playhead
    const phx = plotX + 16 + (state.t / Math.max(0.001, state.duration)) * (plotW - 32);
    ctx.strokeStyle = 'rgba(221, 251, 255, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(phx, plotTopY - 8); ctx.lineTo(phx, plotBottom); ctx.stroke();
    ctx.setLineDash([]);

    // Legend
    const legY = plotY + plotH + 40;
    let legX = plotX;
    for (const l of (state.legend || [{ color: CYAN, text: 'CYAN · MEASURED FACT' }, { color: AMBER, text: 'AMBER · INFERENCE' }])) {
      ctx.fillStyle = l.color;
      ctx.fillRect(legX, legY - 12, 26, 6);
      ctx.fillStyle = '#9fc0cb';
      ctx.font = '15px monospace';
      ctx.fillText(l.text, legX + 36, legY - 4);
      legX += 36 + ctx.measureText(l.text).width + 44;
    }

    // Branch banner
    if (state.branch) {
      const bY = legY + 46;
      const warn = state.branch.severity === 'critical' || state.branch.severity === 'warning';
      ctx.strokeStyle = warn ? '#ff6b67' : CYAN;
      ctx.lineWidth = 2;
      ctx.strokeRect(plotX, bY - 30, W - plotX - 30, 58);
      ctx.fillStyle = warn ? '#ff6b67' : CYAN;
      ctx.font = 'bold 19px monospace';
      ctx.fillText('▸ ' + (state.branch.label || 'BRANCH').toUpperCase(), plotX + 16, bY - 8);
      ctx.fillStyle = '#9fc0cb';
      ctx.font = '16px monospace';
      const outcome = state.branch.outcome || '';
      ctx.fillText(outcome.length > 74 ? outcome.slice(0, 74) + '…' : outcome, plotX + 16, bY + 16);
    }

    // Footer
    ctx.fillStyle = 'rgba(2, 7, 11, 0.85)';
    ctx.fillRect(0, H - 46, W, 46);
    ctx.fillStyle = ICE;
    ctx.font = '17px monospace';
    ctx.fillText(`REPLAY ${state.t.toFixed(1).padStart(4, '0')}s / ${state.duration.toFixed(1)}s`, 28, H - 17);
    ctx.fillStyle = '#7799a5';
    ctx.fillText('STAGE GEOMETRY & TRACES SYNCHRONIZED · JARVIS NEXUS VOLUMETRIC DIRECTOR', 380, H - 17);

    this.texture.needsUpdate = true;
  }

  _sampleSeries(s, t) {
    if (!s.points || !s.points.length) return null;
    if (t <= s.points[0].t) return s.points[0].v;
    const last = s.points[s.points.length - 1];
    if (t >= last.t) return last.v;
    for (let i = 1; i < s.points.length; i++) {
      if (s.points[i].t >= t) {
        const a = s.points[i - 1], b = s.points[i];
        const f = (t - a.t) / Math.max(0.001, b.t - a.t);
        return a.v + (b.v - a.v) * f;
      }
    }
    return last.v;
  }
}
