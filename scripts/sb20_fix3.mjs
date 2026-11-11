// Third-pass fixes for the 3 hardest frames (light-first / single-face restructure).
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

const ENV = ("inside a dark subterranean high-tech facility: near-black basalt " +
  "walls, dark brushed steel, glossy black reflective floor with glowing " +
  "cyan circuit rings and guide lines, a round glass-top pedestal hologram " +
  "table with an illuminated rim, faint volumetric haze — the entire room " +
  "is dark charcoal and cyan, absolutely NOT a white or bright clinic");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, " +
  "restrained color grade, charcoal-black and cyan palette, orange used " +
  "only for the single critical data element, deep shadows, high detail, " +
  "no watermark");

const W = '1344x768';

const FIX = [
  ["sb_03_walking_conversing.jpg", W,
   `Full-length tracking shot at eye level of ${CHAR} captured mid-stride walking heel-to-toe straight through a bright glowing cyan circuit ring set into the glossy black floor — the ring is directly beneath her and its strong cyan up-light clearly washes over her boots, trouser cuffs, hands and the underside of her jaw and cheekbones, while a row of low glowing cyan console banks beside her casts clear cyan side-light across her face and blazer. Her weight is shifted onto the front foot, blazer and trousers moving naturally with the stride, head turned toward the camera mid-sentence, mouth slightly open as she speaks, one hand raised in a small explanatory gesture, completely natural lifelike motion. No floating holograms and no screens in this shot. Her long shadow stretches across the glossy black floor away from the rings. ${ENV}. ${STYLE}.`],

  ["sb_07_urgent_alert.jpg", W,
   `Medium-wide shot with real motion energy: ${CHAR} in a brisk urgent run along the facility's central axis toward a heavy vault door at the far end that is wrapped in a glowing orange three-dimensional wireframe containment lattice — bright orange light strands crossing in front of the dark door, the only orange element in the frame, casting warm orange light onto the floor around it. She is close enough to the camera that her face and dark low bun are clearly detailed, expression set in decisive urgency, eyes locked ahead, stride caught mid-flight, blazer hem flared by motion, one arm driving forward. The dark console banks she passes cast clear cyan light onto her face, hands and blazer, and the glowing floor guide line beneath her boots casts up-light onto her trouser cuffs. The rest of the vast hall stays dark charcoal and cyan. ${ENV}. ${STYLE}.`],

  ["sb_19_mobile_companion.jpg", W,
   `Cinematic shot from the owner's first-person view: in the foreground at the bottom of frame, the owner's hand holds a dark matte smartphone, and the phone's bright screen shows a clean live video feed — the face of ${CHAR} in medium close-up mid-conversation, sharp, detailed and clearly identical to her real face, lit in cyan from the holograms around her, with no interface text or icons on the screen. Above and behind the phone, the dark subterranean facility spreads softly out of focus — glowing cyan floor rings, the faint rim of the pedestal hologram table and dark basalt walls — with no second person anywhere in frame. The phone screen is the brightest element, its cool glow spilling onto the holding hand and wrist. ${ENV}. ${STYLE}.`],
];

function toDataUrl(p) {
  const b = fs.readFileSync(p);
  return `data:image/png;base64,${b.toString('base64')}`;
}

async function doEdit(zai, refUrl, name, size, prompt, attempt = 1) {
  const out = path.join(OUT, name);
  try {
    const res = await zai.images.generations.edit({ prompt, images: [{ url: refUrl }], size });
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
    console.log(`OK   ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (e) {
    const msg = String(e.message || e);
    console.error(`ERR  ${name} attempt ${attempt}: ${msg.slice(0, 140)}`);
    if (attempt < 4) {
      const wait = msg.includes('429') ? 90000 * attempt : 5000 * attempt;
      await new Promise(r => setTimeout(r, wait));
      return doEdit(zai, refUrl, name, size, prompt, attempt + 1);
    }
    return false;
  }
}

const zai = await ZAI.create();
const refUrl = toDataUrl(REF);
let ok = 0;
for (const [name, size, prompt] of FIX) {
  if (await doEdit(zai, refUrl, name, size, prompt)) ok++;
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${FIX.length}`);
process.exit(ok === FIX.length ? 0 : 1);
