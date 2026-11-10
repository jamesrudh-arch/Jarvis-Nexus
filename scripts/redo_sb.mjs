import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const V2 = '/home/z/my-project/download/jarvis-nexus-preproduction';
const OUT = path.join(V2, 'storyboard_v2');
const REF = path.join(V2, 'v2_proof/canon_ref.png');

const CHAR = ("the exact same woman from the reference image: same slim face with high " +
  "cheekbones and angular jawline, same dark eyebrows, same olive-fair skin, same dark " +
  "brown hair pulled back into a low bun, same black turtleneck under the same " +
  "structured dark charcoal blazer, same wristwatch on her left wrist, apparent age 37, " +
  "matte realistic skin. NEVER a blonde, NEVER loose wavy hair, NEVER a catsuit or " +
  "zip-up top - always the professional dark blazer and turtleneck exactly as in the " +
  "reference image");

const DNA = ("holograms rendered as cyan-teal wireframe geometry mixed with voxel " +
  "point-cloud particles, crisp light, every hologram a real light source casting cyan " +
  "light onto her face, hands and the glossy black floor, casting her real shadow");

const ENV = ("inside an enclosed subterranean high-tech facility: near-black basalt " +
  "walls, dark brushed steel, glossy black reflective floor with glowing cyan circuit " +
  "rings, tall glass data columns in the background, faint volumetric haze — always " +
  "dark charcoal and cyan, never white");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, restrained " +
  "color grade, charcoal-black and cyan palette, deep shadows, high detail, no text, " +
  "no labels, no watermark");

const REDOS = [
  ["f11_live_research.jpg", "1344x768",
   `Tight three-quarter over-the-shoulder shot from behind her left shoulder: ${CHAR} at a dark steel research alcove desk, leaning slightly forward, reading two floating translucent cyan document planes hovering at eye level in front of her with one empirical curve chart between them, a single thin luminous provenance thread visibly linking a highlighted claim on the left plane to its source citation on the right plane, the cool cyan planes casting light across her cheek and hand, her right index finger raised mid-trace along the thread, absorbed scholarly expression, wristwatch visible on her left wrist. The desk and alcove are dark steel and basalt only. ${DNA}. ${ENV}. ${STYLE}.`],

  ["f13_scenario_build.jpg", "1344x768",
   `Deliberately off-center three-quarter medium shot from a low corner of the dark stage: ${CHAR} standing mid-assembly of a room-scale scenario, her right hand extended high in a mid-pull gesture drawing a glowing wireframe pipe segment out of a floating palette of parts beside her, the segment trailing voxel particles as it flies toward its place in a half-built volumetric scene — pipe structures and a suspended vessel around her still transitioning from wireframe to solid, everything at a dim half-brightness drafting state, her upturned face lit by the element's glow, creative decisive focus. ${DNA}. ${ENV}. ${STYLE}.`],

  ["f16_vision_security.jpg", "1344x768",
   `${CHAR} standing composed and vigilant inside a subtle translucent pyramid of cyan light that marks the active optical input volume, thin cyan boundary lattice lines surrounding her workspace at floor level, one dark monitor behind her showing a single sparse red moving trace, her posture calm, hands relaxed at her sides, her face softly lit by the pyramid's cyan glow. ${DNA}. ${ENV}. ${STYLE} with the red trace as the only red element.`],

  ["f18_owner_switches.jpg", "1344x768",
   `Over-the-shoulder shot from the owner's point of view toward a monumental dark console holding exactly seven heavy mechanical toggle switches in a row — industrial breaker-style levers, each with a small amber indicator lamp beside it — under a warm key light, ${CHAR} standing one respectful pace back at the left edge of frame in soft focus, calm ready stance with hands loosely clasped in front of her, watch on her left wrist, watching the owner, never touching the switches. ${ENV}. ${STYLE}.`],

  ["f19_mobile.jpg", "1344x768",
   `A smartphone held vertically in a hand filling the sharp foreground of the right side of frame, its glowing screen showing ${CHAR} standing at attentive rest at the holo-ring, addressing the camera directly with a small welcoming smile, clearly alive and present inside the small screen, the dark facility softly blurred in the background behind the phone, the screen's cool light spilling onto the holding hand, calm dark scene with no fire and no embers. ${DNA}. ${ENV}. ${STYLE}.`],
];

const zai = await ZAI.create();
const refUrl = `data:image/png;base64,${fs.readFileSync(REF).toString('base64')}`;

let ok = 0;
for (const [name, size, prompt] of REDOS) {
  const out = path.join(OUT, name);
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      const res = await zai.images.generations.edit({
        prompt, images: [{ url: refUrl }], size,
      });
      const buf = Buffer.from(res.data[0].base64, 'base64');
      if (buf.length < 30000) throw new Error('short output');
      fs.writeFileSync(out, buf);
      console.log(`OK   ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
      done = true; ok++;
    } catch (e) {
      const msg = String(e.message || e);
      console.error(`ERR  ${name} attempt ${attempt}: ${msg.slice(0, 140)}`);
      const wait = msg.includes('429') ? 90000 * attempt : 5000 * attempt;
      await new Promise(r => setTimeout(r, wait));
    }
  }
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${REDOS.length}`);
process.exit(ok === REDOS.length ? 0 : 1);
