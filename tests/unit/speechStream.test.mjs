import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSentences, SpeechSequencer } from '../../src/nexus/vendor/speechStream.mjs';
import { LipsyncZh, hasCJK } from '../../src/nexus/vendor/lipsync-zh.mjs';

// ---------------------------------------------------------------- splitSentences
test('splitSentences: Mandarin punctuation yields per-sentence chunks', () => {
  const out = splitSentences('好的，我马上开始分析。预计需要三分钟。你可以先去休息。');
  assert.deepEqual(out, ['好的，我马上开始分析。', '预计需要三分钟。', '你可以先去休息。']);
});

test('splitSentences: English terminal punctuation splits too', () => {
  const out = splitSentences('Sure thing, Boss. Running it now; results in three minutes.');
  assert.equal(out.length, 3);
  assert.match(out[0], /Boss\.$/);
});

test('splitSentences: mixed zh/en text stays coherent', () => {
  const out = splitSentences('收到。Mixing 中英 text 是常态，对吧？Yes!');
  assert.ok(out.length >= 2);
  assert.equal(out.join(''), '收到。Mixing 中英 text 是常态，对吧？Yes!');
});

test('splitSentences: tiny orphans merge into the previous chunk', () => {
  const out = splitSentences('明白了。好。');
  assert.equal(out.length, 1);
});

test('splitSentences: strips [stage directions] and collapses whitespace', () => {
  const out = splitSentences('[softly] Systems   nominal. [turns] Running   checks.');
  assert.deepEqual(out, ['Systems nominal.', 'Running checks.']);
});

test('splitSentences: empty and punct-only input produce no chunks', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
  assert.deepEqual(splitSentences('[aside]'), []);
});

test('splitSentences: over-long chunks are split on soft punctuation', () => {
  const long = '这是一段很长的连续汇报，' + '每个逗号分句都包含十几个字符的信息量，'.repeat(10) + '因此必须在逗号处切开。';
  assert.ok(long.length > 140, 'fixture must exceed the chunk cap');
  const out = splitSentences(long);
  assert.ok(out.length >= 2);
  for (const c of out) assert.ok(c.length <= 140, `chunk too long: ${c.length}`);
  assert.equal(out.join(''), long);
});

// ---------------------------------------------------------------- LipsyncZh
test('hasCJK detects CJK but not latin', () => {
  assert.equal(hasCJK('你好'), true);
  assert.equal(hasCJK('hello'), false);
  assert.equal(hasCJK('mixed 中英'), true);
});

test('LipsyncZh fallback works without pinyin init (alternating jaw)', () => {
  const zh = new LipsyncZh();
  const { segments, fallback } = zh.buildTimeline('你好世界', 0);
  assert.equal(fallback, true);
  assert.ok(segments.length >= 4);
  let last = -1;
  for (const s of segments) {
    assert.ok(s.endMs > s.startMs);
    assert.ok(s.startMs >= last);
    last = s.startMs;
  }
});

test('LipsyncZh pinyin engine: known syllables map to expected visemes', async () => {
  const zh = new LipsyncZh();
  const ok = await zh.init();
  if (!ok) return; // pinyin-pro unavailable in this env — fallback covered above
  const { segments, fallback } = zh.buildTimeline('你好', 0);
  assert.equal(fallback, false);
  const names = segments.map((s) => s.viseme);
  // nǐ = nn + I ; hǎo = kk + aa + O
  assert.ok(names.includes('viseme_nn'));
  assert.ok(names.includes('viseme_I'));
  assert.ok(names.includes('viseme_kk'));
  assert.ok(names.includes('viseme_aa'));
  assert.ok(names.includes('viseme_O'));
});

test('LipsyncZh pinyin engine: full utterance is monotonic and has pauses', async () => {
  const zh = new LipsyncZh();
  const ok = await zh.init();
  if (!ok) return;
  const { segments } = zh.buildTimeline('正在分析安全日志，请稍等。', 0);
  assert.ok(segments.length > 10);
  let lastStart = -1;
  let lastEnd = 0;
  for (const s of segments) {
    assert.ok(s.endMs > s.startMs);
    assert.ok(s.startMs >= lastStart);
    assert.ok(s.endMs >= lastEnd - 1);
    lastStart = s.startMs;
    lastEnd = s.endMs;
  }
  // total should exceed 2.5s (10 syllables + pauses)
  assert.ok(lastEnd > 2500, `too short: ${lastEnd}ms`);
});

// ---------------------------------------------------------------- SpeechSequencer
test('SpeechSequencer: plays all chunks in order then onDone', async () => {
  const spoken = [];
  const fetched = [];
  const done = new Promise((resolve) => {
    const seq = new SpeechSequencer({
      fetchAudio: async (text) => { fetched.push(text); return null; },
      speakChunk: (text, audio, onEnd) => {
        spoken.push(text);
        assert.equal(audio, null);
        setTimeout(onEnd, 5); // simulate utterance duration
      },
      onDone: resolve,
    });
    seq.play('第一句话。第二句话。第三句话。');
  });
  await done;
  assert.deepEqual(spoken, ['第一句话。', '第二句话。', '第三句话。']);
  // first chunk fetched, rest prefetched during playback — total fetches == chunks
  assert.equal(fetched.length, 3);
});

test('SpeechSequencer: preloaded first-sentence audio skips its fetch', async () => {
  const fetched = [];
  const spokenWithAudio = [];
  const done = new Promise((resolve) => {
    const seq = new SpeechSequencer({
      fetchAudio: async (text) => { fetched.push(text); return null; },
      speakChunk: (text, audio, onEnd) => {
        spokenWithAudio.push({ text, hasAudio: Boolean(audio) });
        setTimeout(onEnd, 5);
      },
      onDone: resolve,
    });
    seq.play('第一句话。第二句话。', { data: 'AAAA', mime: 'audio/wav' });
  });
  await done;
  assert.equal(fetched.length, 1); // only chunk 1 fetched
  assert.equal(spokenWithAudio.length, 2);
  assert.ok(spokenWithAudio[0].hasAudio, 'chunk 0 must use preloaded audio');
  assert.ok(!spokenWithAudio[1].hasAudio, 'chunk 1 has no server audio in this test');
});

test('SpeechSequencer: stop() halts the chain and fires onDone once', async () => {
  let onDoneCount = 0;
  let speakCount = 0;
  const seq = new SpeechSequencer({
    fetchAudio: async () => ({ data: 'AAAA', mime: 'audio/wav' }),
    speakChunk: (text, audio, onEnd) => { speakCount++; /* never call onEnd — stuck */ },
    onDone: () => { onDoneCount++; },
  });
  seq.play('第一句。第二句。第三句。');
  await new Promise((r) => setTimeout(r, 30));
  seq.stop();
  assert.equal(onDoneCount, 1);
  assert.equal(speakCount, 1); // chain stopped after first chunk
});

test('SpeechSequencer: failed fetch falls back to silent speak (audio null)', async () => {
  const seen = [];
  const done = new Promise((resolve) => {
    const seq = new SpeechSequencer({
      fetchAudio: async () => { throw new Error('tts down'); },
      speakChunk: (text, audio, onEnd) => {
        seen.push({ text, audio });
        setTimeout(onEnd, 5);
      },
      onDone: resolve,
    });
    seq.play('第一句话说完。第二句话继续。');
  });
  await done;
  assert.equal(seen.length, 2);
  for (const s of seen) assert.equal(s.audio, null);
});
