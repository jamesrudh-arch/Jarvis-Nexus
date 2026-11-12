/**
 * JARVIS NEXUS — Mandarin Chinese lip-sync engine (LipsyncZh).
 *
 * Converts 汉字 text into an Oculus-viseme timeline via pinyin syllable
 * decomposition (pinyin-pro, MIT, lazy-loaded only when CJK text is spoken).
 *
 * Mapping design (film-proven viseme choices for Mandarin):
 *  - initials : b/p/m→PP  f→FF  d/t/l→DD  n→nn  g/k/h→kk  j/q→CH  x→SS
 *               zh/ch→CH  sh→SS  r→RR  z/c/s→SS  (y/w are glides, no closure)
 *  - finals   : vowel nucleus + offglide + nasal coda as separate segments
 *               (a→aa, ai→aa+I, ao→aa+O, ou→O+U, e→E, i→I, u/ü→U, …)
 *  - tones    : duration scaling (T3 dipping longest, T4 clipped, T5 neutral short)
 *  - rhythm   : syllable-timed ~165ms nuclei, minimal inter-syllable gap,
 *               punctuation → breathing pauses
 *
 * If pinyin-pro cannot be loaded the engine falls back to an alternating
 * open/close jaw pattern (mouth still reads alive; the audio-analyser layer
 * refines the shapes from the real waveform).
 */

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;

export function hasCJK(s) {
  return CJK_RE.test(s || '');
}

// initial → viseme (null = glide/none)
const INITIAL_VISEME = {
  b: 'PP', p: 'PP', m: 'PP',
  f: 'FF',
  d: 'DD', t: 'DD', l: 'DD',
  n: 'nn',
  g: 'kk', k: 'kk', h: 'kk',
  j: 'CH', q: 'CH', x: 'SS',
  zh: 'CH', ch: 'CH', sh: 'SS', r: 'RR',
  z: 'SS', c: 'SS', s: 'SS',
};

// initial closure durations (ms)
const INITIAL_MS = { PP: 52, FF: 55, DD: 42, nn: 40, kk: 48, CH: 64, SS: 62, RR: 55 };

// final → segment visemes (nucleus, offglide…, nasal coda)
const FINAL_SEGMENTS = {
  a: ['aa'], ai: ['aa', 'I'], ao: ['aa', 'O'], an: ['aa', 'nn'], ang: ['aa', 'nn'],
  o: ['O'], uo: ['O'], ou: ['O', 'U'], ong: ['O', 'nn'],
  e: ['E'], ei: ['E', 'I'], en: ['E', 'nn'], eng: ['E', 'nn'], er: ['E', 'RR'],
  i: ['I'], ia: ['I', 'aa'], ian: ['I', 'aa', 'nn'], iang: ['I', 'aa', 'nn'],
  iao: ['I', 'aa', 'O'], ie: ['I', 'E'], iu: ['I', 'O', 'U'],
  in: ['I', 'nn'], ing: ['I', 'nn'], iong: ['I', 'O', 'nn'],
  u: ['U'], ua: ['U', 'aa'], uai: ['U', 'aa', 'I'], uan: ['U', 'aa', 'nn'],
  uang: ['U', 'aa', 'nn'], ue: ['U', 'E'], ui: ['U', 'E', 'I'],
  un: ['U', 'E', 'nn'], uo2: ['U', 'O'],
  v: ['U'], ve: ['U', 'E'], van: ['U', 'aa', 'nn'], vn: ['U', 'nn'],
};

// nucleus vs offglide vs nasal weights inside a syllable
function segmentWeights(n) {
  if (n === 1) return [1];
  if (n === 2) return [0.66, 0.34];
  return [0.5, 0.3, 0.2];
}

const TONE_SCALE = { 0: 0.72, 1: 0.95, 2: 1.08, 3: 1.26, 4: 0.9, 5: 0.72 };

const SYLLABLE_NUCLEUS_MS = 150;
const INTER_SYLLABLE_MS = 16;

function parseSyllable(raw) {
  // strip tone digit
  const m = raw.match(/^([a-zü]+?)([0-5])?$/i);
  if (!m) return null;
  let syl = m[1].toLowerCase().replace(/ü/g, 'v');
  const tone = Number(m[2] || '0');

  // longest-match initial
  let initial = null;
  for (const ini of ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w']) {
    if (syl.startsWith(ini)) { initial = ini; syl = syl.slice(ini.length); break; }
  }
  // glide normalisation: after y/j/q/x, 'u' is ü; y+i → i
  if (initial === 'y' || initial === 'w' || !initial) {
    if (initial === 'y') {
      if (syl.startsWith('i')) syl = syl.slice(1);         // yi → i
      else if (syl.startsWith('u')) syl = 'v' + syl.slice(1); // yu → ü…
    } else if (initial === 'w' && syl.startsWith('u')) {
      syl = syl.slice(1);                                   // wu → u
    }
    if (initial === 'y' || initial === 'w') initial = null; // pure glides
  }
  if (initial && ['j', 'q', 'x'].includes(initial) && syl.startsWith('u')) {
    syl = 'v' + syl.slice(1);                               // ju → jü
  }
  if (syl === 'ue' && initial === 'n') syl = 've';          // nüe
  if (!syl) syl = initial === 'w' ? 'u' : 'i';

  let final = syl;
  if (!FINAL_SEGMENTS[final]) {
    // fuzzy fallback: progressive match
    if (final.startsWith('v')) final = 'v';
    else if (final.startsWith('u')) final = 'u';
    else if (final.startsWith('i')) final = 'i';
    else if (final.startsWith('a')) final = 'a';
    else if (final.startsWith('e') || final.startsWith('o')) final = 'e';
    else final = 'a';
  }
  return { initial, final, tone };
}

export class LipsyncZh {
  constructor() {
    this.ready = false;
    this._pinyin = null;
    this._loading = null;
  }

  /** Lazy-load pinyin-pro. Resolves true when available. */
  async init() {
    if (this.ready) return true;
    if (!this._loading) {
      this._loading = import('pinyin-pro')
        .then((mod) => {
          this._pinyin = mod.pinyin;
          this.ready = true;
          return true;
        })
        .catch(() => {
          this._loading = null;
          return false;
        });
    }
    return this._loading;
  }

  /**
   * Build a viseme timeline for a CJK-dominant chunk.
   * @param {string} text   hanzi text (punctuation kept)
   * @param {number} startMs  timeline origin
   * @returns {{segments: Array<{viseme:string,startMs:number,endMs:number}>, fallback:boolean}}
   */
  buildTimeline(text, startMs = 0) {
    const segments = [];
    let cursor = startMs;
    const pushPause = (ms) => { cursor += ms; };

    if (!this.ready || !this._pinyin) {
      // Fallback: alternating jaw open/close per char — the audio-analyser
      // layer supplies real shapes; this only guarantees motion.
      const chars = Array.from(text).filter((ch) => CJK_RE.test(ch));
      for (let i = 0; i < chars.length; i++) {
        const dur = i % 2 === 0 ? 150 : 90;
        segments.push({
          viseme: i % 2 === 0 ? 'viseme_aa' : 'viseme_sil',
          startMs: cursor,
          endMs: cursor + dur,
        });
        cursor += dur + INTER_SYLLABLE_MS;
      }
      return { segments, fallback: true };
    }

    // Per-syllable conversion: string form keeps 汉字↔syllable alignment so
    // punctuation pauses land exactly where they appear in the text.
    const plain = this._pinyin(text, { toneType: 'num', type: 'string', nonZh: 'spaced' });
    const syllables = plain.split(/\s+/).filter(Boolean);

    let charIdx = 0;
    const chars = Array.from(text);

    for (const raw of syllables) {
      // pauses for punctuation chars that precede this syllable
      while (charIdx < chars.length && !CJK_RE.test(chars[charIdx])) {
        const ch = chars[charIdx];
        if ('，、,：:'.includes(ch)) pushPause(210);
        else if ('。！？；!?;'.includes(ch)) pushPause(400);
        else if (ch === '…' || ch === '—') pushPause(440);
        else if (/\S/.test(ch)) pushPause(70);
        charIdx++;
      }
      charIdx++; // consume the CJK char this syllable came from

      const parsed = parseSyllable(raw);
      if (!parsed) continue;
      const { initial, final, tone } = parsed;

      const initVis = initial ? INITIAL_VISEME[initial] : null;
      if (initVis) {
        const d = INITIAL_MS[initVis] || 48;
        segments.push({ viseme: `viseme_${initVis}`, startMs: cursor, endMs: cursor + d });
        cursor += d;
      }

      const segs = FINAL_SEGMENTS[final] || ['aa'];
      const weights = segmentWeights(segs.length);
      const toneScale = TONE_SCALE[tone] ?? 1;
      let total = 0;
      for (let i = 0; i < segs.length; i++) {
        const d = Math.round(SYLLABLE_NUCLEUS_MS * weights[i] * toneScale);
        segments.push({ viseme: `viseme_${segs[i]}`, startMs: cursor, endMs: cursor + d });
        cursor += d;
        total += d;
      }
      cursor += INTER_SYLLABLE_MS + (total < 90 ? 40 : 0);
    }

    return { segments, fallback: false };
  }
}
