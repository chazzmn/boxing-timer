// localStorage wrapper. Everything stays on the device; every access is guarded
// because private browsing or a purged store can throw or come back empty.
import { normaliseSession } from './schedule.js';
import { DEFAULT_SOUNDS } from './sounds.js';

const K = { state: 'rt2_state', presets: 'rt2_presets', history: 'rt2_history' };

function read(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}
function write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

export function loadState() {
  const s = read(K.state, null) || migrateV1();
  return {
    session: normaliseSession(s.session),
    presetId: s.presetId || 'pro',
    sounds: Object.assign({}, DEFAULT_SOUNDS, s.sounds || {}),
    theme: ['auto', 'dark', 'light'].includes(s.theme) ? s.theme : 'auto',
    lockAudio: s.lockAudio !== false
  };
}
export function saveState(st) { write(K.state, st); }

export function getCustomPresets() { const p = read(K.presets, []); return Array.isArray(p) ? p : []; }
export function setCustomPresets(list) { write(K.presets, list); }

export function getHistory() { const h = read(K.history, []); return Array.isArray(h) ? h : []; }
export function addHistory(entry) {
  const h = getHistory();
  h.unshift(entry);
  write(K.history, h.slice(0, 500));
}

function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// Consecutive days with a session, counting back from today (or yesterday, so
// the streak is not shown as broken before you have trained today).
export function streak(history) {
  const days = new Set(history.map(e => dayKey(new Date(e.d))));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// Carry over settings and custom presets from the original single-file version.
function migrateV1() {
  const old = read('rt_cfg', null);
  const conv = c => ({
    rounds: c.rounds,
    work: (c.workMin || 0) * 60 + (c.workSec || 0),
    rest: (c.restMin || 0) * 60 + (c.restSec || 0),
    prepare: c.prepare,
    clapper: c.warnEnabled === false ? 0 : (Array.isArray(c.warnings) && c.warnings.includes(10) ? 10 : (c.warnings || [10])[0] || 0)
  });
  const oldPresets = read('rt_presets', []);
  if (Array.isArray(oldPresets) && oldPresets.length && !read(K.presets, null)) {
    setCustomPresets(oldPresets.filter(p => p && p.cfg).map((p, i) =>
      Object.assign(normaliseSession(conv(p.cfg)), { id: 'c' + Date.now() + i, name: String(p.name || 'My workout') })));
  }
  return old ? { session: Object.assign({ name: 'My settings' }, conv(old)), presetId: null } : {};
}
