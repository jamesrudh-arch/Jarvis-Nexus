import { LipsyncZh, hasCJK } from '../src/nexus/vendor/lipsync-zh.mjs';

const zh = new LipsyncZh();
const ok = await zh.init();
console.log('pinyin loaded:', ok);

const cases = [
  '你好，我是贾维斯。',
  '正在分析安全日志，请稍等。',
  '这个方案有三点风险，我逐一说明。',
];

for (const text of cases) {
  console.log('\nTEXT:', text, '| hasCJK:', hasCJK(text));
  const { segments, fallback } = zh.buildTimeline(text, 0);
  console.log('fallback:', fallback, '| segments:', segments.length);
  const dur = segments.length ? segments[segments.length - 1].endMs : 0;
  console.log('total dur ms:', dur);
  console.log(segments.slice(0, 12).map((s) => `${s.viseme.replace('viseme_', '')}@${Math.round(s.startMs)}-${Math.round(s.endMs)}`).join(' '));
  // validate monotonic + all visemes valid
  const VALID = new Set(['sil','PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','I','O','U']);
  let bad = 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (!VALID.has(s.viseme.replace('viseme_', ''))) bad++;
    if (s.endMs <= s.startMs) bad++;
    if (i > 0 && s.startMs < segments[i-1].startMs) bad++;
  }
  console.log('validation errors:', bad);
}
