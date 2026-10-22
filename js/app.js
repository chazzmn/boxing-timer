import { buildSchedule, phaseAt, roundsCompleted, fmt, describe, normaliseSession } from './schedule.js';
import { MOMENTS, BELL_STYLES, renderAll, renderMoment, wavRateFor, buildSessionWav } from './sounds.js';
import { BUILT_IN } from './presets.js';
import { QUOTES } from './quotes.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
const state = store.loadState();
const save = () => store.saveState(state);

/* ===================== audio ===================== */

let ctx = null;
let buffers = null;          // moment -> AudioBuffer, rendered from state.sounds
let buffersReady = null;     // promise

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    // iOS 17+: let Web Audio play through the silent switch like media does
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}
function playBuffer(buf, when = 0) {
  const c = ensureCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  src.start(c.currentTime + when);
  return src;
}
function prepareSounds() {
  buffersReady = renderAll(state.sounds, 44100).then(b => { buffers = b; return b; });
  return buffersReady;
}
async function playMoment(moment) {
  ensureCtx();
  playBuffer(await renderMoment(moment, state.sounds, 44100));
}

/* ===================== sessions ===================== */

function allPresets() { return BUILT_IN.concat(store.getCustomPresets()); }
function currentPreset() { return allPresets().find(p => p.id === state.presetId) || null; }

function selectPreset(p) {
  state.presetId = p.id;
  state.session = normaliseSession(p);
  save(); renderHome();
}

// Editing a built-in turns it into an unsaved custom session; editing a saved
// custom session updates that saved session in place.
function editSession(patch) {
  const p = currentPreset();
  Object.assign(state.session, patch);
  state.session = normaliseSession(state.session);
  if (p && !p.builtIn) {
    store.setCustomPresets(store.getCustomPresets().map(c => c.id === p.id ? Object.assign({}, state.session, { id: p.id }) : c));
  } else if (p && p.builtIn) {
    state.presetId = null;
    state.session.name = 'Custom';
  }
  save();
}

/* ===================== home ===================== */

function renderHome() {
  const s = state.session;
  const sched = buildSchedule(s);
  $('heroName').textContent = s.name;
  $('heroMeta').textContent = describe(s) + '  ·  ' + fmt(sched.total) + ' total';

  const tiles = $('tiles');
  tiles.textContent = '';
  allPresets().forEach(p => {
    const b = document.createElement('button');
    b.className = 'tile' + (p.id === state.presetId ? ' on' : '') + (p.builtIn ? '' : ' custom');
    const name = document.createElement('b'); name.textContent = p.name;
    const meta = document.createElement('small'); meta.textContent = describe(p);
    b.append(name, meta);
    b.onclick = () => selectPreset(p);
    tiles.append(b);
  });

  const hist = store.getHistory();
  const n = store.streak(hist);
  $('streak').textContent = n ? n + (n === 1 ? ' day' : ' days') + ' streak' : '';
  $('streak').classList.toggle('hidden', !n);
  $('historyHead').classList.toggle('hidden', !hist.length);
  const list = $('history');
  list.textContent = '';
  hist.slice(0, 6).forEach(e => {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = new Date(e.d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + e.name;
    const b = document.createElement('span');
    b.textContent = e.rounds + '/' + e.of + ' rounds';
    li.append(a, b);
    list.append(li);
  });
  $('themeBtn').textContent = { auto: 'Auto', dark: 'Dark', light: 'Light' }[state.theme];
}

function applyTheme() {
  if (state.theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', state.theme);
}

function show(id) {
  ['home', 'editor', 'sounds', 'run'].forEach(s => $(s).classList.toggle('hidden', s !== id));
  window.scrollTo(0, 0);
}

/* ===================== editor ===================== */

const off = v => v ? null : 'Off';
const FIELDS = [
  { k: 'rounds', label: 'Rounds', step: 1, show: v => String(v) },
  { k: 'work', label: 'Round length', step: 15, min: 15, show: fmt },
  { k: 'rest', label: 'Rest', step: 15, show: v => v ? fmt(v) : 'None' },
  { k: 'prepare', label: 'Get ready', sub: 'Countdown before round 1', step: 5, max: 60, show: v => off(v) || v + ' s' },
  { k: 'clapper', label: 'Clapper', sub: 'Wooden sticks before the round ends', step: 5, max: 60, show: v => off(v) || v + ' s' },
  { k: 'marker', label: 'Extra marker', sub: 'A second warning, e.g. 30 s left', step: 15, max: 600, show: v => off(v) || fmt(v) },
  { k: 'secondsOut', label: 'Seconds out', sub: 'Buzzer before rest ends', step: 5, max: 60, show: v => off(v) || v + ' s' },
  { k: 'warmup', label: 'Warm-up', sub: 'Before the first round', step: 60, max: 1800, show: v => off(v) || fmt(v) },
  { k: 'cooldown', label: 'Cool-down', sub: 'After the last round', step: 60, max: 1800, show: v => off(v) || fmt(v) }
];

function openEditor() {
  const box = $('fields');
  box.textContent = '';
  FIELDS.forEach(f => {
    const row = document.createElement('div'); row.className = 'row';
    const lab = document.createElement('span');
    lab.innerHTML = '<span class="label"></span>' + (f.sub ? '<span class="sub"></span>' : '');
    lab.firstChild.textContent = f.label;
    if (f.sub) lab.lastChild.textContent = f.sub;
    const st = document.createElement('div'); st.className = 'stepper';
    const minus = document.createElement('button'); minus.textContent = '−'; minus.setAttribute('aria-label', 'Less ' + f.label);
    const out = document.createElement('output');
    const plus = document.createElement('button'); plus.textContent = '+'; plus.setAttribute('aria-label', 'More ' + f.label);
    const paint = () => { out.textContent = f.show(state.session[f.k]); updateEditorTotal(); };
    const bump = d => {
      let v = state.session[f.k] + d * f.step;
      v = Math.max(f.min || 0, Math.min(f.max || 99 * 3600, v));
      if (f.k === 'rounds') v = Math.max(1, Math.min(99, v));
      editSession({ [f.k]: v }); paint();
    };
    holdRepeat(minus, () => bump(-1));
    holdRepeat(plus, () => bump(1));
    st.append(minus, out, plus);
    row.append(lab, st);
    box.append(row);
    paint();
  });
  $('restLabel').value = state.session.restLabel;
  $('saveName').value = '';
  const p = currentPreset();
  $('deleteBtn').classList.toggle('hidden', !p || p.builtIn);
  $('editTitle').textContent = p && !p.builtIn ? p.name : 'Customise';
  show('editor');
}

function updateEditorTotal() {
  $('editTotal').textContent = 'Total ' + fmt(buildSchedule(state.session).total);
}

// Press and hold a stepper button to keep stepping (works with gloves on).
function holdRepeat(btn, fn) {
  let t1, t2;
  const stop = () => { clearTimeout(t1); clearInterval(t2); };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault(); fn();
    t1 = setTimeout(() => { t2 = setInterval(fn, 90); }, 400);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
}

$('restLabel').addEventListener('input', e => editSession({ restLabel: e.target.value }));
$('saveBtn').onclick = () => {
  const name = $('saveName').value.trim();
  if (!name) { $('saveName').focus(); toast('Give it a name first'); return; }
  const p = Object.assign({}, state.session, { id: 'c' + Date.now(), name });
  store.setCustomPresets(store.getCustomPresets().concat(p));
  state.presetId = p.id; state.session = normaliseSession(p); save();
  toast('Saved “' + name + '”');
  openEditor();
};
$('deleteBtn').onclick = () => {
  const p = currentPreset();
  if (!p || p.builtIn) return;
  store.setCustomPresets(store.getCustomPresets().filter(c => c.id !== p.id));
  state.presetId = null; state.session.name = 'Custom'; save();
  toast('Deleted “' + p.name + '”');
  renderHome(); show('home');
};

/* ===================== sounds screen ===================== */

function openSounds() {
  const list = $('soundList');
  list.textContent = '';
  const group = (title, sub, opts, current, pick) => {
    const card = document.createElement('div'); card.className = 'card';
    const h = document.createElement('h3'); h.textContent = title;
    card.append(h);
    if (sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = sub; card.append(s); }
    const row = document.createElement('div'); row.className = 'opts';
    Object.keys(opts).forEach(k => {
      const b = document.createElement('button');
      b.className = 'opt' + (k === current ? ' on' : '');
      b.textContent = opts[k].name;
      b.onclick = () => { row.querySelectorAll('.opt').forEach(x => x.classList.remove('on')); b.classList.add('on'); pick(k); };
      row.append(b);
    });
    card.append(row);
    list.append(card);
  };
  group('Bell', 'The bell used for every bell sound', BELL_STYLES, state.sounds.bell, k => {
    state.sounds.bell = k; save(); prepareSounds(); playMoment('roundStart');
  });
  Object.keys(MOMENTS).filter(m => m !== 'tick').forEach(m => {
    const M = MOMENTS[m];
    if (Object.keys(M.options).length < 2) return;
    group(M.name, null, M.options, state.sounds[m], k => {
      state.sounds[m] = k; save(); prepareSounds(); playMoment(m);
    });
  });
  paintLockToggle();
  show('sounds');
}

function paintLockToggle() {
  $('lockToggle').setAttribute('aria-checked', String(state.lockAudio));
}
$('lockToggle').onclick = () => { state.lockAudio = !state.lockAudio; save(); paintLockToggle(); };

let demoTimer = null;
$('demoBtn').onclick = async () => {
  clearTimeout(demoTimer);
  const seq = ['roundStart', 'clapper', 'roundEnd', 'secondsOut', 'lastRound', 'finish'];
  const b = await (buffersReady || prepareSounds());
  ensureCtx();
  let t = 0;
  seq.forEach(m => { playBuffer(b[m], t); t += Math.min(b[m].duration, 2.6) + 0.5; });
  toast('Start, clapper, end, seconds out, last round, done');
};

/* ===================== run ===================== */

const track = $('track');
let R = null;          // the running session
let ticker = null, wakeLock = null;

function startSession() {
  ensureCtx(); // must happen inside the tap for iOS
  const schedule = buildSchedule(state.session);
  R = { schedule, mode: 'live', offset: 0, startPerf: performance.now(), paused: false, lastE: -1, url: null, finished: false };

  const rate = state.lockAudio && buffers ? wavRateFor(schedule.total) : null;
  if (rate) {
    try {
      R.url = URL.createObjectURL(buildSessionWav(schedule, buffers, rate));
      track.src = R.url;
      track.currentTime = 0;
      R.mode = 'lock';
      setMediaSession(schedule);
      track.play().catch(() => {
        // autoplay refused: carry on with live audio from where we are
        if (R && R.mode === 'lock') { R.mode = 'live'; R.offset = 0; R.startPerf = performance.now(); badge(); }
      });
    } catch (e) { R.mode = 'live'; }
  }
  if (!buffers && !rate) toast('Sounds still loading…');

  $('runCtrl').classList.remove('hidden');
  $('doneCtrl').classList.add('hidden');
  $('pauseBtn').textContent = 'Pause';
  show('run');
  badge();
  requestWakeLock();
  clearInterval(ticker);
  ticker = setInterval(frame, 100);
  frame();
}

function badge() {
  $('modeBadge').textContent = R && R.mode === 'lock' ? 'Lock-screen audio' : '';
}

function elapsed() {
  if (R.mode === 'lock') return track.currentTime;
  return R.paused ? R.offset : R.offset + (performance.now() - R.startPerf) / 1000;
}

function frame() {
  if (!R || R.finished) return;
  const e = elapsed();
  if (R.mode === 'live' && !R.paused && buffers) {
    // fire cues we have just passed; skip any more than 1.5 s stale (e.g. after a long background)
    for (const c of R.schedule.cues) {
      if (c.t > R.lastE && c.t <= e && e - c.t < 1.5) playBuffer(buffers[c.sound]);
    }
  }
  R.lastE = e;
  const p = phaseAt(R.schedule, e);
  if (p.done) return finishSession(true);
  paintRun(p, e);
}

let lastSecond = null, lastPhaseKey = null;
function paintRun(p, e) {
  const g = p.seg, s = R.schedule.session;
  const rem = p.remaining, secLeft = Math.ceil(rem - 1e-6);
  const key = g.type + (g.round || '');
  const final = (g.type === 'work' || g.type === 'rest' || g.type === 'prep') && rem <= 10;
  $('run').className = 'screen run p-' + g.type + (final ? ' final' : '') + (R.paused ? ' paused' : '') + (final && secLeft % 2 === 0 ? ' beat' : '');

  if (key !== lastPhaseKey) {
    lastPhaseKey = key;
    const ph = $('phase');
    if (g.type === 'work') {
      ph.textContent = 'Round ' + g.round + ' ';
      const sm = document.createElement('small'); sm.textContent = '/ ' + s.rounds; ph.append(sm);
    } else {
      ph.textContent = { prep: 'Get ready', rest: s.restLabel || 'Rest', warmup: 'Warm-up', cooldown: 'Cool-down' }[g.type];
    }
    const nextSeg = R.schedule.segments[p.index + 1];
    let sub = '';
    if (g.type === 'work') sub = g.round === s.rounds ? 'Last round' : nextSeg && nextSeg.type === 'rest' ? 'Rest next' : 'Round ' + (g.round + 1) + ' next';
    else if (nextSeg && nextSeg.type === 'work') sub = (nextSeg.round === s.rounds && s.rounds > 1 ? 'Last round' : 'Round ' + nextSeg.round) + ' next';
    else if (nextSeg) sub = nextSeg.type === 'prep' ? 'Get ready next' : '';
    $('subLine').textContent = sub;
    if (g.type === 'rest') showQuote(); else $('quote').classList.add('hidden');
  }
  if (secLeft !== lastSecond) {
    lastSecond = secLeft;
    $('time').textContent = fmt(rem);
    fitTime();
    updatePosition(e);
  }
  $('bar').style.width = Math.min(100, (1 - rem / g.dur) * 100) + '%';
}

// Scale the digits to the largest size that fits the space, in any orientation.
let fitKey = '';
function fitTime() {
  const el = $('time'), mid = $('runMid');
  const k = el.textContent.length + '|' + mid.clientWidth + 'x' + mid.clientHeight;
  if (k === fitKey) return;
  fitKey = k;
  el.style.fontSize = '100px';
  const w = el.scrollWidth || 1;
  const other = $('phase').offsetHeight + $('subLine').offsetHeight + ($('quote').classList.contains('hidden') ? 0 : $('quote').offsetHeight) + 16;
  const size = Math.max(60, Math.min(100 * (mid.clientWidth * 0.96) / w, (mid.clientHeight - other) / 0.92));
  el.style.fontSize = Math.floor(size) + 'px';
}
window.addEventListener('resize', () => { fitKey = ''; if (R && !R.finished) fitTime(); });

function showQuote() {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  const el = $('quote');
  el.textContent = '“' + q.q + '”';
  const em = document.createElement('em'); em.textContent = q.a; el.append(em);
  el.classList.remove('hidden');
}

function togglePause() {
  if (!R || R.finished) return;
  if (R.mode === 'lock') { track.paused ? track.play() : track.pause(); return; }
  if (R.paused) { R.paused = false; R.startPerf = performance.now(); requestWakeLock(); }
  else { R.offset = elapsed(); R.paused = true; }
  paintPause();
}
function paintPause() {
  $('pauseBtn').textContent = R.paused ? 'Resume' : 'Pause';
  $('run').classList.toggle('paused', R.paused);
}
// Lock-screen and headphone controls drive the audio element directly; follow them.
track.addEventListener('pause', () => { if (R && R.mode === 'lock' && !R.finished && !track.ended) { R.paused = true; paintPause(); } });
track.addEventListener('play', () => { if (R && R.mode === 'lock') { R.paused = false; paintPause(); requestWakeLock(); } });

function skip() {
  if (!R || R.finished) return;
  const p = phaseAt(R.schedule, elapsed());
  const next = R.schedule.segments[p.index + 1];
  if (!next) return finishSession(true);
  if (R.mode === 'lock') track.currentTime = Math.max(0, next.start - 0.02);
  else { R.offset = next.start; R.startPerf = performance.now(); R.lastE = next.start - 0.001; if (R.paused) R.lastE = next.start; }
  frame();
}

function finishSession(completed) {
  if (!R || R.finished) return;
  R.finished = true;
  clearInterval(ticker); ticker = null;
  const e = completed ? R.schedule.total : elapsed();
  const s = R.schedule.session;
  const done = completed ? s.rounds : roundsCompleted(R.schedule, e);
  if (done > 0) store.addHistory({ d: new Date().toISOString(), name: s.name, rounds: done, of: s.rounds, secs: Math.round(e) });
  releaseWakeLock();
  if (!completed) { stopTrack(); return; }
  const run = $('run');
  run.className = 'screen run p-done';
  $('phase').textContent = 'Done';
  $('time').textContent = s.rounds + (s.rounds === 1 ? ' round' : ' rounds');
  fitKey = ''; fitTime();
  $('subLine').textContent = fmt(R.schedule.total) + ' total';
  showQuote();
  $('bar').style.width = '100%';
  $('runCtrl').classList.add('hidden');
  $('doneCtrl').classList.remove('hidden');
  lastPhaseKey = null; lastSecond = null;
}

function stopTrack() {
  track.pause();
  if (R && R.url) { URL.revokeObjectURL(R.url); track.removeAttribute('src'); track.load(); }
}

function exitRun() {
  if (R && !R.finished) finishSession(false);
  else stopTrack();
  R = null; lastPhaseKey = null; lastSecond = null;
  renderHome(); show('home');
}

function setMediaSession(schedule) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: schedule.session.name, artist: 'Round Timer', album: describe(schedule.session),
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
    });
  } catch (e) {}
}
function updatePosition(e) {
  if (R.mode !== 'lock' || !('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  try { navigator.mediaSession.setPositionState({ duration: track.duration || R.schedule.total, position: Math.min(e, track.duration || e), playbackRate: 1 }); } catch (err) {}
}

/* ---- wake lock ---- */
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}
function releaseWakeLock() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !R || R.finished) return;
  if (ctx && ctx.state !== 'running') ctx.resume();
  if (!R.paused) requestWakeLock();
  frame(); // the clock is absolute, so this simply catches up
});

/* ---- hold to exit ---- */
(function () {
  const b = $('exitBtn');
  let t = null;
  const cancel = () => { clearTimeout(t); b.classList.remove('holding'); };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (R && R.finished) return exitRun();
    b.classList.add('holding');
    t = setTimeout(() => { cancel(); exitRun(); }, 800);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, cancel));
})();

/* ===================== wiring ===================== */

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2600);
}

$('startBtn').onclick = startSession;
$('editBtn').onclick = openEditor;
$('soundsBtn').onclick = openSounds;
$('themeBtn').onclick = () => {
  state.theme = { auto: 'dark', dark: 'light', light: 'auto' }[state.theme];
  save(); applyTheme(); renderHome();
};
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { renderHome(); show('home'); });
$('pauseBtn').onclick = togglePause;
$('skipBtn').onclick = skip;
$('againBtn').onclick = () => { stopTrack(); startSession(); };
$('homeBtn').onclick = exitRun;

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (!$('run').classList.contains('hidden')) {
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    else if (e.key === 'ArrowRight') skip();
    else if (e.key === 'Escape') exitRun();
  } else if (!$('home').classList.contains('hidden') && (e.code === 'Space' || e.key === 'Enter') && e.target === document.body) {
    e.preventDefault(); startSession();
  }
});

applyTheme();
renderHome();
prepareSounds();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging from the console; harmless in production
window.__rt = { state, get run() { return R; }, buildSchedule };
