// QC pass: identity-locked storyboard audit via VLM (VFX supervisor persona).
// Usage: node qc_sb20.mjs sb_02 sb_05   (filters by prefix; no args = all missing reports)
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const DIR = '/home/z/my-project/download/jarvis-nexus-preproduction/storyboard_locked';
const REF = '/home/z/my-project/download/jarvis-nexus-preproduction/v2_proof/canon_ref.png';
const REPORTS = '/home/z/my-project/scripts/qc_reports';
fs.mkdirSync(REPORTS, { recursive: true });

const zai = await ZAI.create();

const prompt = `You are a strict film VFX supervisor auditing a storyboard frame for a project where the SAME woman must appear in every frame.
Image 1 is the canonical reference photo of her. Image 2 is the storyboard frame under audit.
Rate four criteria, each 0-10:
1. IDENTITY — is the woman in frame 2 (wherever her face is visible; skip if face is not visible at all and write IDENTITY=n/a) the same woman as image 1: same slim face, high cheekbones, angular jawline, dark eyebrows, dark brown hair in a low bun, black turtleneck under structured dark blazer?
2. LIGHT — do the holograms/glow act as REAL light sources illuminating her face, hands, clothing and floor, casting her shadow? Or does the glow look painted-on and disconnected?
3. HANDS — natural fingers, clearly separated, never fused into hologram geometry? (n/a if no hands near holograms)
4. DEFECTS — garbled/illegible text labels, extra people, deformed anatomy, plastic skin, dead eyes, white-clinic environment drift, duplicated woman?
Answer in EXACTLY this format and nothing else:
IDENTITY=<score|n/a> LIGHT=<score> HANDS=<ok|fail|n/a> DEFECTS=<none|list them briefly> VERDICT=<KEEP|REDO> — <max 12 word note>`;

const frames = fs.readdirSync(DIR).filter(f => f.endsWith('.jpg')).sort();
const filter = process.argv.slice(2);
const todo = frames.filter(f => {
  const id = f.split('_')[0];
  return (!filter.length || filter.some(x => f.startsWith(x))) && !fs.existsSync(path.join(REPORTS, f + '.txt'));
});

console.log(`QC frames: ${todo.length}`);
for (const f of todo) {
  try {
    const res = await zai.chat.completions.create({
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/png;base64,${fs.readFileSync(REF).toString('base64')}` } },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(path.join(DIR, f)).toString('base64')}` } },
          { type: 'text', text: prompt },
        ],
      }],
      thinking: { type: 'disabled' },
    });
    const txt = (res?.choices?.[0]?.message?.content || 'NO REPLY').trim();
    fs.writeFileSync(path.join(REPORTS, f + '.txt'), txt);
    console.log(`${f}: ${txt.split('\n')[0].slice(0, 150)}`);
  } catch (e) {
    console.log(`${f}: ERROR ${String(e.message).slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 4000));
}
console.log('QC DONE');
