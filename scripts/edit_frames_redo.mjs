import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const V2 = '/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof';
const REF = path.join(V2, 'canon_ref.png');

// identity reinforced with anchor's actual features (VLM-extracted)
const CHAR = ("the exact same woman from the reference image: same slim face with " +
  "high cheekbones and angular jawline, same dark eyebrows, same olive-fair " +
  "skin, same dark brown hair pulled back into a low bun, same black " +
  "turtleneck under the same structured dark blazer, same wristwatch on her " +
  "left wrist, apparent age 37, matte realistic skin, natural eyes with a " +
  "single soft catchlight, no enlarged or glowing eyes");

const DNA = ("hologram rendered as cyan-teal wireframe geometry mixed with dense " +
  "voxel point-cloud particles, crisp light with no bloom blowout, the " +
  "hologram is a real light source that casts cyan light onto her face, " +
  "hands and clothing, casts her real shadow on the floor, and the glowing " +
  "floor rings cast cyan up-light onto her legs and boots");

const ENV = ("inside a dark subterranean high-tech facility: near-black basalt " +
  "walls, dark brushed steel, glossy black reflective floor with glowing " +
  "cyan circuit rings and guide lines, a round glass-top pedestal hologram " +
  "table with an illuminated rim, faint volumetric haze — the entire room " +
  "is dark charcoal and cyan, absolutely NOT a white or bright clinic");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, " +
  "restrained color grade, charcoal-black and cyan palette, orange used " +
  "only for the single critical data element, deep shadows, high detail, " +
  "no watermark");

const REDO = [
  // p0 redo: no data labels (garbled), no matrix-rain columns, floor up-light on legs
  ["p0_character_sheet.png", "864x1152",
   `Full-length character design sheet of ${CHAR}, standing close enough to camera that her face is clearly detailed, relaxed asymmetric stance with weight on one leg, one hand resting on the edge of the dark pedestal table, looking toward the camera with calm confident direct eye contact and a faint dry half-smile. A single abstract cyan wireframe architectural form floats above the table, its cyan light on her face and hand. The glowing floor ring beside her casts cyan up-light onto her trousers and boots and throws her shadow across the black floor. ${ENV}. Hands natural, fingers clearly separated. No text, no labels, no data displays. ${STYLE}.`],

  // p2 redo: medium shot (face resolvable), hand outside volume, purposeful human figures
  ["p2_scenario_recreation.png", "1344x768",
   `Medium-wide shot of ${CHAR} standing one step outside a walkable full-scale incident reconstruction: a frozen industrial accident rebuilt as translucent data — voxel point-cloud pipes and machinery with clean cyan wireframe edges, debris suspended mid-air, and one translucent cyan wireframe human figure, a worker frozen mid-motion at the moment of failure. She points with her right index finger from outside the volume at the single POINT OF ORIGIN glowing solid orange, her hand and fingers fully visible, clearly separate from the hologram, never entering it. The orange light of the origin point tints her fingertips and wrist. Exactly two thin floating labels only: 'INCIDENT RECONSTRUCTION: PHASE 1' and 'VOXEL RESOLUTION: 3MM' in clean legible uppercase. A faint timeline ring glows in the floor around the scene. ${DNA}. ${ENV}. ${STYLE}.`],

  // p3 redo: enforce dark environment continuity
  ["p3_engineering.png", "1344x768",
   `${CHAR} at work beside a black reflective console in the dark facility, her right hand raised and turning a large cyan wireframe turbine rotor assembly hologram in mid-air, fingers clearly separated, left hand resting on the console edge, wristwatch visible. Two or three small clean numeric callouts connect to the assembly by thin leader lines, fully legible, nothing else. The hologram casts cyan light on her face from the left and on the glossy black floor, her focused eyes tracking the part, natural realistic eyes. Behind her only darkness, basalt walls and the faint rim of the pedestal table — the room is dark charcoal, never white. ${DNA}. ${ENV}. ${STYLE}.`],

  // p5 redo2: stronger ignition, visible bun, cyan rim on silhouette
  ["p5_first_wake.png", "1344x768",
   `Medium-wide shot from behind and slightly low: ${CHAR} walking away from camera down the central axis of the facility during first power-on, her figure large enough that her structured blazer, her dark low bun clearly visible at the back of her head, and her confident mid-stride are all clearly readable. The cyan floor circuit ring directly beneath her flares bright as it ignites, casting strong cyan up-light onto her boots, trouser cuffs and the hem and back of her blazer, tracing a clear cyan rim light along her entire silhouette, her long shadow stretching back toward camera across the glossy black floor. More rings ignite ahead one by one, console banks waking in sequence, faint cyan glow filling the haze, glass columns beginning to light in the far background. ${ENV}. ${STYLE}.`],
];

function toDataUrl(p) {
  const b = fs.readFileSync(p);
  return `data:image/png;base64,${b.toString('base64')}`;
}

async function doEdit(zai, refUrl, name, size, prompt, attempt = 1) {
  const out = path.join(V2, name);
  try {
    const t0 = Date.now();
    const res = await zai.images.generations.edit({
      prompt, images: [{ url: refUrl }], size,
    });
    const item = res?.data?.[0] || {};
    const b64 = item.base64 || item.b64_json;
    let buf = null;
    if (b64) buf = Buffer.from(b64, 'base64');
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
    if (attempt < 3) {
      const wait = msg.includes('429') ? 90000 * attempt : 4000 * attempt;
      console.log(`     waiting ${(wait / 1000).toFixed(0)}s before retry...`);
      await new Promise(r => setTimeout(r, wait));
      return doEdit(zai, refUrl, name, size, prompt, attempt + 1);
    }
    return false;
  }
}

const zai = await ZAI.create();
const refUrl = toDataUrl(REF);
// optional CLI filters: node edit_frames_redo.mjs p2 p3 p5
const filter = process.argv.slice(2);
const jobs = filter.length
  ? REDO.filter(([n]) => filter.some(f => n.startsWith(f)))
  : REDO;
let ok = 0;
for (const [name, size, prompt] of jobs) {          // sequential — avoid 429
  if (await doEdit(zai, refUrl, name, size, prompt)) ok++;
  await new Promise(r => setTimeout(r, 15000));      // spacing between calls
}
console.log(`DONE ${ok}/${jobs.length}`);
process.exit(ok === jobs.length ? 0 : 1);
