import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const V2 = '/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof';
const REF = path.join(V2, 'canon_ref.png');

const CHAR = ("the same woman from the reference image: identical face, identical " +
  "dark brown hair pulled back into a low bun, identical black " +
  "turtleneck under an identical structured dark blazer, identical " +
  "wristwatch on her left wrist, apparent age 37, slim intelligent face, " +
  "matte realistic skin with visible pores");

const DNA = ("hologram rendered as cyan-teal wireframe geometry mixed with dense " +
  "voxel point-cloud particles, edges dissolving into particles, crisp " +
  "light with no bloom blowout, the hologram is the key light source " +
  "casting cyan light onto her face, hands and the glossy black floor " +
  "and casting her real shadow");

const ENV = ("inside an enclosed subterranean high-tech facility, near-black " +
  "basalt walls, a round glass-top pedestal hologram table with an " +
  "illuminated rim, glowing cyan floor circuit rings and lines, tall " +
  "glass columns with slowly scrolling data light streams in the " +
  "background, faint volumetric haze");

const LABELS = ("a few short, clean, fully legible uppercase sans-serif data " +
  "labels connected to the hologram by thin leader lines, no " +
  "gibberish or pseudo-text anywhere");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, " +
  "restrained color grade, charcoal-black and cyan palette with " +
  "orange used only for the single critical data element, deep " +
  "shadows, generous dark negative space, high detail, no watermark");

const HANDS = ("her hands naturally posed with fingers clearly separated and " +
  "articulated, fingertips cleanly in front of the hologram volume, " +
  "no clipping or merging with the projection");

const PROOF = [
  ["p0_character_sheet.png", "864x1152",
   `Full-length character reference of ${CHAR}, standing beside the pedestal hologram table, weight on one leg in a relaxed asymmetric stance, one hand resting on the table edge, looking toward the camera with calm confident direct eye contact and a faint dry half-smile. ${DNA} showing an abstract architectural wireframe floating above the table. ${ENV}. ${HANDS}. ${LABELS}. ${STYLE}.`],
  ["p1_face_closeup.png", "864x1152",
   `Head-and-shoulders portrait of ${CHAR}, mid-conversation and mid-reply: eyes locked on the owner just off-frame with warm focused intent and dry amusement, one eyebrow slightly raised, faint asymmetric smile beginning, head tilted a few degrees. An unseen hologram below-left lights the underside of her jaw and cheekbone in cyan, a warm amber rim light from behind right. Background: blurred ${ENV}. ${STYLE}.`],
  ["p2_scenario_recreation.png", "1344x768",
   `${CHAR} standing inside a walkable full-scale incident reconstruction on the dark stage floor: a frozen industrial accident rebuilt as data — a voxel point-cloud of pipes and machinery with clean wireframe edges, two translucent cyan wireframe human figures caught mid-action in the scene, debris fragments suspended mid-air. She points with her right index finger at the single POINT OF ORIGIN, highlighted in solid glowing orange while everything else stays cyan. Beside it a small orange data card. One thin floating label reads 'INCIDENT RECONSTRUCTION: PHASE 1', another reads 'VOXEL RESOLUTION: 3MM'. A faint circular timeline ring glows in the floor around the reconstruction with a bright scrub marker. ${DNA}. ${ENV}. ${HANDS}. ${LABELS}. ${STYLE}.`],
  ["p3_engineering.png", "1344x768",
   `${CHAR} at work beside a black reflective console, her right hand raised and turning a large cyan wireframe turbine rotor assembly hologram in mid-air, her left hand resting on the console edge, wristwatch visible. Thin leader lines connect small clean numeric metric callouts to the assembly. Her face lit from the hologram in cyan from the left, focused professional expression, eyes tracking the part she is rotating. ${DNA}. ${ENV}. ${HANDS}. ${LABELS}. ${STYLE}.`],
  ["p4_spatial_research.png", "1344x768",
   `${CHAR} standing at the round glass pedestal hologram table, both hands raised manipulating a cluster of floating luminous wireframe polyhedra above the table, one solid highlighted softly brighter than the rest. A thin header label reads 'SPATIAL RECONSTRUCTION' and three small metric labels read 'PRECISION 0.98', 'RECALL 0.96', 'CONFIDENCE 99.1%'. Background: dark wall panels with minimal clean charts and diagrams, no text noise. Her upturned face lit by the cluster, expression of quiet analytical focus. ${DNA}. ${ENV}. ${HANDS}. ${LABELS}. ${STYLE}.`],
  ["p5_first_wake.png", "1344x768",
   `Wide low-angle establishing shot: ${CHAR} seen small in the mid-distance walking alone toward the round pedestal hologram table during first power-on, cyan floor circuit rings and guide lines igniting in sequence ahead of her, the glass data columns in the background waking to vertical streams of light, her figure rim-lit cyan, mid-stride, unhurried confident walk, faint volumetric light shafts. No hologram content yet — the space is waking up around her. ${ENV}. ${STYLE}.`],
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
    console.error(`ERR  ${name} attempt ${attempt}: ${String(e.message || e).slice(0, 200)}`);
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 3000 * attempt));
      return doEdit(zai, refUrl, name, size, prompt, attempt + 1);
    }
    return false;
  }
}

const zai = await ZAI.create();
const refUrl = toDataUrl(REF);
console.log(`ref loaded: ${(fs.statSync(REF).size / 1024).toFixed(0)} KB -> data url`);

let ok = 0;
const CONC = 3;
for (let i = 0; i < PROOF.length; i += CONC) {
  const batch = PROOF.slice(i, i + CONC);
  const results = await Promise.all(batch.map(([name, size, prompt]) =>
    doEdit(zai, refUrl, name, size, prompt)));
  ok += results.filter(Boolean).length;
}
console.log(`DONE ${ok}/${PROOF.length}`);
process.exit(ok === PROOF.length ? 0 : 1);
