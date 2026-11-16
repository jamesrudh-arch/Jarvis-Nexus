/* JARVIS Voice PWA — voice-first client (Stage 3.1).
 *
 * HONEST CAPABILITY MODEL (no fake features):
 *  - Speech input: browser SpeechRecognition where present (iOS 14.5+ Safari,
 *    Chrome, Edge, Android). iOS ends each recognition after silence — the
 *    auto-listen loop RE-ARMS it in the foreground; it does not survive
 *    backgrounding. This app NEVER claims always-listening.
 *  - Wake phrase "Hey JARVIS": runs a foreground recognition loop on browsers
 *    that sustain continuous recognition. Where unsupported it is hidden.
 *  - Speech output: browser speechSynthesis (on-device). No server TTS is
 *    configured yet — stated plainly in Settings when asked.
 *  - The owner key lives ONLY in this device's localStorage and is sent only
 *    to this app's own origin (the JARVIS NEXUS API).
 */
"use strict";

(() => {
  // ---- persistence ----------------------------------------------------------
  const store = {
    get key() { return localStorage.getItem("jarvis_owner_key") ?? ""; },
    set key(v) { v ? localStorage.setItem("jarvis_owner_key", v) : localStorage.removeItem("jarvis_owner_key"); },
    get sessionId() { return localStorage.getItem("jarvis_session") ?? null; },
    set sessionId(v) { v ? localStorage.setItem("jarvis_session", v) : localStorage.removeItem("jarvis_session"); },
    get autoListen() { return localStorage.getItem("jarvis_autolisten") === "1"; },
    set autoListen(v) { localStorage.setItem("jarvis_autolisten", v ? "1" : "0"); },
    get wake() { return localStorage.getItem("jarvis_wake") === "1"; },
    set wake(v) { localStorage.setItem("jarvis_wake", v ? "1" : "0"); },
    get speak() { return localStorage.getItem("jarvis_speak") !== "0"; },
    set speak(v) { localStorage.setItem("jarvis_speak", v ? "1" : "0"); },
    get voiceURI() { return localStorage.getItem("jarvis_voice") ?? ""; },
    set voiceURI(v) { localStorage.setItem("jarvis_voice", v); },
  };

  // ---- DOM --------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    gate: $("gate"), gateKey: $("gate-key"), gateGo: $("gate-go"), gateError: $("gate-error"),
    app: $("app"), dot: $("status-dot"), presence: $("presence"),
    transcript: $("transcript"), mic: $("btn-mic"), micPulse: $("mic-pulse"), hint: $("hint"),
    btnKeyboard: $("btn-keyboard"), inputSheet: $("input-sheet"), textInput: $("text-input"), textSend: $("text-send"),
    btnSettings: $("btn-settings"), settings: $("settings"), btnCloseSettings: $("btn-close-settings"),
    setVoice: $("set-voice"), setAutoListen: $("set-autolisten"), setWake: $("set-wake"), setWakeField: $("set-wake-field"),
    setSpeak: $("set-speak"), btnNewSession: $("btn-new-session"), btnLock: $("btn-lock"),
    btnEar: $("btn-ear"), btnWake: $("btn-wake"), capReport: $("cap-report"),
  };

  // ---- state -------------------------------------------------------------------
  const state = {
    presence: "CONNECTING",   // CONNECTING | ACTIVE | STANDBY | SLEEPING
    mode: "idle",             // idle | listening | thinking | speaking
    sessionId: store.sessionId,
    health: null,
    sttSupported: false,
    wakeCapable: false,
    wakeActive: false,
    wakeRecognizer: null,
    listenRecognizer: null,
    lastSpeakInterrupted: false,
    voices: [],
  };

  // ---- tiny helpers --------------------------------------------------------------
  const HINTS = {
    idle: () => state.wakeActive ? 'Listening for "Hey JARVIS" — or tap the mic'
      : store.autoListen ? "Auto-listen armed — tap the mic to start"
      : "Tap the mic and speak",
    listening: "Listening…",
    thinking: "JARVIS is thinking…",
    speaking: "JARVIS is speaking — tap the mic to interrupt",
    degraded: "Model unreachable — JARVIS answered honestly. Try again shortly.",
  };
  const setHint = (t) => { els.hint.textContent = t; };
  const setMode = (m) => {
    state.mode = m;
    els.mic.classList.toggle("listening", m === "listening");
    els.mic.classList.toggle("speaking", m === "speaking");
    els.micPulse.classList.toggle("on", m === "listening");
    els.dot.classList.toggle("dot-listen", m === "listening");
    els.dot.classList.toggle("dot-speak", m === "speaking");
    setHint(HINTS[m] ?? HINTS.idle());
  };
  const setPresence = (p) => {
    state.presence = p;
    els.presence.textContent = p === "ACTIVE" ? "online" : p.toLowerCase();
  };

  function addMsg(role, content, meta) {
    const div = document.createElement("div");
    div.className = role === "user" ? "msg msg-user" : "msg msg-jarvis";
    if (meta && meta.degraded) div.classList.add("degraded");
    div.textContent = content;
    if (meta && (meta.degraded || meta.memoriesStored)) {
      const m = document.createElement("span");
      m.className = "msg-meta";
      m.textContent = [meta.degraded ? "degraded mode" : null, meta.memoriesStored ? `remembered ${meta.memoriesStored} fact${meta.memoriesStored > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ");
      div.appendChild(m);
    }
    els.transcript.appendChild(div);
    els.transcript.scrollTop = els.transcript.scrollHeight;
    return div;
  }
  const addSystem = (text) => {
    const div = document.createElement("div");
    div.className = "msg msg-system";
    div.textContent = text;
    els.transcript.appendChild(div);
    els.transcript.scrollTop = els.transcript.scrollHeight;
  };

  // ---- API -----------------------------------------------------------------------
  async function api(path, init = {}, key = store.key) {
    const res = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401) { showGate("Key rejected — enter the correct owner key."); throw new Error("unauthorized"); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message ?? body.error ?? `HTTP ${res.status}`);
    return body;
  }

  // ---- conversation -----------------------------------------------------------------
  async function sendToJarvis(text) {
    setMode("thinking");
    try {
      const body = await api("/jarvis/converse", {
        method: "POST",
        body: JSON.stringify({ sessionId: state.sessionId ?? undefined, message: text }),
      });
      const d = body.data;
      state.sessionId = d.session.id;
      store.sessionId = d.session.id;
      addMsg("user", d.userMessage.content);
      addMsg("jarvis", d.reply.content, d.reply.meta);
      if (d.reply.meta.wokeFrom) addSystem(`woke from ${d.reply.meta.wokeFrom.toLowerCase()}`);
      setPresence("ACTIVE");
      speakReply(d.reply.content, () => {
        setMode("idle");
        if (store.autoListen && !d.reply.meta.degraded) armListener();
      });
      if (d.reply.meta.degraded) { setHint(HINTS.degraded); }
      return d;
    } catch (e) {
      setMode("idle");
      if (String(e.message) !== "unauthorized") addSystem(`connection problem: ${e.message}`);
      return null;
    }
  }

  // ---- TTS (browser, on-device) ---------------------------------------------------
  let speakChain = [];
  function pickVoice() {
    const chosen = state.voices.find((v) => v.voiceURI === store.voiceURI);
    if (chosen) return chosen;
    const en = state.voices.filter((v) => v.lang.startsWith("en"));
    return en.find((v) => /samantha|zira|aria|zoe|female|jenny/i.test(v.name))
      ?? en.find((v) => v.lang === "en-GB")
      ?? en[0]
      ?? state.voices[0]
      ?? null;
  }
  function speakReply(text, onDone) {
    if (!store.speak || !("speechSynthesis" in window)) { onDone?.(); return; }
    window.speechSynthesis.cancel(); // interruption: replace in-flight speech
    const voice = pickVoice();
    // sentence chunking keeps long replies responsive and interruption granular
    speakChain = text.match(/[^.!?…]+[.!?…]*/g) ?? [text];
    let i = 0;
    setMode("speaking");
    const speakNext = () => {
      if (i >= speakChain.length) { setMode("idle"); onDone?.(); return; }
      const u = new SpeechSynthesisUtterance(speakChain[i++].trim());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
      u.rate = 1.0;
      u.onend = speakNext;
      u.onerror = () => { setMode("idle"); onDone?.(); };
      window.speechSynthesis.speak(u);
    };
    speakNext();
  }
  function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    speakChain = [];
  }

  // ---- ASR (browser SpeechRecognition) ---------------------------------------------
  const RecCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  state.sttSupported = Boolean(RecCtor);
  if (state.sttSupported && /Chrome|Edg|Android/i.test(navigator.userAgent) && !/iPhone|iPad/i.test(navigator.userAgent)) {
    state.wakeCapable = true; // browsers that sustain continuous recognition loops
  }

  let interimEl = null;
  function makeRecognizer({ continuous, onFinal, onInterim, onEnd, onError }) {
    const rec = new RecCtor();
    rec.lang = "en-US";
    rec.continuous = continuous;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (interim) onInterim?.(finalText + interim);
    };
    rec.onerror = (e) => onError?.(e.error ?? "recognition error");
    rec.onend = () => onEnd?.(finalText.trim());
    return rec;
  }

  function armListener() {
    if (!state.sttSupported || state.mode !== "idle") return;
    stopWakeSpotter();
    setMode("listening");
    interimEl = document.createElement("div");
    interimEl.className = "msg msg-interim";
    els.transcript.appendChild(interimEl);
    state.listenRecognizer = makeRecognizer({
      continuous: false,
      onInterim: (t) => { interimEl.textContent = t; els.transcript.scrollTop = els.transcript.scrollHeight; },
      onEnd: (finalText) => {
        interimEl?.remove(); interimEl = null;
        state.listenRecognizer = null;
        if (finalText) handleUtterance(finalText);
        else { setMode("idle"); resumeWakeIfArmed(); }
      },
      onError: (err) => {
        interimEl?.remove(); interimEl = null;
        state.listenRecognizer = null;
        if (err === "not-allowed" || err === "service-not-allowed") {
          addSystem("microphone permission denied — enable it in browser settings, or use the keyboard");
          setMode("idle");
        } else if (err !== "no-speech" && err !== "aborted") {
          addSystem(`voice input error: ${err}`);
          setMode("idle");
        }
        resumeWakeIfArmed();
      },
    });
    try { state.listenRecognizer.start(); } catch { setMode("idle"); }
  }

  // ---- wake phrase spotter (foreground continuous loop) -------------------------------
  function startWakeSpotter() {
    if (!state.wakeCapable || !store.wake || state.wakeActive) return;
    state.wakeActive = true;
    els.btnWake.setAttribute("aria-pressed", "true");
    setHint(HINTS.idle());
    const spin = () => {
      if (!state.wakeActive) return;
      if (state.mode !== "idle") { setTimeout(spin, 400); return; }
      state.wakeRecognizer = makeRecognizer({
        continuous: true,
        onInterim: (t) => {
          if (/\b(hey\s+)?jarvis\b/i.test(t) && state.mode === "idle") {
            try { state.wakeRecognizer?.stop(); } catch { /* already stopped */ }
            state.wakeRecognizer = null;
            chime();
            armListener();
          }
        },
        onEnd: () => { state.wakeRecognizer = null; if (state.wakeActive) setTimeout(spin, 250); },
        onError: () => { state.wakeRecognizer = null; },
      });
      try { state.wakeRecognizer.start(); } catch { /* retry next spin */ }
    };
    spin();
  }
  function stopWakeSpotter() {
    state.wakeActive = false;
    els.btnWake.setAttribute("aria-pressed", "false");
    try { state.wakeRecognizer?.stop(); } catch { /* noop */ }
    state.wakeRecognizer = null;
    if (!store.wake) setHint(HINTS.idle());
  }
  const resumeWakeIfArmed = () => { if (state.wakeCapable && store.wake && !state.wakeActive) startWakeSpotter(); };
  function chime() {
    try {
      const ctx = new (window.AudioContext ?? window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.type = "sine"; g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.12);
      o.onended = () => ctx.close();
    } catch { /* audio blocked — silent */ }
  }

  // ---- utterance handling: voice commands + conversation ------------------------------
  const SLEEP_RE = /\b(go to sleep|sleep now|goodnight jarvis|good night jarvis)\b/i;
  const STANDBY_RE = /\b(stand ?by|stand by mode|pause listening)\b/i;
  const WAKE_RE = /\b(wake up|you there|are you (there|awake))\b/i;

  function handleUtterance(text) {
    if (state.presence !== "ACTIVE" && WAKE_RE.test(text)) {
      addMsg("user", text);
      api("/jarvis/converse", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId ?? undefined, message: text }) })
        .then((b) => {
          const d = b.data;
          state.sessionId = d.session.id; store.sessionId = d.session.id;
          addMsg("jarvis", d.reply.content, d.reply.meta);
          setPresence("ACTIVE");
          speakReply(d.reply.content, () => setMode("idle"));
        })
        .catch(() => setMode("idle"));
      return;
    }
    if (state.presence === "ACTIVE" && SLEEP_RE.test(text)) {
      addMsg("user", text);
      voiceSetPresence("SLEEPING", "Sleeping. Say wake up, or tap the mic, when you need me.");
      return;
    }
    if (state.presence === "ACTIVE" && STANDBY_RE.test(text)) {
      addMsg("user", text);
      voiceSetPresence("STANDBY", "Standing by. I'll drop the microphone until you wake me.");
      return;
    }
    sendToJarvis(text);
  }

  async function voiceSetPresence(p, say) {
    stopSpeaking();
    try {
      if (state.sessionId) await api("/jarvis/converse/session-state", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, state: p }) });
    } catch { /* session may not exist yet; presence is still honest locally */ }
    setPresence(p);
    addMsg("jarvis", say, {});
    speakReply(say, () => setMode("idle"));
    if (p !== "ACTIVE") stopWakeSpotter();
  }

  // ---- health / honest status ----------------------------------------------------------
  async function pollHealth() {
    try {
      const h = await fetch("/health").then((r) => r.json());
      state.health = h;
      const cls = h.overall === "healthy" ? "dot-ok" : h.overall === "degraded" ? "dot-warn" : "dot-off";
      if (state.mode !== "listening" && state.mode !== "speaking") {
        els.dot.className = `dot ${cls}`;
      }
    } catch {
      els.dot.className = "dot dot-off";
    }
  }

  // ---- session bootstrap ------------------------------------------------------------------
  async function bootstrap() {
    setPresence("ACTIVE");
    if (!store.sessionId) { addSystem("New conversation. Tap the mic and say hello."); return; }
    try {
      const h = await api(`/jarvis/converse/history?sessionId=${encodeURIComponent(store.sessionId)}&limit=60`);
      if (!h.data.length) { addSystem("New conversation. Tap the mic and say hello."); return; }
      for (const m of h.data) addMsg(m.role, m.content, m.meta);
      const s = await api("/jarvis/converse/sessions");
      const mine = s.data.find((x) => x.id === store.sessionId);
      if (mine && mine.state !== "ACTIVE") setPresence(mine.state);
      addSystem("— conversation resumed —");
    } catch {
      state.sessionId = null; store.sessionId = null;
      addSystem("Previous conversation unavailable — starting fresh.");
    }
  }

  // ---- gate ---------------------------------------------------------------------------------
  function showGate(err) {
    els.gate.classList.remove("hidden");
    els.app.style.visibility = "hidden";
    if (err) els.gateError.textContent = err;
    els.gateKey.focus();
  }
  async function tryUnlock() {
    const key = els.gateKey.value.trim();
    if (!key) return;
    els.gateError.textContent = "";
    try {
      await api("/jarvis/converse/sessions", {}, key); // probe with the JUST-ENTERED key
      store.key = key;
      els.gate.classList.add("hidden");
      els.app.style.visibility = "visible";
      await bootstrap();
    } catch (e) {
      if (String(e.message) !== "unauthorized") els.gateError.textContent = `cannot reach JARVIS: ${e.message}`;
    }
  }

  // ---- settings ---------------------------------------------------------------------------------
  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    state.voices = window.speechSynthesis.getVoices();
    els.setVoice.innerHTML = "";
    for (const v of state.voices) {
      const o = document.createElement("option");
      o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})`;
      els.setVoice.appendChild(o);
    }
    if (store.voiceURI) els.setVoice.value = store.voiceURI;
  }
  function renderCaps() {
    const rows = [
      ["Voice input (SpeechRecognition)", state.sttSupported ? "supported" : "not supported — use the keyboard"],
      ["Wake phrase", state.wakeCapable ? "available (foreground only)" : state.sttSupported ? "limited on this browser — use auto-listen or tap-to-talk" : "unavailable"],
      ["Speech output (speechSynthesis)", "speechSynthesis" in window ? "on-device voices" : "unavailable"],
      ["Server TTS", "not configured (browser voice is used)"],
      ["System health", state.health ? `${state.health.overall}` : "unknown"],
    ];
    els.capReport.innerHTML = rows.map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`).join("");
  }

  // ---- wire UI -----------------------------------------------------------------------------------
  els.mic.addEventListener("click", () => {
    if (state.mode === "speaking") { stopSpeaking(); setMode("idle"); armListener(); return; } // interruption
    if (state.mode === "listening") { try { state.listenRecognizer?.stop(); } catch {} return; }
    if (!state.sttSupported) { els.inputSheet.classList.remove("hidden"); els.textInput.focus(); return; }
    if (state.presence !== "ACTIVE") {
      setPresence("ACTIVE");
      api("/jarvis/converse/session-state", { method: "POST", body: JSON.stringify({ sessionId: state.sessionId, state: "ACTIVE" }) }).catch(() => {});
    }
    armListener();
  });
  els.btnKeyboard.addEventListener("click", () => {
    els.inputSheet.classList.toggle("hidden");
    if (!els.inputSheet.classList.contains("hidden")) els.textInput.focus();
  });
  const sendText = () => {
    const t = els.textInput.value.trim();
    if (!t) return;
    els.textInput.value = "";
    els.inputSheet.classList.add("hidden");
    handleUtterance(t);
  };
  els.textSend.addEventListener("click", sendText);
  els.textInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendText(); });

  els.btnEar.addEventListener("click", () => {
    store.autoListen = !store.autoListen;
    els.btnEar.setAttribute("aria-pressed", String(store.autoListen));
    els.setAutoListen.checked = store.autoListen;
    setHint(HINTS.idle());
  });
  els.btnWake.addEventListener("click", () => {
    if (!state.wakeCapable) return;
    store.wake = !store.wake;
    els.btnWake.setAttribute("aria-pressed", String(store.wake));
    els.setWake.checked = store.wake;
    store.wake ? startWakeSpotter() : stopWakeSpotter();
    setHint(HINTS.idle());
  });

  els.btnSettings.addEventListener("click", () => {
    els.settings.classList.remove("hidden");
    els.setAutoListen.checked = store.autoListen;
    els.setSpeak.checked = store.speak;
    els.setWake.checked = store.wake && state.wakeCapable;
    els.setWakeField.style.display = state.wakeCapable ? "" : "none";
    refreshVoices(); renderCaps();
  });
  els.btnCloseSettings.addEventListener("click", () => els.settings.classList.add("hidden"));
  els.setVoice.addEventListener("change", () => { store.voiceURI = els.setVoice.value; });
  els.setAutoListen.addEventListener("change", () => { store.autoListen = els.setAutoListen.checked; els.btnEar.setAttribute("aria-pressed", String(store.autoListen)); });
  els.setWake.addEventListener("change", () => {
    store.wake = els.setWake.checked && state.wakeCapable;
    els.btnWake.setAttribute("aria-pressed", String(store.wake));
    store.wake ? startWakeSpotter() : stopWakeSpotter();
  });
  els.setSpeak.addEventListener("change", () => { store.speak = els.setSpeak.checked; });
  els.btnNewSession.addEventListener("click", () => {
    state.sessionId = null; store.sessionId = null;
    els.transcript.innerHTML = "";
    addSystem("New conversation started.");
    els.settings.classList.add("hidden");
    setPresence("ACTIVE");
  });
  els.btnLock.addEventListener("click", () => {
    store.key = "";
    els.settings.classList.add("hidden");
    location.reload();
  });
  els.gateGo.addEventListener("click", tryUnlock);
  els.gateKey.addEventListener("keydown", (e) => { if (e.key === "Enter") tryUnlock(); });

  // ---- boot ----------------------------------------------------------------------------------------
  function boot() {
    els.btnEar.setAttribute("aria-pressed", String(store.autoListen));
    if (state.wakeCapable) els.btnWake.classList.remove("hidden");
    if (!state.sttSupported) els.mic.classList.add("disabled");
    if ("speechSynthesis" in window) {
      refreshVoices();
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
    pollHealth();
    setInterval(pollHealth, 60_000);
    if (store.key) {
      els.app.style.visibility = "visible";
      bootstrap().then(() => { if (store.wake) startWakeSpotter(); });
    } else {
      showGate();
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/app/sw.js").catch(() => { /* offline shell unavailable — app still works online */ });
    }
  }
  boot();
})();
