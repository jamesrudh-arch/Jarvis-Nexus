// Two pure-environment plates for Chapter 3, edited from the user's environment
// reference (IMG_9025). No people, no text.
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const OUT = '/home/z/my-project/download/jarvis-nexus-preproduction/concepts';
const REF = '/home/z/my-project/upload/IMG_9025.png';
const W = '1344x768';

const BASE = ("keep the same dark subterranean high-tech facility aesthetic as the reference "
  + "image: near-black basalt walls, dark brushed steel, glossy black reflective floor with "
  + "glowing cyan circuit rings and guide lines, faint volumetric haze, the entire room dark "
  + "charcoal and cyan, absolutely no people anywhere in the frame, no readable text or "
  + "labels anywhere, photorealistic cinematic film still, 35mm anamorphic lens, restrained "
  + "color grade, deep shadows, high detail, no watermark");

const PLATES = [
  ["env_hub_v2.jpg",
   `Wide establishing shot of the empty Central Operations hub at idle: the round glass-top pedestal hologram table at centre with its illuminated rim, a single large cyan wireframe architectural hologram slowly rotating above it casting real cyan light onto the table surface, floor and nearby consoles, the console ring glowing low around the dais, floor circuit rings radiating outward. ${BASE}.`],
  ["env_spine_v2.jpg",
   `Wide shot down the long central Spine axis of the empty facility: a glowing cyan guide line running down the polished black floor into the distance, tall glass data columns of the Memory Archive receding along the left side with faint interior records glowing, dark basalt walls with faint circuit inlay, volumetric haze catching the light, the far end opening into the central hub glow. ${BASE}.`],
];

const zai = await ZAI.create();
const refUrl = `data:image/png;base64,${fs.readFileSync(REF).toString('base64')}`;
for (const [name, prompt] of PLATES) {
  try {
    const res = await zai.images.generations.edit({ prompt, images: [{ url: refUrl }], size: W });
    const item = res?.data?.[0] || {};
    let buf = (item.base64 || item.b64_json) ? Buffer.from(item.base64 || item.b64_json, 'base64') : null;
    if (!buf && item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
    if (!buf || buf.length < 30000) throw new Error('short output');
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log(`OK ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error(`ERR ${name}: ${String(e.message).slice(0, 140)}`);
  }
  await new Promise(r => setTimeout(r, 15000));
}
