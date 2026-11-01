'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

function fixture() {
  const data = L.emptyData();
  const week = L.newWeek('2026-10-26');
  data.weeks.push(week);
  const session = week.sessions[0];
  session.name = 'Upper body';
  session.exercises.push({ name: 'Bench press', sets: [{ w: 60, r: 8 }, { w: 60, r: 8 }] });
  return { data, week, session };
}

test('weeks use local Monday–Sunday calendar boundaries across years and DST', () => {
  assert.equal(L.weekStart('2026-11-01'), '2026-10-26');
  assert.equal(L.weekStart('2026-11-02'), '2026-11-02');
  assert.equal(L.weekStart('2027-01-01'), '2026-12-28');
  assert.equal(L.shiftDate('2026-10-25', 1), '2026-10-26');
  assert.equal(L.shiftDate('2026-03-29', 1), '2026-03-30');
});

test('legacy data migrates without losing workout sets', () => {
  const legacy = { version: 1, unit: 'kg', workouts: [{ id: 'a', date: '2026-10-26', exercises: [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }] }] };
  const migrated = L.normalizeData(legacy);
  assert.equal(migrated.version, 2);
  assert.deepEqual(migrated.weeks, []);
  assert.deepEqual(migrated.workouts[0].exercises[0].sets, [{ w: 100, r: 5 }]);
});

test('starting a planned workout copies names but never targets into actual sets', () => {
  const { data, week, session } = fixture();
  const actual = L.startPlannedWorkout(data, week, session, '2026-10-28');
  assert.deepEqual(actual.exercises, [{ name: 'Bench press', sets: [] }]);
  assert.equal(actual.date, '2026-10-28');
  assert.equal(session.completedOn, null);
  assert.equal(L.startPlannedWorkout(data, week, session, '2026-10-28'), actual);
  assert.equal(data.workouts.length, 1, 'reopening never duplicates a workout');
  const second = L.startPlannedWorkout(data, week, week.sessions[1], '2026-10-28');
  assert.notEqual(actual.id, second.id, 'two sessions on one day remain independent');
});

test('completion supports past dates; unchecking preserves actual results', () => {
  const { data, week, session } = fixture();
  const actual = L.startPlannedWorkout(data, week, session, '2026-10-28');
  actual.exercises[0].sets.push({ w: 62.5, r: 8 });
  L.completePlannedWorkout(data, week, session, true, '2026-10-29');
  assert.equal(session.completedOn, '2026-10-29');
  assert.equal(actual.date, '2026-10-29');
  L.completePlannedWorkout(data, week, session, false, '');
  assert.equal(session.completedOn, null);
  assert.deepEqual(actual.exercises[0].sets, [{ w: 62.5, r: 8 }]);
  assert.throws(() => L.completePlannedWorkout(data, week, session, true, '2026-11-02'), /completion date/);
  const future = L.newWeek(L.shiftDate(L.todayISO(), 14));
  assert.throws(() => L.startPlannedWorkout(data, future, future.sessions[0], future.start), /no later than today/);
});

test('weekly activity shows both checked workouts and uncompleted logged sessions once', () => {
  const { data, week, session } = fixture();
  const actual = L.startPlannedWorkout(data, week, session, '2026-10-28');
  actual.exercises[0].sets.push({ w: 60, r: 8 });
  assert.equal(L.weekEvents(data, week)[0].completed, false);
  L.completePlannedWorkout(data, week, session, true, '2026-10-28');
  const events = L.weekEvents(data, week);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { date: '2026-10-28', name: 'Upper body', completed: true, workoutId: actual.id });
  assert.deepEqual(L.weekEvents(data, L.newWeek('2026-11-02')), []);
});

test('copying a plan resets completion and actual links while preserving independent targets', () => {
  const { data, week, session } = fixture();
  L.startPlannedWorkout(data, week, session, '2026-10-28');
  L.completePlannedWorkout(data, week, session, true, '2026-10-28');
  session.notes = 'Use a spotter';
  const copy = L.copyWeek(week, '2026-11-02');
  assert.equal(copy.start, '2026-11-02');
  assert.equal(copy.goal, 4);
  assert.notEqual(copy.sessions[0].id, session.id);
  assert.equal(copy.sessions[0].workoutId, null);
  assert.equal(copy.sessions[0].completedOn, null);
  assert.equal(copy.sessions[0].notes, session.notes);
  copy.sessions[0].exercises[0].sets[0].w = 70;
  assert.equal(session.exercises[0].sets[0].w, 60);
});

test('backup round trip preserves plans, actual links, notes and completions', () => {
  const { data, week, session } = fixture();
  const actual = L.startPlannedWorkout(data, week, session, '2026-10-28');
  L.completePlannedWorkout(data, week, session, true, '2026-10-28');
  session.notes = 'Slow repetitions';
  const restored = L.normalizeData(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.weeks, data.weeks);
  assert.equal(restored.workouts[0].label, 'Upper body');
  assert.equal(L.plannedSession(restored, actual.id).session.name, 'Upper body');
  const invalid = JSON.parse(JSON.stringify(data));
  invalid.weeks[0].sessions[0].completedOn = '2026-11-02';
  assert.throws(() => L.normalizeData(invalid), /outside its week/);
});

test('unit changes convert planned targets and actual weights together', () => {
  const { data, week, session } = fixture();
  const actual = L.startPlannedWorkout(data, week, session, '2026-10-28');
  actual.exercises[0].sets.push({ w: 60, r: 8 });
  const pounds = L.convertUnit(data, 'lb');
  assert.equal(L.fmtNum(pounds.weeks[0].sessions[0].exercises[0].sets[0].w), '132.28');
  assert.equal(pounds.workouts[0].exercises[0].sets[0].w, pounds.weeks[0].sessions[0].exercises[0].sets[0].w);
  assert.equal(session.exercises[0].sets[0].w, 60);
});
