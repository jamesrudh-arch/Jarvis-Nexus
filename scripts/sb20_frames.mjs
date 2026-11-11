// JARVIS NEXUS — Full 20-frame storyboard rebuild (identity-locked pipeline).
// Every frame is an EDIT of canon_ref.png (user's IMG_9024) => same woman guaranteed.
// Sequential + 15s spacing + 429 backoff. Resumable: skips files that already exist.
// Usage: node sb20_frames.mjs [filter...]   e.g. node sb20_frames.mjs sb_07 sb_12
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = '/home/z/my-project/download/jarvis-nexus-preproduction/storyboard_locked';
const REF = '/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof/canon_ref.png';
fs.mkdirSync(OUT, { recursive: true });

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

// 16 new frames (sb_01, 06, 11, 14 are copied from QC-passed v2_proof set)
const FRAMES = [
  ["sb_02_living_presence.jpg", W,
   `Medium-wide eye-level shot of ${CHAR}, standing relaxed at the round glass pedestal hologram table during quiet autonomous work, both hands calmly steadying a large slow-rotating cyan wireframe architectural assembly — a modular habitat structure — that floats above the table, her fingertips just grazing its glowing lower edge. Her expression is composed and content, softly focused on the structure, a faint dry half-smile of deep concentration. The assembly casts cyan light up onto her face, hands and blazer, and her shadow falls behind her across the glossy black floor. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_03_walking_conversing.jpg", W,
   `Full-length tracking shot at eye level of ${CHAR}, captured mid-stride walking heel-to-toe along a glowing cyan floor guide line toward the central operations ring, her weight shifted onto the front foot, blazer and trousers moving naturally with the stride, head turned toward the camera mid-sentence with her mouth slightly open as she speaks, one hand raised in a small explanatory gesture, completely natural lifelike motion. The glowing floor rings and guide line cast cyan up-light onto her trousers and boots, her long shadow stretching across the glossy black floor, console banks glowing faintly in the dark behind her. ${ENV}. ${STYLE}.`],

  ["sb_04_turning_acknowledge.jpg", W,
   `Medium shot, slight low angle, of ${CHAR} interrupted mid-task at a dark console: her body still angled toward the console with her left hand resting on its edge, but her head and eyes already turned directly toward the camera, meeting the lens with a calm acknowledging gaze, eyebrows slightly raised in greeting and a faint knowing half-smile. A half-assembled cyan wireframe component hologram hovers above the console beside her, casting cyan side-light across her cheek and jaw; her right hand pauses in mid-reach near it, fingers relaxed. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_05_conversational_focus.jpg", W,
   `65mm medium-close portrait at eye level across the dark glass holo-table: ${CHAR} in attentive conversation, looking directly into the camera with warm direct eye contact, listening with a faint intelligent half-smile, head very slightly tilted, mouth closed. Between the camera and her, a small translucent cyan data prism floats above the table and its soft light illuminates her face from below-front, a single catchlight in each eye, her low bun neat at the back of her head, blazer collar sharp. The background falls away into darkness with the faint glowing rim of the pedestal table. ${ENV}. ${STYLE}.`],

  ["sb_07_urgent_alert.jpg", W,
   `Wide shot with real motion energy: ${CHAR} in a brisk urgent run along the facility's central axis toward the far end, where a heavy security vault door glows with an isolated orange alert containment lattice — the only orange element in the frame. Her stride is caught mid-flight, blazer hem flared by motion, one arm driving forward, face set in decisive urgency, eyes locked ahead. The floor guide line beneath her pulses the same orange toward the alert, casting warm up-light onto her boots, while passing consoles light her face and hands in cyan. The rest of the vast hall stays dark charcoal and cyan. ${ENV}. ${STYLE}.`],

  ["sb_08_memory_archive.jpg", W,
   `Medium-wide shot inside the memory archive colonnade: ${CHAR} standing between tall translucent glass data columns that recede into darkness, each column filled with drifting streams of small records — most records glow clean ice-cyan, a few glow amber. She reaches up with her right hand toward one amber record, her fingertips a few centimetres from the glass, fingers clearly separated, her face lit from the side by the column's cyan glow, expression analytical and calm. The columns cast long soft reflections across the glossy black floor. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_09_goals_dag.jpg", W,
   `Medium shot at the goals bay: ${CHAR} reaching up with her right hand to touch one bright node in a large holographic directed acyclic graph floating at head height — many connected nodes linked by thin light lines, most nodes dim cyan, one active path glowing brightly, a few completed nodes rendered as solid ice-white. Her extended fingertips glow where they almost meet the active node, fingers clearly separated, the wristwatch visible on her left wrist as her left hand rests on the table edge. The graph casts cyan light across her face and blazer, her expression focused. One thin floating label only: 'GOAL 3 CRITICAL PATH'. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_10_multi_agent.jpg", W,
   `Wide-medium shot at the radial collaboration table: ${CHAR} standing at the near edge of a round dark table, one hand raised palm-open above its surface as she delegates work to five small geometric wireframe agent workspaces — icosahedra of different sizes orbiting slowly above the table, each holding a distinct tiny working structure: a molecule, a document tree, a network graph, a world map, a flowing data stream. She surveys them all with calm command, her face and raised hand lit cyan from below by the table's glowing rim, her other hand resting at her side. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_12_simulation.jpg", W,
   `Medium-wide shot: ${CHAR} standing between two identical large holographic flow simulations hovering side by side at chest height — the left one rendering smooth laminar streamlines in clean cyan, the right one rendering the same flow broken into chaotic turbulent eddies in warning amber. She has turned her head toward the amber turbulent variant, one hand raised beside it presenting the difference, fingers clearly separated, her face lit half cyan from the left hologram and half amber from the right. The glossy black floor beneath each simulation reflects its own colour. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_13_scenario_construction.jpg", W,
   `Wide shot of the signature 'let me show you' moment: ${CHAR} with her right hand raised in a conducting gesture above the pedestal table as a small tabletop wireframe schematic unfolds and expands into a room-scale volumetric reconstruction — a cyan voxel point-cloud building rising and spreading outward from the table into the dark hall behind her, streams of particles arcing from the table to the growing structure, early walls and staircases crystallising out of the drifting points. Her raised hand and face are lit cyan by the expansion, her expression quietly intent, mouth mid-word as she speaks. The expansion light throws her long shadow forward across the floor. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_15_video_to_3d.jpg", W,
   `Medium-wide shot beside the frameless media wall: ${CHAR} standing beside a huge dark glass architectural wall playing a paused video frame of an industrial site, and out of that frozen frame a translucent cyan wireframe volumetric twin of the site's main vehicle is being extracted — pulling away from the wall into the open air, still connected to the wall by a bridge of drifting particles. She presents the twin with an open upturned palm toward it while looking at the camera mid-explanation, faint confident half-smile. The paused frame glows softly; the twin casts cyan light onto her palm, face and shoulder. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_16_vision_security.jpg", W,
   `Medium shot at the vision and optical input station: ${CHAR} standing calmly inside a thin cyan hexagonal defensive boundary lattice that surrounds the station, while a translucent floating sensor plane with a single camera iris at its centre hovers before her at chest height, its cyan scan light sweeping slowly across her face as she holds still for it — chin slightly lifted, patient composed expression, eyes naturally open with a single catchlight. The lattice and the sensor plane cast cyan light onto her blazer and cheekbones, her shadow crisp on the black floor. One thin floating label only: 'OPTICAL INPUT: ACTIVE'. ${HANDS}. ${DNA}. ${ENV}. ${STYLE}.`],

  ["sb_17_local_kaggle_compute.jpg", W,
   `Medium-wide shot inside the compute bay: ${CHAR} standing before a holographic network diagram floating above a dark server rack with rows of tiny cyan status lights — one solid bright cyan cube node at the diagram's centre representing the local PC, and thin outbound light lines arcing from it toward three GPU slot markers on the right, one slot glowing solid and connected, two dim and empty. She touches the connected slot marker with her right index finger to check it, fingers clearly separated, the rack's status lights reflecting in the glossy black floor. Her face is lit half by the rack lights and half by the diagram. One thin floating label only: 'OUTBOUND LINK: SECURED'. ${HANDS}. ${ENV}. ${STYLE}.`],

  ["sb_18_owner_switches.jpg", W,
   `Medium shot, warm and quiet: ${CHAR} standing beside a dark pedestal console bearing a row of seven physical illuminated toggle switches of different sizes — the large master switch at the centre glowing soft cyan, four others lit cyan, two dark and switched off, each LED casting a tiny reflection on the console surface. Her right hand hovers just above the master switch without touching it, fingers relaxed and clearly separated, and she looks up toward the camera with a calm questioning glance, asking permission, a faint respectful half-smile. The switch LEDs cast cyan up-light onto her wrist and jaw. ${ENV}. ${STYLE}.`],

  ["sb_19_mobile_companion.jpg", W,
   `Cinematic shot from the owner's first-person view: in the foreground at the bottom of frame, the owner's hand holds a dark matte smartphone, and on the phone's bright screen a live synchronized 3D companion feed shows ${CHAR} in medium close-up mid-conversation, her face on the screen clearly readable, identical to her real face, lit cyan. Behind and above the phone, softly out of focus in the dark facility, the real woman stands at her console seen from behind at middle distance, her low bun and blazer silhouette rimmed in cyan light. The phone screen is the brightest element in frame, its cool glow spilling onto the holding hand and wrist. ${ENV}. ${STYLE}.`],

  ["sb_20_holographic_projection.jpg", W,
   `Medium shot inside the embodiment projection bay: on a low black pedestal, a four-faced clear glass pyramid projector beams a small luminous translucent volumetric hologram of ${CHAR} into the air above it — about thirty centimetres tall, rendered in glowing cyan with a fine scanline shimmer, standing in a mid-conversation gesture with one open hand, her translucent face clearly recognizable as the same woman, the dark bay visible through her translucent body. Thin cyan projector beams rise from the pyramid's base through drifting haze. One thin floating label only: 'EMBODIMENT LINK: ACTIVE'. The hologram casts soft cyan light onto the pedestal and the glossy black floor around it. ${ENV}. ${STYLE}.`],
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
let jobs = FRAMES.filter(([n]) => !fs.existsSync(path.join(OUT, n)));   // resumable
if (filter.length) jobs = FRAMES.filter(([n]) => filter.some(f => n.startsWith(f)) && !fs.existsSync(path.join(OUT, n)));
console.log(`jobs to generate: ${jobs.length} (of ${FRAMES.length})`);
let ok = 0;
for (const [name, size, prompt] of jobs) {
  if (await doEdit(zai, refUrl, name, size, prompt)) ok++;
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${jobs.length}`);
process.exit(ok === jobs.length ? 0 : 1);
