// Redo pass for QC-failed storyboard frames (overwrites existing files).
// Usage: node sb20_redo.mjs [filter...]
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = '/home/z/my-project/download/jarvis-nexus-preproduction/storyboard_locked';
const REF = '/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof/canon_ref.png';

const CHAR = ("the exact same woman from the reference image: same slim face with " +
  "high cheekbones and angular jawline, same dark eyebrows, same olive-fair " +
  "skin, same dark brown hair pulled back into a low bun, same black " +
  "turtleneck under the same structured dark blazer, same wristwatch on her " +
  "left wrist, apparent age 37, matte realistic skin, natural eyes with a " +
  "single soft catchlight, no enlarged or glowing eyes");

const DNA = ("holograms rendered as cyan-teal wireframe geometry mixed with dense " +
  "voxel point-cloud particles, crisp light with no bloom blowout, every " +
  "hologram is a real light source that casts cyan light onto her face, " +
  "hands and clothing, casts her real shadow on the floor, and glowing " +
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

const HANDS = ("hands and fingers natural and clearly separated, never fused into or hidden inside hologram geometry");

const W = '1344x768';

const REDO = [
  // sb_03: no holograms at all, console glow lights her face
  ["sb_03_walking_conversing.jpg", W,
   `Full-length tracking shot at eye level of ${CHAR}, captured mid-stride walking heel-to-toe along a glowing cyan floor guide line toward the central operations ring, her weight shifted onto the front foot, blazer and trousers moving naturally with the stride, head turned toward the camera mid-sentence with her mouth slightly open as she speaks, one hand raised in a small explanatory gesture, completely natural lifelike motion. There are no floating holograms and no screens in this shot: she is lit by the cool cyan glow of the low console banks she passes and by the glowing floor rings, which cast clear cyan up-light onto her trousers and boots, her long shadow stretching across the glossy black floor. ${ENV}. ${STYLE}.`],

  // sb_04: hologram pure geometry, no text, stronger side-light
  ["sb_04_turning_acknowledge.jpg", W,
   `Medium shot, slight low angle, of ${CHAR} interrupted mid-task at a dark console: her body still angled toward the console with her left hand resting on its edge, but her head and eyes already turned directly toward the camera, meeting the lens with a calm acknowledging gaze, eyebrows slightly raised in greeting and a faint knowing half-smile. A smooth cyan wireframe mechanical component hologram hovers above the console beside her — pure geometry with absolutely no text on it — and it casts strong cyan side-light across her cheek, jaw and right hand, which pauses in mid-reach near it with fingers relaxed and clearly separated. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  // sb_07: tighter camera so face + bun are detailed, light on subject
  ["sb_07_urgent_alert.jpg", W,
   `Medium-wide shot with real motion energy: ${CHAR} in a brisk urgent run along the facility's central axis, close enough to the camera that her face and dark low bun are clearly detailed — expression set in decisive urgency, eyes locked ahead toward the far security vault door that glows with an isolated orange alert containment lattice, the only orange element in the frame. Her stride is caught mid-flight, blazer hem flared by motion, one arm driving forward. The floor guide line beneath her pulses the same orange, casting warm up-light onto her boots and trouser cuffs, while the dark console banks she passes cast clear cyan light onto her face and hands. The rest of the vast hall stays dark charcoal and cyan. ${ENV}. ${STYLE}.`],

  // sb_08: abstract record shards, no text, shadow on floor
  ["sb_08_memory_archive.jpg", W,
   `Medium-wide shot inside the memory archive colonnade: ${CHAR} standing between tall translucent glass data columns that recede into darkness, each column filled with drifting abstract record shards — small glowing bars, dots and fragments with no readable text anywhere — most shards glow clean ice-cyan, a few glow amber. She reaches up with her right hand toward one amber shard, her fingertips a few centimetres from the glass, fingers clearly separated, her face and hand lit from the side by the column's cyan glow, expression analytical and calm. The columns cast long soft reflections across the glossy black floor and her long shadow falls across it. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  // sb_14: hand and wrist fully outside the glow, one label only
  ["sb_14_scenario_directing.jpg", W,
   `Medium-wide shot of ${CHAR} standing a clear full step outside a walkable full-scale incident reconstruction: a frozen industrial accident rebuilt as translucent data — voxel point-cloud pipes and machinery with clean cyan wireframe edges, debris suspended mid-air, and one translucent cyan wireframe human figure, a worker frozen mid-motion at the moment of failure. She points with her right index finger from well outside the volume at the single POINT OF ORIGIN glowing solid orange — the only orange element — her whole hand and wrist clearly outside and separate from the hologram's glow, fingers fully visible and clearly separated. The orange light of the origin point tints her fingertips and wrist. Exactly one thin floating label only: 'INCIDENT RECONSTRUCTION' in clean legible uppercase. A faint timeline ring glows in the floor around the scene. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  // sb_16: steady glow (no sweeping beam), no text
  ["sb_16_vision_security.jpg", W,
   `Medium shot at the vision and optical input station: ${CHAR} standing calmly inside a thin cyan hexagonal defensive boundary lattice that surrounds the station, while a translucent floating sensor plane with a single camera iris at its centre hovers before her at chest height, emitting a steady soft cyan glow that lights her evenly — chin slightly lifted, patient composed expression, eyes naturally open with a single catchlight, no beam or band of light crossing her face. The lattice and the sensor plane cast cyan light onto her blazer and cheekbones, her shadow crisp on the black floor. No text anywhere in the frame. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  // sb_17: near-black rack, diagram as main light source, dark room enforced
  ["sb_17_local_kaggle_compute.jpg", W,
   `Medium-wide shot inside the dark compute bay of the subterranean facility: ${CHAR} standing before a near-black server rack whose only lights are rows of tiny cyan status LEDs, and above the rack a floating holographic network diagram in cyan wireframe — one solid bright cube node at its centre representing the local PC, and thin light lines arcing from it toward three GPU slot markers, one slot glowing solid and connected, two dim and empty. The diagram is the main light source of the shot and casts clear cyan light onto her face, blazer and the glossy black floor. She touches the connected slot marker with her right index finger, fingers clearly separated, the rack's LEDs reflecting in the floor. The room around her is dark charcoal basalt and steel — absolutely not a white or bright clinic. One thin floating label only: 'OUTBOUND LINK: SECURED'. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  // sb_19: clean video-call screen, no UI text, cyan rim on background figure
  ["sb_19_mobile_companion.jpg", W,
   `Cinematic shot from the owner's first-person view: in the foreground at the bottom of frame, the owner's hand holds a dark matte smartphone, and the phone's bright screen shows only a clean live video call feed — the face of ${CHAR} in medium close-up mid-conversation, sharp, detailed and clearly identical to her real face, lit cyan, with no interface text or icons on the screen. Behind and above the phone, softly out of focus in the dark facility, the real woman stands at her console seen from behind at middle distance, her low bun and blazer silhouette rimmed in clear cyan light cast by the console's hologram. The phone screen is the brightest element in frame, its cool glow spilling onto the holding hand and wrist. ${ENV}. ${STYLE}.`],
];

function toDataUrl(p) {
  const b = fs.readFileSync(p);
  return `data:image/png;base64,${b.toString('base64')}`;
}

async function doEdit(zai, refUrl, name, size, prompt, attempt = 1) {
  const out = path.join(OUT, name);
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
    if (attempt < 4) {
      const wait = msg.includes('429') ? 90000 * attempt : 5000 * attempt;
      console.log(`     waiting ${(wait / 1000).toFixed(0)}s before retry...`);
      await new Promise(r => setTimeout(r, wait));
      return doEdit(zai, refUrl, name, size, prompt, attempt + 1);
    }
    return false;
  }
}

const zai = await ZAI.create();
const refUrl = toDataUrl(REF);
const filter = process.argv.slice(2);
const jobs = filter.length ? REDO.filter(([n]) => filter.some(f => n.startsWith(f))) : REDO;
console.log(`redo jobs: ${jobs.length}`);
let ok = 0;
for (const [name, size, prompt] of jobs) {
  if (await doEdit(zai, refUrl, name, size, prompt)) ok++;
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${jobs.length}`);
process.exit(ok === jobs.length ? 0 : 1);
