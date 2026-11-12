/**
 * JARVIS NEXUS — Speech streaming utilities.
 *
 * splitSentences(): language-neutral sentence chunking for streamed TTS
 *   (works for 中文, English and mixed replies — splits on terminal
 *   punctuation, then on soft punctuation for over-long chunks, and merges
 *   orphan fragments so she never utters a lone "。").
 *
 * SpeechSequencer: plays a reply as a chain of sentence-sized utterances —
 *   chunk i speaks while chunk i+1's audio is still synthesizing server-side,
 *   so time-to-first-word is one short synthesis instead of one long one.
 *   Fully abortable (owner interrupt must kill in-flight fetches instantly).
 */

const MAX_CHUNK_CHARS = 140;

/** Strip [stage directions] and collapse whitespace. */
function cleanSpeechText(text) {
  return String(text || '')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a cleaned chunk that exceeds MAX_CHUNK_CHARS on soft punctuation. */
function splitLongChunk(chunk) {
  if (chunk.length <= MAX_CHUNK_CHARS) return [chunk];
  const parts = chunk
    .split(/(?<=[，,、；;:：—])/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if (buf && (buf + p).length > MAX_CHUNK_CHARS) {
      out.push(buf);
      buf = p;
    } else {
      buf += p;
    }
  }
  if (buf) out.push(buf);
  return out.length ? out : [chunk];
}

/**
 * Split text into speakable sentence chunks.
 * @param {string} text
 * @returns {string[]} non-empty chunks; empty input returns []
 */
export function splitSentences(text) {
  const clean = cleanSpeechText(text);
  if (!clean) return [];

  const raw = clean
    .split(/(?<=[。！？!?…；;.])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  for (const piece of raw) {
    for (const sub of splitLongChunk(piece)) {
      chunks.push(sub);
    }
  }

  // merge tiny orphans (a lone particle/punct can't survive as an utterance)
  const merged = [];
  for (const c of chunks) {
    const cjkCount = (c.match(/[\u4e00-\u9fff]/g) || []).length;
    const isTiny = c.replace(/[。！？!?…；;，,、\s]/g, '').length < 4 || (cjkCount > 0 && cjkCount < 2);
    if (isTiny && merged.length > 0) {
      merged[merged.length - 1] += c;
    } else {
      merged.push(c);
    }
  }
  return merged.filter((c) => c.replace(/[。！？!?…；;，,、\s]/g, '').length > 0 || merged.length === 1);
}

/**
 * Sequential utterance player with one-chunk-ahead audio prefetch.
 *
 * @param {object} opts
 * @param {(text: string, signal: AbortSignal) => Promise<{data: string, mime: string} | null>} opts.fetchAudio
 * @param {(text: string, audio: {data: string, mime: string} | null, onEnd: () => void) => void} opts.speakChunk
 * @param {() => void} opts.onDone  fired once when the whole queue finishes (or stops)
 * @param {() => void} [opts.onStart] fired when the first chunk starts
 */
export class SpeechSequencer {
  constructor(opts) {
    this.fetchAudio = opts.fetchAudio;
    this.speakChunk = opts.speakChunk;
    this.onDone = opts.onDone;
    this.onStart = opts.onStart || null;
    this._queue = [];
    this._index = 0;
    this._playing = false;
    this._stopped = false;
    this._controller = null;
    this._prefetch = null; // { index, promise }
  }

  get speaking() {
    return this._playing;
  }

  /**
   * Begin a new sequence. `firstAudio` optionally supplies chunk-0 audio
   * (server pre-synthesis) so playback starts with zero fetch latency.
   * @param {string} text
   * @param {{data: string, mime: string} | null} [firstAudio]
   */
  play(text, firstAudio = null) {
    this.stop(true);
    const chunks = splitSentences(text);
    if (!chunks.length) {
      this.onDone && this.onDone();
      return;
    }
    this._queue = chunks;
    this._index = 0;
    this._stopped = false;
    this._controller = new AbortController();
    this._playing = true;
    this._advance(firstAudio);
  }

  /** Abort everything. `silent` suppresses the onDone callback. */
  stop(silent = false) {
    this._stopped = true;
    this._playing = false;
    this._queue = [];
    this._index = 0;
    if (this._controller) {
      this._controller.abort();
      this._controller = null;
    }
    this._prefetch = null;
    if (!silent && this.onDone) this.onDone();
  }

  async _advance(preloadedAudio = null) {
    if (this._stopped) return;
    const i = this._index;
    const text = this._queue[i];
    if (text === undefined) {
      this._playing = false;
      this._stopped = true;
      this.onDone && this.onDone();
      return;
    }

    if (i === 0 && this.onStart) this.onStart();

    // consume the prefetch for this index if it matches, else the preloaded
    // server audio, else fetch now
    let audio = null;
    if (this._prefetch && this._prefetch.index === i) {
      audio = await this._consumePrefetch();
    } else if (preloadedAudio && preloadedAudio.data) {
      audio = preloadedAudio;
    } else {
      audio = await this._fetch(i);
    }
    if (this._stopped) return;

    // kick off the next chunk's synthesis while this one speaks
    this._launchPrefetch(i + 1);

    this.speakChunk(text, audio, () => {
      if (this._stopped) return;
      this._index = i + 1;
      this._advance();
    });
  }

  _fetch(index) {
    const text = this._queue[index];
    if (text === undefined) return Promise.resolve(null);
    const signal = this._controller ? this._controller.signal : undefined;
    return Promise.resolve(this.fetchAudio(text, signal))
      .catch(() => null);
  }

  _launchPrefetch(index) {
    if (this._stopped || this._prefetch || this._queue[index] === undefined) return;
    const promise = this._fetch(index);
    this._prefetch = { index, promise };
  }

  async _consumePrefetch() {
    const p = this._prefetch;
    this._prefetch = null;
    try {
      return await p.promise;
    } catch {
      return null;
    }
  }
}
