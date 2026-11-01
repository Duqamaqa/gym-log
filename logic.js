/*
 * Gym Log — pure logic (no DOM). Used by app.js in the browser and by tests in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GymLogic = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MAX_WEIGHT = 2000;
  const MAX_REPS = 1000;

  /** Exercise names are matched case-insensitively and ignoring extra spaces. */
  function cleanName(name) {
    return String(name == null ? '' : name).trim().replace(/\s+/g, ' ');
  }

  function keyOf(name) {
    return cleanName(name).toLowerCase();
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  /** Local date as YYYY-MM-DD. */
  function todayISO(d) {
    const date = d || new Date();
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function isISODate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /** Round to 2 decimals to avoid floating point noise (e.g. 62.50000001). */
  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  /** "62.5", "60", "1.25" — never "60.00". */
  function fmtNum(n) {
    return String(round2(n));
  }

  /** Accepts "62.5" and "62,5". Returns NaN when not a number. */
  function parseNum(input) {
    const s = String(input == null ? '' : input).trim().replace(',', '.');
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }

  /**
   * Validates a set typed by the user. Empty weight = 0 (bodyweight exercise).
   * Returns { ok: true, set } or { ok: false, error }.
   */
  function validateSetInput(weightInput, repsInput) {
    const w = String(weightInput == null ? '' : weightInput).trim() === '' ? 0 : parseNum(weightInput);
    const r = parseNum(repsInput);
    if (!Number.isFinite(w) || w < 0 || w > MAX_WEIGHT) {
      return { ok: false, error: 'Enter a weight between 0 and ' + MAX_WEIGHT + '.' };
    }
    if (!Number.isInteger(r) || r < 1 || r > MAX_REPS) {
      return { ok: false, error: 'Enter reps as a whole number (1 or more).' };
    }
    return { ok: true, set: { w: round2(w), r: r } };
  }

  /** Estimated one-rep max (Epley). 0 for bodyweight sets. */
  function e1rm(w, r) {
    if (!(w > 0) || !(r > 0)) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }

  /** Positive when set a is stronger than set b. */
  function compareSetStrength(a, b) {
    if (a.w === b.w) return a.r - b.r;
    const diff = e1rm(a.w, a.r) - e1rm(b.w, b.r);
    if (Math.abs(diff) > 1e-9) return diff;
    return a.w - b.w;
  }

  function bestSet(sets) {
    if (!sets || !sets.length) return null;
    return sets.reduce(function (best, s) {
      return compareSetStrength(s, best) > 0 ? s : best;
    });
  }

  function plural(n, word) {
    return n + ' ' + word + (Math.abs(n) === 1 ? '' : 's');
  }

  /**
   * Compares a set with the same-numbered set from last time.
   * Returns { status: 'up'|'same'|'down'|'new', text }.
   */
  function describeChange(cur, prev, unit) {
    if (!prev) return { status: 'new', text: 'new' };
    const parts = [];
    const dw = round2(cur.w - prev.w);
    const dr = cur.r - prev.r;
    if (dw !== 0) parts.push((dw > 0 ? '+' : '−') + fmtNum(Math.abs(dw)) + ' ' + unit);
    if (dr !== 0) parts.push((dr > 0 ? '+' : '−') + plural(Math.abs(dr), 'rep'));
    const cmp = compareSetStrength(cur, prev);
    const status = cmp > 0 ? 'up' : cmp < 0 ? 'down' : 'same';
    return { status: status, text: parts.length ? parts.join(', ') : 'same' };
  }

  function byDateAsc(a, b) {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  }

  function sortedWorkouts(workouts) {
    return (workouts || []).slice().sort(byDateAsc);
  }

  function findExercise(workout, name) {
    const k = keyOf(name);
    return workout.exercises.find(function (e) {
      return keyOf(e.name) === k;
    });
  }

  /**
   * The most recent earlier performance of an exercise (with at least one set),
   * strictly before `beforeWorkout` when given. Returns { date, workoutId, sets } or null.
   */
  function previousPerformance(workouts, name, beforeWorkout) {
    const k = keyOf(name);
    let result = null;
    sortedWorkouts(workouts).forEach(function (w) {
      if (beforeWorkout && (w.id === beforeWorkout.id || byDateAsc(w, beforeWorkout) >= 0)) return;
      const ex = w.exercises.find(function (e) {
        return keyOf(e.name) === k && e.sets.length > 0;
      });
      if (ex) result = { date: w.date, workoutId: w.id, sets: ex.sets };
    });
    return result;
  }

  /**
   * Progressive-overload target based on last time's heaviest set:
   * same weight with one more rep, or a small weight jump with the same reps.
   */
  function suggestNext(prevSets, unit) {
    if (!prevSets || !prevSets.length) return null;
    const top = prevSets.reduce(function (m, s) {
      return s.w > m.w || (s.w === m.w && s.r > m.r) ? s : m;
    });
    if (!(top.w > 0)) {
      return { moreReps: { w: 0, r: top.r + 1 }, moreWeight: null };
    }
    const inc = unit === 'lb' ? 5 : 2.5;
    return {
      moreReps: { w: top.w, r: top.r + 1 },
      moreWeight: { w: round2(top.w + inc), r: top.r },
    };
  }

  /** Every session of one exercise, oldest first. */
  function exerciseHistory(workouts, name) {
    const k = keyOf(name);
    const out = [];
    sortedWorkouts(workouts).forEach(function (w) {
      const ex = w.exercises.find(function (e) {
        return keyOf(e.name) === k && e.sets.length > 0;
      });
      if (!ex) return;
      const best = bestSet(ex.sets);
      out.push({
        date: w.date,
        workoutId: w.id,
        sets: ex.sets,
        best: best,
        e1rm: round2(e1rm(best.w, best.r)),
        volume: round2(ex.sets.reduce(function (sum, s) { return sum + s.w * s.r; }, 0)),
      });
    });
    return out;
  }

  /** One row per exercise ever logged (with sets), most recently used first. */
  function exerciseSummaries(workouts) {
    const map = new Map();
    sortedWorkouts(workouts).forEach(function (w) {
      w.exercises.forEach(function (e) {
        const k = keyOf(e.name);
        if (!k || !e.sets.length) return;
        let row = map.get(k);
        if (!row) {
          row = { key: k, name: e.name, sessions: 0, lastDate: w.date, best: null };
          map.set(k, row);
        }
        row.name = e.name;
        row.lastDate = w.date;
        row.sessions += 1;
        const b = bestSet(e.sets);
        if (!row.best || compareSetStrength(b, row.best) > 0) row.best = b;
      });
    });
    return Array.from(map.values()).sort(function (a, b) {
      return a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0;
    });
  }

  /** All distinct exercise names ever typed (including ones without sets yet). */
  function allExerciseNames(workouts) {
    const map = new Map();
    sortedWorkouts(workouts).forEach(function (w) {
      w.exercises.forEach(function (e) {
        const k = keyOf(e.name);
        map.delete(k); // re-insert so the most recently used ends up last
        map.set(k, e.name);
      });
    });
    return Array.from(map.values()).reverse();
  }

  function emptyData() {
    return { version: SCHEMA_VERSION, unit: 'kg', workouts: [] };
  }

  /** Validates and normalizes stored or imported data. Throws Error with a readable message. */
  function normalizeData(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workouts)) {
      throw new Error('This file is not a Gym Log backup.');
    }
    const unit = raw.unit === 'lb' ? 'lb' : 'kg';
    const seen = new Set();
    const workouts = raw.workouts.map(function (w, i) {
      if (!w || typeof w !== 'object' || !isISODate(w.date) || !Array.isArray(w.exercises)) {
        throw new Error('Workout #' + (i + 1) + ' is damaged.');
      }
      let id = typeof w.id === 'string' && w.id ? w.id : newId();
      while (seen.has(id)) id = newId();
      seen.add(id);
      return {
        id: id,
        date: w.date,
        createdAt: Number.isFinite(w.createdAt) ? w.createdAt : 0,
        exercises: w.exercises.map(function (e) {
          const name = cleanName(e && e.name).slice(0, 60);
          if (!name || !Array.isArray(e.sets)) {
            throw new Error('An exercise in workout ' + w.date + ' is damaged.');
          }
          return {
            name: name,
            sets: e.sets.map(function (s) {
              const ok = s && Number.isFinite(s.w) && s.w >= 0 && s.w <= MAX_WEIGHT &&
                Number.isInteger(s.r) && s.r >= 1 && s.r <= MAX_REPS;
              if (!ok) throw new Error('A set of ' + name + ' on ' + w.date + ' is damaged.');
              return { w: round2(s.w), r: s.r };
            }),
          };
        }),
      };
    });
    return { version: SCHEMA_VERSION, unit: unit, workouts: workouts };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    cleanName: cleanName,
    keyOf: keyOf,
    newId: newId,
    todayISO: todayISO,
    isISODate: isISODate,
    fmtNum: fmtNum,
    parseNum: parseNum,
    validateSetInput: validateSetInput,
    e1rm: e1rm,
    bestSet: bestSet,
    describeChange: describeChange,
    sortedWorkouts: sortedWorkouts,
    findExercise: findExercise,
    previousPerformance: previousPerformance,
    suggestNext: suggestNext,
    exerciseHistory: exerciseHistory,
    exerciseSummaries: exerciseSummaries,
    allExerciseNames: allExerciseNames,
    emptyData: emptyData,
    normalizeData: normalizeData,
  };
});
