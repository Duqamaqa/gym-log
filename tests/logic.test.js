'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

function wk(id, date, exercises, createdAt) {
  return { id: id, date: date, createdAt: createdAt || 0, exercises: exercises };
}

test('parseNum accepts dot and comma decimals, rejects junk', function () {
  assert.equal(L.parseNum('62.5'), 62.5);
  assert.equal(L.parseNum('62,5'), 62.5);
  assert.equal(L.parseNum(' 80 '), 80);
  assert.equal(L.parseNum('.5'), 0.5);
  assert.ok(Number.isNaN(L.parseNum('')));
  assert.ok(Number.isNaN(L.parseNum('abc')));
  assert.ok(Number.isNaN(L.parseNum('-5')));
  assert.ok(Number.isNaN(L.parseNum('1e3')));
  assert.ok(Number.isNaN(L.parseNum('1.2.3')));
});

test('validateSetInput', function () {
  assert.deepEqual(L.validateSetInput('60', '8'), { ok: true, set: { w: 60, r: 8 } });
  assert.deepEqual(L.validateSetInput('', '12'), { ok: true, set: { w: 0, r: 12 } }, 'empty weight = bodyweight');
  assert.deepEqual(L.validateSetInput('62,5', '5'), { ok: true, set: { w: 62.5, r: 5 } });
  assert.equal(L.validateSetInput('60', '').ok, false);
  assert.equal(L.validateSetInput('60', '0').ok, false);
  assert.equal(L.validateSetInput('60', '7.5').ok, false);
  assert.equal(L.validateSetInput('abc', '5').ok, false);
  assert.equal(L.validateSetInput('5000', '5').ok, false);
});

test('fmtNum strips float noise and trailing zeros', function () {
  assert.equal(L.fmtNum(60), '60');
  assert.equal(L.fmtNum(62.5), '62.5');
  assert.equal(L.fmtNum(0.1 + 0.2), '0.3');
});

test('isISODate rejects impossible dates', function () {
  assert.ok(L.isISODate('2026-01-11'));
  assert.ok(!L.isISODate('2026-02-30'));
  assert.ok(!L.isISODate('11/01/2026'));
});

test('describeChange: more weight, more reps, less, same, new', function () {
  assert.deepEqual(L.describeChange({ w: 62.5, r: 8 }, { w: 60, r: 8 }, 'kg'), { status: 'up', text: '+2.5 kg' });
  assert.deepEqual(L.describeChange({ w: 60, r: 9 }, { w: 60, r: 8 }, 'kg'), { status: 'up', text: '+1 rep' });
  assert.deepEqual(L.describeChange({ w: 60, r: 6 }, { w: 60, r: 8 }, 'kg'), { status: 'down', text: '−2 reps' });
  assert.deepEqual(L.describeChange({ w: 60, r: 8 }, { w: 60, r: 8 }, 'kg'), { status: 'same', text: 'same' });
  assert.deepEqual(L.describeChange({ w: 60, r: 8 }, undefined, 'kg'), { status: 'new', text: 'new' });
  // Heavier but fewer reps: judged by estimated 1RM. 70x5 (81.7) beats 60x8 (76).
  assert.equal(L.describeChange({ w: 70, r: 5 }, { w: 60, r: 8 }, 'kg').status, 'up');
  assert.equal(L.describeChange({ w: 70, r: 5 }, { w: 60, r: 8 }, 'kg').text, '+10 kg, −3 reps');
});

test('previousPerformance: last earlier session, case-insensitive, skips empty', function () {
  const workouts = [
    wk('a', '2026-01-01', [{ name: 'Bench Press', sets: [{ w: 60, r: 8 }] }]),
    wk('b', '2026-01-04', [{ name: 'bench  press', sets: [{ w: 62.5, r: 8 }] }]),
    wk('c', '2026-01-06', [{ name: 'Bench Press', sets: [] }]),
    wk('d', '2026-01-08', [{ name: 'Bench Press', sets: [{ w: 65, r: 6 }] }]),
  ];
  const prevForD = L.previousPerformance(workouts, 'Bench Press', workouts[3]);
  assert.equal(prevForD.date, '2026-01-04');
  assert.deepEqual(prevForD.sets, [{ w: 62.5, r: 8 }]);
  // Editing an OLD workout compares with what came before it, not after.
  assert.equal(L.previousPerformance(workouts, 'Bench Press', workouts[1]).date, '2026-01-01');
  assert.equal(L.previousPerformance(workouts, 'Bench Press', workouts[0]), null);
  assert.equal(L.previousPerformance(workouts, 'Squat', workouts[3]), null);
});

test('suggestNext gives +1 rep or +increment', function () {
  assert.deepEqual(L.suggestNext([{ w: 60, r: 8 }, { w: 60, r: 7 }], 'kg'), {
    moreReps: { w: 60, r: 9 }, moreWeight: { w: 62.5, r: 8 },
  });
  assert.deepEqual(L.suggestNext([{ w: 135, r: 5 }], 'lb').moreWeight, { w: 140, r: 5 });
  assert.deepEqual(L.suggestNext([{ w: 0, r: 12 }], 'kg'), { moreReps: { w: 0, r: 13 }, moreWeight: null });
  assert.equal(L.suggestNext([], 'kg'), null);
});

test('exerciseHistory and exerciseSummaries', function () {
  const workouts = [
    wk('b', '2026-01-04', [{ name: 'Squat', sets: [{ w: 100, r: 5 }, { w: 100, r: 4 }] }]),
    wk('a', '2026-01-01', [{ name: 'Squat', sets: [{ w: 90, r: 5 }] }, { name: 'Pull-up', sets: [{ w: 0, r: 8 }] }]),
    wk('c', '2026-01-05', [{ name: 'Curl', sets: [] }]),
  ];
  const hist = L.exerciseHistory(workouts, 'squat');
  assert.deepEqual(hist.map(function (x) { return x.date; }), ['2026-01-01', '2026-01-04']);
  assert.deepEqual(hist[1].best, { w: 100, r: 5 });
  assert.equal(hist[1].volume, 900);
  assert.equal(hist[1].e1rm, 116.67);

  const sums = L.exerciseSummaries(workouts);
  assert.deepEqual(sums.map(function (r) { return r.name; }), ['Squat', 'Pull-up'], 'exercises with no sets are excluded');
  assert.equal(sums[0].sessions, 2);
  assert.deepEqual(sums[0].best, { w: 100, r: 5 });
  assert.deepEqual(L.allExerciseNames(workouts), ['Curl', 'Squat', 'Pull-up']);
});

test('normalizeData validates backups', function () {
  const good = { version: 1, unit: 'lb', workouts: [wk('x', '2026-01-01', [{ name: '  Row ', sets: [{ w: 50, r: 10 }] }])] };
  const n = L.normalizeData(good);
  assert.equal(n.unit, 'lb');
  assert.equal(n.workouts[0].exercises[0].name, 'Row');

  assert.throws(function () { L.normalizeData(null); }, /not a Gym Log backup/);
  assert.throws(function () { L.normalizeData({ workouts: 'x' }); }, /not a Gym Log backup/);
  assert.throws(function () { L.normalizeData({ workouts: [{ date: 'bad', exercises: [] }] }); }, /damaged/);
  assert.throws(function () {
    L.normalizeData({ workouts: [wk('x', '2026-01-01', [{ name: 'Row', sets: [{ w: -1, r: 10 }] }])] });
  }, /damaged/);
  assert.throws(function () {
    L.normalizeData({ workouts: [wk('x', '2026-01-01', [{ name: 'Row', sets: [{ w: '50', r: 10 }] }])] });
  }, /damaged/);

  // Duplicate ids get repaired; unknown unit falls back to kg.
  const dup = L.normalizeData({ unit: 'stone', workouts: [wk('same', '2026-01-01', []), wk('same', '2026-01-02', [])] });
  assert.equal(dup.unit, 'kg');
  assert.notEqual(dup.workouts[0].id, dup.workouts[1].id);
});
