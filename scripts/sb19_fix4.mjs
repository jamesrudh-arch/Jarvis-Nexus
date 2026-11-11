// sb_19 final restructure: the shot IS the companion view (phone screen fills frame).
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
  "restrained color grade, charcoal-black and cyan palette, deep shadows, " +
  "high detail, no watermark");

const PROMPT = `The camera looks straight down at a smartphone held in the owner's hand, and the phone's bright screen nearly fills the whole frame — its rounded corners and slim dark bezel visible at the frame edges, the owner's thumb resting along the right bezel and fingers gripping the left. On the screen, a live synchronized companion feed shows ${CHAR} in medium close-up mid-conversation: her face large, sharp and clearly identical to her real face, warmly lit in cyan by the hologram glow around her, faint confident half-smile, direct eye contact with the camera through the screen. Behind her on screen, the dark subterranean sanctuary recedes softly out of focus with glowing cyan floor rings and the faint rim of the pedestal hologram table. No interface text or icons anywhere on the screen. The screen's cool cyan glow spills onto the thumb and fingers gripping the bezel, contrasting with the dark room beyond the phone. ${ENV}. ${STYLE}.`;

const zai = await ZAI.create();
const refUrl = `data:image/png;base64,${fs.readFileSync(REF).toString('base64')}`;
const res = await zai.images.generations.edit({ prompt: PROMPT, images: [{ url: refUrl }], size: '1344x768' });
const item = res?.data?.[0] || {};
let buf = item.base64 || item.b64_json ? Buffer.from(item.base64 || item.b64_json, 'base64') : null;
if (!buf && item.url) buf = Buffer.from(await (await fetch(item.url)).arrayBuffer());
if (!buf || buf.length < 30000) { console.error('FAILED'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'sb_19_mobile_companion.jpg'), buf);
console.log(`OK sb_19 (${(buf.length / 1024).toFixed(0)} KB)`);
