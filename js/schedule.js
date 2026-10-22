// Pure timing logic: no DOM, no audio. Everything is in seconds from the
// moment START is pressed, so the current phase is always computed from
// elapsed time and lateness can never accumulate between phases.

export const DEFAULT_SESSION = {
  name: 'Pro 12 × 3',
  rounds: 12,
  work: 180,
  rest: 60,
  prepare: 10,
  warmup: 0,
  cooldown: 0,
  clapper: 10,    // wooden clapper this many seconds before a round ends (0 = off)
  marker: 0,      // extra marker sound this many seconds before a round ends (0 = off)
  secondsOut: 10, // buzzer this many seconds before rest ends (0 = off)
  restLabel: ''   // shown during rest, e.g. "Skipping"
};

export function normaliseSession(s) {
  const n = Object.assign({}, DEFAULT_SESSION, s || {});
  const int = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
  n.rounds = int(n.rounds, 1, 99);
  n.work = int(n.work, 5, 3600);
  n.rest = int(n.rest, 0, 3600);
  n.prepare = int(n.prepare, 0, 120);
  n.warmup = int(n.warmup, 0, 3600);
  n.cooldown = int(n.cooldown, 0, 3600);
  n.clapper = int(n.clapper, 0, 120);
  n.marker = int(n.marker, 0, 600);
  n.secondsOut = int(n.secondsOut, 0, 120);
  n.restLabel = String(n.restLabel || '').slice(0, 24);
  n.name = String(n.name || 'Workout').slice(0, 32);
  return n;
}

// Returns { segments, cues, total }.
// segment: { type, start, dur, round? }   type: warmup|prep|work|rest|cooldown
// cue:     { t, sound }                    sound: tick|roundStart|lastRound|clapper|marker|roundEnd|secondsOut|finish
export function buildSchedule(input) {
  const s = normaliseSession(input);
  const segments = [];
  const cues = [];
  let t = 0;
  const add = (type, dur, extra) => {
    if (dur <= 0) return null;
    const seg = Object.assign({ type, start: t, dur }, extra || {});
    segments.push(seg);
    t += dur;
    return seg;
  };

  if (add('warmup', s.warmup)) cues.push({ t: 0, sound: 'tick' });

  const prep = add('prep', s.prepare);
  if (prep) {
    for (let k = Math.min(3, prep.dur - 1); k >= 1; k--) cues.push({ t: prep.start + prep.dur - k, sound: 'tick' });
  }

  for (let r = 1; r <= s.rounds; r++) {
    const last = r === s.rounds;
    const w = add('work', s.work, { round: r });
    cues.push({ t: w.start, sound: last && s.rounds > 1 ? 'lastRound' : 'roundStart' });
    if (s.marker > 0 && s.marker < w.dur && s.marker !== s.clapper) cues.push({ t: w.start + w.dur - s.marker, sound: 'marker' });
    if (s.clapper > 0 && s.clapper < w.dur) cues.push({ t: w.start + w.dur - s.clapper, sound: 'clapper' });
    if (last) {
      cues.push({ t: w.start + w.dur, sound: 'finish' });
    } else {
      cues.push({ t: w.start + w.dur, sound: 'roundEnd' });
      const rest = add('rest', s.rest, { round: r });
      if (rest && s.secondsOut > 0 && s.secondsOut < rest.dur) cues.push({ t: rest.start + rest.dur - s.secondsOut, sound: 'secondsOut' });
    }
  }

  const cool = add('cooldown', s.cooldown);
  if (cool) cues.push({ t: cool.start + cool.dur, sound: 'roundStart' });

  cues.sort((a, b) => a.t - b.t);
  return { session: s, segments, cues, total: t };
}

// Where are we at `elapsed` seconds? Never throws; past the end returns done.
export function phaseAt(schedule, elapsed) {
  const segs = schedule.segments;
  if (elapsed >= schedule.total || !segs.length) {
    return { index: segs.length, seg: null, remaining: 0, done: true };
  }
  const e = Math.max(0, elapsed);
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i];
    if (e < g.start + g.dur) return { index: i, seg: g, remaining: g.start + g.dur - e, done: false };
  }
  return { index: segs.length, seg: null, remaining: 0, done: true };
}

// Rounds fully completed by `elapsed` (used for history when quitting early).
export function roundsCompleted(schedule, elapsed) {
  return schedule.segments.filter(g => g.type === 'work' && elapsed >= g.start + g.dur).length;
}

export function fmt(sec) {
  const v = Math.max(0, Math.ceil(sec - 1e-6));
  const h = Math.floor(v / 3600), m = Math.floor((v % 3600) / 60), x = v % 60;
  const ss = (x < 10 ? '0' : '') + x;
  if (h) return h + ':' + (m < 10 ? '0' : '') + m + ':' + ss;
  return m + ':' + ss;
}

export function describe(s) {
  const n = normaliseSession(s);
  return n.rounds + ' × ' + fmt(n.work) + (n.rest ? ' / ' + fmt(n.rest) : ' / no rest');
}
