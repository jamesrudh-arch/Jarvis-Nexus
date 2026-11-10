import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const V2 = '/home/z/my-project/download/jarvis-nexus-preproduction';
const OUT = path.join(V2, 'storyboard_v2');
const REF = path.join(V2, 'v2_proof/canon_ref.png');

const CHAR = ("the exact same woman from the reference image: same slim face, high " +
  "cheekbones, angular jawline, same dark brown hair in a low bun, same black " +
  "turtleneck under the same structured dark charcoal blazer, same wristwatch on her " +
  "left wrist, apparent age 37, matte realistic skin");

const ENV = ("inside an enclosed subterranean high-tech facility: near-black basalt " +
  "walls, dark brushed steel, glossy black reflective floor, faint volumetric haze — " +
  "always dark charcoal and cyan, never white");

const STYLE = ("photorealistic cinematic film still, 35mm anamorphic lens, restrained " +
  "color grade, charcoal-black and cyan palette, deep shadows, high detail, no text, " +
  "no watermark");

const REDOS = [
  ["f11_live_research.jpg", "1344x768",
   `Over-the-shoulder shot from behind her right shoulder: ${CHAR} standing at a dark research alcove, facing TWO separate floating translucent cyan document planes that hover one meter apart in the air before her, and a single bright thread of cyan light physically connects the two planes, arcing through the air between a highlighted line on the left plane and a small citation node on the right plane, her extended index finger touching the midpoint of this glowing connecting thread, the two planes casting cyan light on her face and hand, absorbed scholarly expression. The thread is the visual subject of the frame. ${ENV}. ${STYLE}.`],

  ["f16_vision_security.jpg", "1344x768",
   `${CHAR} standing alone inside a translucent pyramid made of soft cyan light that projects downward around her from above, its four translucent triangular faces clearly visible surrounding her, and a flat lattice of thin glowing cyan boundary lines spread across the floor around the pyramid's base. Behind her in the dark background, one single monitor shows one thin red line tracing slowly across its screen - the only red element in the frame. There is NO turbine and NO machinery hologram anywhere in this frame - only the pyramid of light, the floor lattice, her, and the single red trace behind. Her posture is composed and vigilant, hands at her sides, face lit by the pyramid's soft glow. ${ENV}. ${STYLE}.`],

  ["f18_owner_switches.jpg", "1344x768",
   `Over-the-shoulder shot from the owner's point of view: a monumental dark brushed-steel console stretches across the frame holding a single row of SEVEN identical heavy black industrial breaker toggle switches - seven levers, one row, evenly spaced from the far left edge to the far right edge of the console - each lever tall and mechanical with a small amber lamp glowing beside it, all under one warm key light from above. ${CHAR} stands one respectful pace back at the left edge of the frame in soft focus, hands loosely clasped in front of her, watch on her left wrist, calmly watching the owner, never touching the switches. ${ENV}. ${STYLE}.`],
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
      await new Promise(r => setTimeout(r, msg.includes('429') ? 90000 * attempt : 5000 * attempt));
    }
  }
  await new Promise(r => setTimeout(r, 15000));
}
console.log(`DONE ${ok}/${REDOS.length}`);
process.exit(ok === REDOS.length ? 0 : 1);
