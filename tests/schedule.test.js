import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, phaseAt, roundsCompleted, fmt } from '../js/schedule.js';

const pro = { rounds: 12, work: 180, rest: 60, prepare: 10, clapper: 10, secondsOut: 10 };

test('pro 12 x 3 total length', () => {
  const s = buildSchedule(pro);
  assert.equal(s.total, 10 + 12 * 180 + 11 * 60);
  assert.equal(s.segments.filter(g => g.type === 'work').length, 12);
  assert.equal(s.segments.filter(g => g.type === 'rest').length, 11);
});

test('segments are contiguous', () => {
  const s = buildSchedule(Object.assign({}, pro, { warmup: 300, cooldown: 120 }));
  let t = 0;
  for (const g of s.segments) { assert.equal(g.start, t); t += g.dur; }
  assert.equal(t, s.total);
  assert.equal(s.segments[0].type, 'warmup');
  assert.equal(s.segments.at(-1).type, 'cooldown');
});

test('cue sounds for a 3 round session', () => {
  const s = buildSchedule({ rounds: 3, work: 180, rest: 60, prepare: 10, clapper: 10, secondsOut: 10 });
  const at = snd => s.cues.filter(c => c.sound === snd).map(c => c.t);
  assert.deepEqual(at('roundStart'), [10, 250]);
  assert.deepEqual(at('lastRound'), [490]);
  assert.deepEqual(at('clapper'), [180, 420, 660]);
  assert.deepEqual(at('roundEnd'), [190, 430]);
  assert.deepEqual(at('secondsOut'), [240, 480]);
  assert.deepEqual(at('finish'), [670]);
  assert.deepEqual(at('tick'), [7, 8, 9]);
});

test('single round uses roundStart, not lastRound', () => {
  const s = buildSchedule({ rounds: 1, work: 60, rest: 0, prepare: 0 });
  assert.equal(s.cues[0].sound, 'roundStart');
  assert.equal(s.cues.at(-1).sound, 'finish');
});

test('no rest still rings round end between rounds', () => {
  const s = buildSchedule({ rounds: 3, work: 30, rest: 0, prepare: 0, clapper: 0 });
  assert.equal(s.cues.filter(c => c.sound === 'roundEnd').length, 2);
  assert.equal(s.segments.length, 3);
});

test('clapper longer than the round is skipped', () => {
  const s = buildSchedule({ rounds: 2, work: 8, rest: 5, prepare: 0, clapper: 10, secondsOut: 10 });
  assert.equal(s.cues.filter(c => c.sound === 'clapper').length, 0);
  assert.equal(s.cues.filter(c => c.sound === 'secondsOut').length, 0);
});

test('phaseAt finds the right phase', () => {
  const s = buildSchedule(pro);
  assert.equal(phaseAt(s, 0).seg.type, 'prep');
  const p = phaseAt(s, 10 + 179.5);
  assert.equal(p.seg.type, 'work');
  assert.equal(p.seg.round, 1);
  assert.ok(Math.abs(p.remaining - 0.5) < 1e-9);
  assert.equal(phaseAt(s, 190).seg.type, 'rest');
  assert.equal(phaseAt(s, s.total).done, true);
});

test('resumed 5 minutes late lands in the correct phase with no drift', () => {
  const s = buildSchedule(pro);
  // Locked at 0:30 into round 1, back 5 minutes later: 330 s elapsed.
  const p = phaseAt(s, 330);
  // prep 10 + r1 180 + rest 60 = 250 -> round 2 runs 250..430
  assert.equal(p.seg.type, 'work');
  assert.equal(p.seg.round, 2);
  assert.equal(p.remaining, 100);
  assert.equal(roundsCompleted(s, 330), 1);
});

test('fmt', () => {
  assert.equal(fmt(180), '3:00');
  assert.equal(fmt(9.2), '0:10');
  assert.equal(fmt(0), '0:00');
  assert.equal(fmt(3725), '1:02:05');
});
