// Every sound is synthesised in code (no audio files). Each one is rendered
// once into an AudioBuffer through a drive + compressor chain and then
// normalised to just under full scale, so it plays as loud as the device allows.

const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;

// Bell voices. Ratios are dome-bell modes; each partial is a detuned pair so
// the ring shimmers like struck metal instead of sounding like a sine.
export const BELL_STYLES = {
  classic: { name: 'Classic ring', base: 820, decay: 2.8,
    partials: [[1, 1], [2.32, 0.75], [2.98, 0.4], [4.25, 0.55], [5.3, 0.3], [6.63, 0.28], [8.1, 0.12]] },
  brass: { name: 'Big brass', base: 540, decay: 3.6,
    partials: [[1, 0.8], [1.52, 0.5], [2.32, 0.85], [3.16, 0.45], [4.25, 0.55], [5.43, 0.35], [6.63, 0.25], [8.4, 0.12]] },
  bright: { name: 'Small gym', base: 1180, decay: 1.9,
    partials: [[1, 1], [2.32, 0.6], [4.25, 0.45], [6.63, 0.25]] }
};

// Moments in a session and the choices for each. `len` is the render length in seconds.
export const MOMENTS = {
  roundStart: { name: 'Round start', options: {
    bell: { name: 'Single bell', len: 3.8 },
    electric: { name: 'Electric bell', len: 2.4 },
    buzzer: { name: 'Buzzer', len: 1.0 } } },
  lastRound: { name: 'Last round start', options: {
    double: { name: 'Double bell', len: 4.2 },
    triplefast: { name: 'Triple fast', len: 4.4 },
    same: { name: 'Same as round start', len: 3.8 } } },
  clapper: { name: '10 second clapper', options: {
    sticks: { name: 'Sticks ×3', len: 0.6 },
    rapid: { name: 'Rapid sticks', len: 1.0 },
    knock: { name: 'Double knock ×2', len: 0.9 } } },
  marker: { name: 'Extra marker', options: {
    pips: { name: 'Double pip', len: 0.5 },
    tap: { name: 'Light bell tap', len: 1.6 } } },
  roundEnd: { name: 'Round end', options: {
    triple: { name: 'Ding ding ding', len: 4.4 },
    single: { name: 'Single bell', len: 3.8 },
    electric: { name: 'Electric bell', len: 2.6 } } },
  secondsOut: { name: 'Seconds out (rest ending)', options: {
    buzzer: { name: 'Buzzer', len: 0.9 },
    horn: { name: 'Horn', len: 1.2 },
    pips: { name: 'Pips', len: 0.7 } } },
  finish: { name: 'Workout done', options: {
    electric: { name: 'Electric bell', len: 5.2 },
    roll: { name: 'Bell roll', len: 5.5 },
    triple2: { name: 'Ding ding ding ×2', len: 6.0 } } },
  tick: { name: 'Countdown tick', options: {
    tick: { name: 'Tick', len: 0.15 } } }
};

export const DEFAULT_SOUNDS = {
  bell: 'classic', roundStart: 'bell', lastRound: 'double', clapper: 'sticks', marker: 'pips',
  roundEnd: 'triple', secondsOut: 'buzzer', finish: 'electric', tick: 'tick'
};

/* ---------------- building blocks (all take ctx, out, t) ---------------- */

let noiseCache = new WeakMap();
function noise(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

function env(g, t, peak, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function burst(ctx, out, t, { dur = 0.02, type = 'highpass', freq = 3000, q = 0.7, vol = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  src.connect(f); f.connect(g); g.connect(out);
  env(g, t, vol, 0.001, dur);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

// One hammer strike on a dome bell.
function strike(ctx, out, t, style, vol = 1, decayScale = 1) {
  const st = BELL_STYLES[style] || BELL_STYLES.classic;
  st.partials.forEach(([ratio, amp], i) => {
    const f = st.base * ratio;
    const d = st.decay * decayScale / (1 + (ratio - 1) * 0.28);
    [-1, 1].forEach(side => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * (1 + side * (0.0012 + i * 0.0004));
      o.connect(g); g.connect(out);
      env(g, t, vol * amp * 0.5, 0.002, d);
      o.start(t); o.stop(t + d + 0.1);
    });
  });
  // the hammer: a hard metallic click plus a short mid thunk
  burst(ctx, out, t, { dur: 0.012, freq: 3500, vol: vol * 0.9 });
  burst(ctx, out, t, { dur: 0.03, type: 'bandpass', freq: st.base * 2.32, q: 4, vol: vol * 0.7 });
}

// Electric gym bell: a hammer chattering against the gong ~22 times a second.
function electricBell(ctx, out, t, style, ringFor) {
  const st = BELL_STYLES[style] || BELL_STYLES.classic;
  const rate = 22, hits = Math.floor(ringFor * rate);
  st.partials.slice(0, 6).forEach(([ratio, amp], i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = st.base * ratio * (1 + (i % 2 ? 0.002 : -0.002));
    o.connect(g); g.connect(out);
    g.gain.setValueAtTime(0.0001, t);
    for (let h = 0; h < hits; h++) {
      const ht = t + h / rate;
      g.gain.setValueAtTime(amp * 0.55, ht);
      g.gain.exponentialRampToValueAtTime(amp * 0.22, ht + 1 / rate - 0.002);
    }
    const end = t + hits / rate;
    g.gain.exponentialRampToValueAtTime(0.0001, end + st.decay * 0.5 / (1 + (ratio - 1) * 0.3));
    o.start(t); o.stop(end + st.decay);
  });
  for (let h = 0; h < hits; h++) burst(ctx, out, t + h / rate, { dur: 0.008, freq: 4000, vol: 0.35 });
}

// Wooden clapper sticks: noise crack plus two short wood resonances.
function clack(ctx, out, t, vol = 1) {
  burst(ctx, out, t, { dur: 0.03, type: 'bandpass', freq: 2300, q: 1.2, vol: vol * 1.2 });
  burst(ctx, out, t, { dur: 0.006, freq: 5000, vol: vol * 0.8 });
  [[1150, 0.09], [2650, 0.05], [3900, 0.03]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
    o.connect(g); g.connect(out);
    env(g, t, vol * 0.8, 0.001, d);
    o.start(t); o.stop(t + d + 0.02);
  });
}

// Harsh buzzer: two detuned saws, hard clipped, pushed into the 1-3 kHz band phones play well.
function buzz(ctx, out, t, dur, freq = 180) {
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 6); }
  shaper.curve = curve;
  const peak = ctx.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 2000; peak.Q.value = 0.8; peak.gain.value = 10;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  const g = ctx.createGain();
  shaper.connect(peak); peak.connect(hp); hp.connect(g); g.connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
  g.gain.setValueAtTime(0.7, t + dur - 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  [freq, freq * 1.013, freq * 2.005].forEach(f => {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    o.connect(shaper); o.start(t); o.stop(t + dur + 0.02);
  });
}

function tone(ctx, out, t, freq, dur, type = 'square', vol = 0.6) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  o.connect(g); g.connect(out);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.setValueAtTime(vol, t + dur - 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.02);
}

/* ---------------- moment voices ---------------- */

function voice(moment, option, bell, ctx, out) {
  const t = 0.01;
  switch (moment + '.' + option) {
    case 'roundStart.bell': return strike(ctx, out, t, bell);
    case 'roundStart.electric': return electricBell(ctx, out, t, bell, 1.0);
    case 'roundStart.buzzer': return buzz(ctx, out, t, 0.8);
    case 'lastRound.double': strike(ctx, out, t, bell); return strike(ctx, out, t + 0.32, bell);
    case 'lastRound.triplefast': [0, 0.2, 0.4].forEach(d => strike(ctx, out, t + d, bell)); return;
    case 'lastRound.same': return strike(ctx, out, t, bell);
    case 'clapper.sticks': [0, 0.17, 0.34].forEach(d => clack(ctx, out, t + d)); return;
    case 'clapper.rapid': for (let i = 0; i < 9; i++) clack(ctx, out, t + i * 0.095, i % 2 ? 0.85 : 1); return;
    case 'clapper.knock': [0, 0.12, 0.5, 0.62].forEach(d => clack(ctx, out, t + d)); return;
    case 'marker.pips': tone(ctx, out, t, 1568, 0.11); return tone(ctx, out, t + 0.2, 2093, 0.14);
    case 'marker.tap': return strike(ctx, out, t, 'bright', 0.45, 0.6);
    case 'roundEnd.triple': [0, 0.36, 0.72].forEach(d => strike(ctx, out, t + d, bell)); return;
    case 'roundEnd.single': return strike(ctx, out, t, bell);
    case 'roundEnd.electric': return electricBell(ctx, out, t, bell, 1.4);
    case 'secondsOut.buzzer': return buzz(ctx, out, t, 0.75, 160);
    case 'secondsOut.horn': buzz(ctx, out, t, 1.0, 233); return buzz(ctx, out, t, 1.0, 294);
    case 'secondsOut.pips': [0, 0.2, 0.4].forEach(d => tone(ctx, out, t + d, 1760, 0.12)); return;
    case 'finish.electric': return electricBell(ctx, out, t, bell, 3.6);
    case 'finish.roll': for (let i = 0; i < 10; i++) strike(ctx, out, t + i * 0.26, bell, i % 2 ? 0.85 : 1, 0.7); return;
    case 'finish.triple2': [0, 0.36, 0.72, 1.6, 1.96, 2.32].forEach(d => strike(ctx, out, t + d, bell)); return;
    case 'tick.tick': return tone(ctx, out, t, 1320, 0.07, 'square', 0.5);
  }
}

/* ---------------- rendering ---------------- */

const cache = new Map();

export function optionFor(moment, prefs) {
  const opts = MOMENTS[moment].options;
  const o = prefs && prefs[moment];
  return opts[o] ? o : DEFAULT_SOUNDS[moment];
}

// Render one moment with the user's choices into a mastered, normalised AudioBuffer.
export async function renderMoment(moment, prefs, sampleRate = 44100) {
  const option = optionFor(moment, prefs);
  const bell = BELL_STYLES[prefs && prefs.bell] ? prefs.bell : DEFAULT_SOUNDS.bell;
  const key = [moment, option, bell, sampleRate].join('|');
  if (cache.has(key)) return cache.get(key);
  const len = MOMENTS[moment].options[option].len;
  const ctx = new OAC(1, Math.ceil(len * sampleRate), sampleRate);
  // mastering: drive into a soft clipper, then a fast compressor, then normalise after render
  const drive = ctx.createGain(); drive.gain.value = 1.6;
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) { const x = i / 1023.5 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  shaper.curve = curve;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.002; comp.release.value = 0.25;
  drive.connect(shaper); shaper.connect(comp); comp.connect(ctx.destination);
  voice(moment, option, bell, ctx, drive);
  const buf = await ctx.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
  if (peak > 0) { const k = 0.97 / peak; for (let i = 0; i < d.length; i++) d[i] *= k; }
  cache.set(key, buf);
  return buf;
}

export async function renderAll(prefs, sampleRate) {
  const out = {};
  for (const m of Object.keys(MOMENTS)) out[m] = await renderMoment(m, prefs, sampleRate);
  return out;
}

/* ---------------- whole-session WAV (for locked-screen playback) ---------------- */

const WAV_BUDGET = 64 * 1024 * 1024; // bytes of PCM we are willing to hold
const WAV_TAIL = 6;                  // let the finish bell ring out
const RATES = [22050, 16000, 12000, 11025];

// Choose a sample rate that keeps the file inside budget, or null if the session is too long.
export function wavRateFor(seconds) {
  for (const r of RATES) if ((seconds + WAV_TAIL) * r * 2 <= WAV_BUDGET) return r;
  return null;
}

// Mix every cue of the schedule into one 16-bit mono WAV. Silence is free to
// write (the array starts zeroed), so this is fast enough to do inside the tap.
export function buildSessionWav(schedule, buffers, rate) {
  const n = Math.ceil((schedule.total + WAV_TAIL) * rate);
  const bytes = new ArrayBuffer(44 + n * 2);
  const v = new DataView(bytes);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * 2, true);
  // mix straight into 16-bit (saturating) so we never hold a float copy of the session
  const out = new Int16Array(bytes, 44, n);
  for (const cue of schedule.cues) {
    const b = buffers[cue.sound];
    if (!b) continue;
    const src = b.getChannelData(0), step = b.sampleRate / rate;
    const start = Math.round(cue.t * rate), count = Math.floor((src.length - 1) / step);
    for (let i = 0; i < count && start + i < n; i++) {
      const x = i * step, j = x | 0, f = x - j;
      const s = out[start + i] + (src[j] * (1 - f) + src[j + 1] * f) * 32767;
      out[start + i] = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
