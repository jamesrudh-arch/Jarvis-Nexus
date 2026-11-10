import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const BASE = '/home/z/my-project/download/jarvis-nexus-preproduction';
const REF = path.join(BASE, 'v2_proof/canon_ref.png');
const OUT = path.join(BASE, 'storyboard_v2');
fs.mkdirSync(OUT, { recursive: true });

// identity lock — the owner-approved anchor (IMG_9024)
const CHAR = ("the exact same woman from the reference image: same slim face with " +
  "high cheekbones and angular jawline, same dark eyebrows, same olive-fair " +
  "skin, same dark brown hair pulled back into a low bun, same black " +
  "turtleneck under the same structured dark blazer, same wristwatch on her " +
  "left wrist, apparent age 37, matte realistic skin with visible pores, " +
  "natural eyes with a single soft catchlight");

const DNA = ("holograms rendered as cyan-teal wireframe geometry mixed with dense " +
  "voxel point-cloud particles, crisp light with no bloom blowout, every " +
  "hologram is a real light source casting cyan light onto her face, hands " +
  "and clothing, casting her real shadow on the glossy black floor, and the " +
  "glowing floor rings cast cyan up-light onto her legs and boots");

const ENV = ("inside an enclosed subterranean high-tech facility: near-black " +
  "basalt walls, dark brushed steel, glossy black reflective floor with " +
  "glowing cyan circuit rings and guide lines, a round glass-top pedestal " +
  "hologram table with an illuminated rim, tall glass data columns with " +
  "slowly scrolling light streams in the background, faint volumetric haze — " +
  "the room is always dark charcoal and cyan, never white, never a bright clinic");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, " +
  "restrained color grade, charcoal-black and cyan palette with warm amber " +
  "reserved for warnings and one sparse red accent only where noted, deep " +
  "shadows, generous dark negative space, high detail, no text, no labels, " +
  "no watermark");

const HANDS = ("hands naturally posed, fingers clearly separated and articulated, " +
  "fingertips cleanly outside or at the edge of hologram volumes, no clipping " +
  "or merging with projections");

const FRAMES = [
  ["f02_living_presence.jpg", "1344x768",
   `Medium-wide shot of ${CHAR} working quietly alone at the central holo-ring pedestal table in the vast dark facility, unhurried and composed, assembling a large cyan wireframe turbine structure piece by piece in mid-air above the table, one element half-attached and trailing voxel particles, completely alone in the monumental space, darkness stretching far around her, one glass data column glowing faintly in the background, the calm of deep focus on her face. ${DNA}. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f03_walking_conversing.jpg", "1344x768",
   `Eye-level tracking shot beside and slightly behind her: ${CHAR} mid-stride walking at a natural grounded heel-to-toe pace down the central axis of the facility toward the holo-ring, arms swinging naturally, her head turned toward the owner walking just off-frame left, mid-sentence with a warm attentive expression as if conversing while walking, cyan floor guide lines running ahead of her, dark consoles passing on both sides. ${DNA}. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f04_turn_acknowledge.jpg", "1344x768",
   `Over-the-shoulder shot from the owner's eye level: ${CHAR} was working at a curved dark console and is now turning toward the camera — her eyes already making direct contact, head following, shoulders last — one hand still resting on the console edge, its cyan glow on her cheek, the unfinished task panel still glowing behind her, her expression politely attentive with a faint dry amusement, eyebrows slightly raised in greeting. ${DNA}. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f07_urgent_alert.jpg", "1344x768",
   `Low wide dynamic shot: ${CHAR} running with controlled urgency across the dark operations floor toward the far end of the facility, mid-stride at full pace, the edge of her blazer lifted by motion, a few strands of hair loose from her bun, the nearest floor guide line pulsing warm amber under her boots casting amber up-light on her legs, consoles dimmed around her, her expression decisive and focused, not panicked. ${ENV}. ${HANDS}. ${STYLE} with the amber floor line as the only warm element.`],

  ["f08_memory_archive.jpg", "1344x768",
   `${CHAR} standing in a colonnade of tall transparent glass data columns, each column filled with slowly drifting luminous motes of light — the nearest column glows ice-white, a second glows soft amber — she reaches toward the amber column with her hand hovering just outside the glass, her face reflected faintly in its surface, a thoughtful careful expression, weighing what is known against what is only supposed. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f09_goals_wall.jpg", "1344x768",
   `${CHAR} standing at a dark architectural wall across which a thin network of glowing dependency lines and milestone nodes extends, one path lighting up in sequence as her fingertip traces it, most nodes ice-white and complete, one amber node in progress, the wall's light soft on her profile and hand, expression of quiet planning focus. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f11_live_research.jpg", "1344x768",
   `Tight over-the-shoulder shot at a research alcove desk: ${CHAR} leaning slightly forward, reading two floating translucent document planes and one empirical curve chart, a thin luminous provenance thread linking a claim on one plane to its source on the other, a warm desk lamp glow from the right balancing the cool cyan planes from the left across her face, absorbed scholarly expression, wristwatch visible. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f12_simulation.jpg", "1344x768",
   `Wide symmetrical shot: ${CHAR} standing exactly between two side-by-side volumetric turbine simulations floating over the dark stage floor — the left one clean cyan with smooth laminar flow lines, the right one amber-tinted with visible turbulent stress vectors at the hub corners — each simulation casting its own color onto the corresponding side of her face and blazer, cyan from the left, amber from the right, her analytical gaze comparing them, hands clasped loosely behind her back. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f13_scenario_build.jpg", "1344x768",
   `${CHAR} pulling a glowing wireframe element from a floating palette beside her, the element growing into a room-scale scene assembling itself around her on the dark stage — pipe structures, platforms and a suspended vessel transitioning from dim wireframe toward solidity, everything at a half-brightness drafting state, her extended hand mid-pull with the element trailing voxel particles, creative decisive focus on her face. ${DNA}. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f15_video_present.jpg", "1344x768",
   `${CHAR} standing beside a large frameless architectural media wall displaying a paused technical video frame of a turbine test, her hand raised in a calm pause gesture, her body angled beside the wall and never blocking it, the wall the dominant light source illuminating her from the front-left, and beside the wall the paused frame's content beginning to materialize as a small volumetric wireframe twin floating in the open air. ${DNA}. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f16_vision_security.jpg", "1344x768",
   `${CHAR} standing composed inside a subtle translucent pyramid of light marking the active optical input volume, a defensive boundary lattice of thin cyan lines surrounding her workspace at floor level, one dark monitor behind her showing a single sparse red moving trace, her posture calm and vigilant, hands relaxed at her sides. ${ENV}. ${HANDS}. ${STYLE} with that one red trace as the only red element.`],

  ["f17_compute_link.jpg", "1344x768",
   `${CHAR} seating a small dark device cartridge firmly into a slot on a utilitarian compute wall console, honest visible hardware with real fasteners and cabling, one amber status bar climbing on the small panel above the slot casting warm light on her hands, her expression of quiet verification, the rest of the bay dark. ${ENV}. ${HANDS}. ${STYLE}.`],

  ["f18_owner_switches.jpg", "1344x768",
   `Over-the-shoulder shot from the owner's point of view toward a monumental dark console holding seven large physical toggle switches in a row under a warm key light, each switch heavy and clearly mechanical with a amber indicator lamp, ${CHAR} standing one respectful pace back at the frame's edge in soft focus, calm ready stance with hands loosely clasped, watching the owner, never touching the switches herself. ${ENV}. ${STYLE}.`],

  ["f19_mobile.jpg", "1344x768",
   `A smartphone held in a hand in the sharp foreground, its glowing vertical screen showing ${CHAR} standing at attentive rest at the holo-ring, addressing the camera directly with a small welcoming smile, clearly alive and present inside the small screen, the dark facility blurred around the phone, the screen's light spilling softly onto the holding hand. ${DNA}. ${ENV}. ${STYLE}.`],

  ["f20_hologram.jpg", "1344x768",
   `Shot through a tilted transparent glass prism surface in the near foreground: a luminous full-body hologram of ${CHAR} standing on a raised dark platform with cyan rim lighting, identical to her living appearance, the hologram slightly translucent with the faintest horizontal scan lines, the audience-side foreground in darkness, the hologram itself the only light source, particles drifting upward through her form. ${DNA}. ${ENV}. ${STYLE}.`],
];

// frames already produced and QC-passed in v2_proof — copy, don't regenerate
const REUSE = [
  ['f01_first_wake.jpg', 'p5_first_wake.jpg'],
  ['f05_conversational_focus.jpg', 'p1_face_closeup.jpg'],
  ['f06_console_work.jpg', 'p3_engineering.jpg'],
  ['f10_multi_agent.jpg', 'p4_spatial_research.jpg'],
  ['f14_scenario_direct.jpg', 'p2_scenario_recreation.jpg'],
];

function toDataUrl(p) {
  return `data:image/png;base64,${fs.readFileSync(p).toString('base64')}`;
}

async function doEdit(zai, refUrl, name, size, prompt, attempt = 1) {
  const out = path.join(OUT, name);
  try {
    const t0 = Date.now();
    const res = await zai.images.generations.edit({
      prompt, images: [{ url: refUrl }], size,
    });
    const item = res?.data?.[0] || {};
    let buf = null;
    if (item.base64 || item.b64_json) buf = Buffer.from(item.base64 || item.b64_json, 'base64');
    else if (item.url) {
      const r = await fetch(item.url);
      if (!r.ok) throw new Error('fetch url failed ' + r.status);
      buf = Buffer.from(await r.arrayBuffer());
    }
    if (!buf || buf.length < 30000) throw new Error('empty/short output');
    fs.writeFileSync(out, buf);
    console.log(`OK   ${name} (${(buf.length / 1024).toFixed(0)} KB, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    return true;
  } catch (e) {
    const msg = String(e.message || e);
    console.error(`ERR  ${name} attempt ${attempt}: ${msg.slice(0, 160)}`);
    if (attempt < 4) {
      const wait = msg.includes('429') ? 90000 * attempt : 5000 * attempt;
      console.log(`     waiting ${(wait / 1000).toFixed(0)}s before retry...`);
      await new Promise(r => setTimeout(r, wait));
      return doEdit(zai, refUrl, name, size, prompt, attempt + 1);
    }
    return false;
  }
}

// copy reused frames
for (const [dst, src] of REUSE) {
  fs.copyFileSync(path.join(BASE, 'v2_proof', src), path.join(OUT, dst));
  console.log(`COPY ${dst} <- v2_proof/${src}`);
}

const zai = await ZAI.create();
const refUrl = toDataUrl(REF);
// CLI filter: node gen_storyboard_v2.mjs f02 f03 f04 ...
const filter = process.argv.slice(2);
let ok = 0;
const todo = FRAMES
  .filter(([n]) => !(fs.existsSync(path.join(OUT, n)) && fs.statSync(path.join(OUT, n)).size > 30000))
  .filter(([n]) => filter.length === 0 || filter.some(f => n.startsWith(f)));
console.log(`${FRAMES.length} frames total, ${todo.length} to generate`);
for (const [name, size, prompt] of todo) {
  if (await doEdit(zai, refUrl, name, size, prompt)) ok++;
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${todo.length}`);
fs.writeFileSync(path.join(OUT, '_gen_status.txt'),
  `generated ${ok}/${todo.length} at ${new Date().toISOString()}\n`);
process.exit(ok === todo.length ? 0 : 1);
