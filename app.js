/* Gym Log — UI. All data is stored on this device (localStorage). */
(function () {
  'use strict';

  const L = window.GymLogic;
  const STORAGE_KEY = 'gymlog.v1';

  // ---------- tiny DOM helper (always uses textContent: user text is never parsed as HTML) ----------
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.append(x); });
      else el.append(c);
    }
    return el;
  }

  // ---------- storage ----------
  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? L.normalizeData(JSON.parse(raw)) : L.emptyData();
    } catch (err) {
      // Keep the damaged copy so nothing is silently lost.
      try { localStorage.setItem(STORAGE_KEY + '.damaged.' + Date.now(), localStorage.getItem(STORAGE_KEY) || ''); } catch (e) { /* ignore */ }
      setTimeout(function () { toast('Saved data could not be read. A copy was kept.'); }, 300);
      return L.emptyData();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (err) {
      toast('Could not save! Storage is full or blocked.');
      return false;
    }
  }

  // Ask the browser not to evict our data (best effort, supported by Safari 15.2+).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () { /* ignore */ });
  }

  // ---------- formatting ----------
  const unit = function () { return data.unit; };

  function fmtSet(s) {
    return s.w > 0 ? L.fmtNum(s.w) + ' ' + unit() + ' × ' + s.r : 'Bodyweight × ' + s.r;
  }

  function fmtSetShort(s) {
    return s.w > 0 ? L.fmtNum(s.w) + '×' + s.r : 'BW×' + s.r;
  }

  function fmtDate(iso, opts) {
    const p = iso.split('-').map(Number);
    const d = new Date(p[0], p[1] - 1, p[2]);
    return d.toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function relDate(iso) {
    const today = L.todayISO();
    if (iso === today) return 'Today';
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (iso === L.todayISO(y)) return 'Yesterday';
    return fmtDate(iso);
  }

  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  // ---------- navigation state ----------
  const ui = {
    tab: 'workout',
    date: L.todayISO(),
    progressKey: null, // exercise key when viewing one exercise's progress
  };

  const titles = { workout: 'Today', progress: 'Progress', history: 'History', settings: 'Settings' };

  function go(tab) {
    ui.tab = tab;
    if (tab !== 'progress') ui.progressKey = null;
    render();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.tabbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      const tab = b.getAttribute('data-tab');
      if (tab === 'workout' && ui.tab === 'workout') ui.date = L.todayISO();
      if (tab === 'progress') ui.progressKey = null;
      go(tab);
    });
  });

  function render() {
    const view = document.getElementById('view');
    const title = document.getElementById('title');
    view.replaceChildren();
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      if (b.getAttribute('data-tab') === ui.tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (ui.tab === 'workout') {
      title.textContent = ui.date === L.todayISO() ? 'Today' : 'Workout';
      renderWorkout(view);
    } else if (ui.tab === 'progress') {
      title.textContent = titles.progress;
      renderProgress(view);
    } else if (ui.tab === 'history') {
      title.textContent = titles.history;
      renderHistory(view);
    } else {
      title.textContent = titles.settings;
      renderSettings(view);
    }
  }

  // ---------- data helpers ----------
  function workoutFor(date, create) {
    let w = data.workouts.find(function (x) { return x.date === date; });
    if (!w && create) {
      w = { id: L.newId(), date: date, createdAt: Date.now(), exercises: [] };
      data.workouts.push(w);
    }
    return w || null;
  }

  function dropEmptyWorkout(w) {
    if (w && w.exercises.length === 0) {
      data.workouts = data.workouts.filter(function (x) { return x !== w; });
    }
  }

  // ---------- TODAY / WORKOUT ----------
  let focusAfterRender = null; // exercise key whose reps field should get focus

  function renderWorkout(view) {
    const w = workoutFor(ui.date, false);

    const dateInput = h('input', {
      type: 'date', id: 'workout-date', value: ui.date, max: L.todayISO(),
      onchange: function (e) {
        if (L.isISODate(e.target.value)) { ui.date = e.target.value; render(); }
      },
    });
    view.append(h('div', { class: 'date-row' }, h('label', { for: 'workout-date', text: 'Date' }), dateInput));

    if (!w || w.exercises.length === 0) {
      view.append(h('div', { class: 'card empty' },
        h('div', { class: 'big', 'aria-hidden': 'true', text: '🏋️' }),
        h('p', null, h('strong', { text: 'No exercises yet' })),
        h('p', { class: 'muted', text: 'Tap “Add exercise”, then write the weight and reps of every set.' })
      ));
    } else {
      w.exercises.forEach(function (ex) { view.append(exerciseCard(w, ex)); });
    }

    view.append(h('button', { type: 'button', class: 'btn primary block', id: 'add-exercise', onclick: openAddDialog }, '＋ Add exercise'));

    if (focusAfterRender) {
      const target = view.querySelector('[data-reps-for="' + CSS.escape(focusAfterRender) + '"]');
      focusAfterRender = null;
      if (target) target.focus();
    }
  }

  function exerciseCard(w, ex) {
    const prev = L.previousPerformance(data.workouts, ex.name, w);
    const key = L.keyOf(ex.name);

    const card = h('section', { class: 'card', 'aria-label': ex.name });
    card.append(h('div', { class: 'card-head' },
      h('h2', { text: ex.name }),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': 'Remove ' + ex.name, text: '🗑',
        onclick: function () {
          const msg = ex.sets.length
            ? 'Remove “' + ex.name + '” and its ' + ex.sets.length + ' set(s) from this workout?'
            : 'Remove “' + ex.name + '”?';
          if (!confirm(msg)) return;
          w.exercises = w.exercises.filter(function (x) { return x !== ex; });
          dropEmptyWorkout(w);
          save();
          render();
        },
      })
    ));

    if (prev) {
      const sug = L.suggestNext(prev.sets, unit());
      const goalText = sug.moreWeight ? fmtSet(sug.moreReps) + '  or  ' + fmtSet(sug.moreWeight) : fmtSet(sug.moreReps);
      card.append(h('div', { class: 'last-time' },
        h('strong', { text: 'Last time · ' + relDate(prev.date) }),
        h('div', { text: prev.sets.map(fmtSet).join('  ·  ') }),
        h('div', { class: 'goal', text: '🎯 Beat it: ' + goalText })
      ));
    } else {
      card.append(h('p', { class: 'muted small', text: 'First time — this will be your starting point.' }));
    }

    if (ex.sets.length) {
      const list = h('ol', { class: 'sets' });
      ex.sets.forEach(function (s, i) {
        const ch = L.describeChange(s, prev && prev.sets[i], unit());
        const arrow = ch.status === 'up' ? '▲ ' : ch.status === 'down' ? '▼ ' : '';
        list.append(h('li', null,
          h('span', { class: 'num', text: String(i + 1) }),
          h('span', { class: 'val', text: fmtSet(s) }),
          prev ? h('span', { class: 'badge ' + ch.status, text: arrow + ch.text }) : null,
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': 'Delete set ' + (i + 1), text: '✕',
            onclick: function () {
              ex.sets.splice(i, 1);
              save();
              render();
              toast('Set deleted');
            },
          })
        ));
      });
      card.append(list);
    }

    // Prefill with the matching set from last time, else the previous set today.
    const n = ex.sets.length;
    const guess = (prev && prev.sets[n]) || ex.sets[n - 1] || (prev && prev.sets[prev.sets.length - 1]) || null;
    const idBase = 'f-' + w.id + '-' + key.replace(/[^a-z0-9]/g, '_');
    const wIn = h('input', {
      id: idBase + '-w', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
      placeholder: '0', value: guess && guess.w > 0 ? L.fmtNum(guess.w) : '',
    });
    const rIn = h('input', {
      id: idBase + '-r', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
      placeholder: '0', value: guess ? String(guess.r) : '', 'data-reps-for': key,
    });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', {
      class: 'set-form', novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        const res = L.validateSetInput(wIn.value, rIn.value);
        if (!res.ok) { err.textContent = res.error; return; }
        ex.sets.push(res.set);
        save();
        render();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        toast('Set ' + ex.sets.length + ' saved: ' + fmtSet(res.set));
      },
    },
      h('div', null, h('label', { for: wIn.id, text: 'Weight (' + unit() + ')' }), wIn),
      h('div', null, h('label', { for: rIn.id, text: 'Reps' }), rIn),
      h('button', { type: 'submit', class: 'btn primary', text: '＋ Set ' + (n + 1) })
    );
    card.append(form, err);
    return card;
  }

  // ---------- add exercise dialog ----------
  const dlg = document.getElementById('add-dialog');
  const addForm = document.getElementById('add-form');
  const addName = document.getElementById('add-name');

  function addExercise(name) {
    const clean = L.cleanName(name).slice(0, 60);
    if (!clean) { addName.focus(); return; }
    const w = workoutFor(ui.date, true);
    if (L.findExercise(w, clean)) {
      toast('“' + clean + '” is already in this workout');
    } else {
      // Reuse the earlier spelling so the history of one exercise stays together.
      const known = L.allExerciseNames(data.workouts).find(function (n) { return L.keyOf(n) === L.keyOf(clean); });
      w.exercises.push({ name: known || clean, sets: [] });
      save();
    }
    dlg.close();
    focusAfterRender = L.keyOf(clean);
    render();
  }

  function openAddDialog() {
    const names = L.allExerciseNames(data.workouts);
    const w = workoutFor(ui.date, false);
    const notHere = names.filter(function (n) { return !(w && L.findExercise(w, n)); });
    document.getElementById('exercise-names').replaceChildren.apply(
      document.getElementById('exercise-names'),
      names.map(function (n) { return h('option', { value: n }); })
    );
    const chips = document.getElementById('add-recent');
    chips.replaceChildren.apply(chips, notHere.slice(0, 12).map(function (n) {
      return h('button', { type: 'button', text: n, onclick: function () { addExercise(n); } });
    }));
    addName.value = '';
    dlg.showModal();
    addName.focus();
  }

  addForm.addEventListener('submit', function (e) {
    e.preventDefault();
    addExercise(addName.value);
  });
  document.getElementById('add-cancel').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });

  // ---------- PROGRESS ----------
  function renderProgress(view) {
    const rows = L.exerciseSummaries(data.workouts);
    if (ui.progressKey) {
      const row = rows.find(function (r) { return r.key === ui.progressKey; });
      if (row) { renderExerciseProgress(view, row); return; }
      ui.progressKey = null;
    }
    if (!rows.length) {
      view.append(h('div', { class: 'card empty' },
        h('div', { class: 'big', 'aria-hidden': 'true', text: '📈' }),
        h('p', null, h('strong', { text: 'Nothing to show yet' })),
        h('p', { class: 'muted', text: 'Log your first workout and your progress will appear here.' })
      ));
      return;
    }
    view.append(h('p', { class: 'muted small', text: 'Tap an exercise to see every session and a chart.' }));
    rows.forEach(function (r) {
      view.append(h('button', {
        type: 'button', class: 'card list-btn',
        onclick: function () { ui.progressKey = r.key; render(); window.scrollTo(0, 0); },
      },
        h('span', null,
          h('span', { class: 'title', text: r.name }), h('br'),
          h('span', { class: 'muted small', text: 'Best: ' + fmtSet(r.best) + ' · ' + r.sessions + (r.sessions === 1 ? ' session' : ' sessions') })
        ),
        h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })
      ));
    });
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, text) {
    const el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    if (text != null) el.textContent = text;
    return el;
  }

  /** Simple line chart of one value per session. */
  function lineChart(points, label) {
    const W = 340, H = 180, PL = 44, PR = 12, PT = 14, PB = 28;
    const vals = points.map(function (p) { return p.v; });
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (min === max) { min = min - 1; max = max + 1; }
    const pad = (max - min) * 0.1;
    min = Math.max(0, min - pad); max = max + pad;
    const x = function (i) { return points.length === 1 ? (PL + W - PR) / 2 : PL + i * (W - PL - PR) / (points.length - 1); };
    const y = function (v) { return PT + (max - v) * (H - PT - PB) / (max - min); };

    const svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label });
    [max, (max + min) / 2, min].forEach(function (v) {
      svg.append(s('line', { class: 'axis', x1: PL, x2: W - PR, y1: y(v), y2: y(v) }));
      svg.append(s('text', { x: PL - 6, y: y(v) + 4, 'text-anchor': 'end' }, L.fmtNum(Math.round(v * 10) / 10)));
    });
    svg.append(s('polyline', { class: 'line', points: points.map(function (p, i) { return x(i) + ',' + y(p.v); }).join(' ') }));
    points.forEach(function (p, i) { svg.append(s('circle', { class: 'dot', cx: x(i), cy: y(p.v), r: 4 })); });
    const short = { day: 'numeric', month: 'short' };
    svg.append(s('text', { x: x(0), y: H - 8, 'text-anchor': points.length === 1 ? 'middle' : 'start' }, fmtDate(points[0].date, short)));
    if (points.length > 1) {
      svg.append(s('text', { x: x(points.length - 1), y: H - 8, 'text-anchor': 'end' }, fmtDate(points[points.length - 1].date, short)));
    }
    return svg;
  }

  let chartMode = 'weight'; // 'weight' = heaviest weight lifted, 'e1rm' = estimated 1-rep max

  function renderExerciseProgress(view, row) {
    const hist = L.exerciseHistory(data.workouts, row.name);
    document.getElementById('title').textContent = row.name;
    view.append(h('button', { type: 'button', class: 'back', onclick: function () { ui.progressKey = null; render(); } }, '‹ All exercises'));

    const first = hist[0], last = hist[hist.length - 1];
    const weighted = hist.some(function (x) { return x.best.w > 0; });
    const card = h('section', { class: 'card' });
    card.append(h('div', { class: 'stats' },
      stat('Best set ever', fmtSet(row.best)),
      stat('Last time', fmtSet(last.best)),
      stat('First time', fmtSet(first.best)),
      stat('Sessions', String(hist.length))
    ));
    view.append(card);

    if (hist.length >= 2) {
      const chartCard = h('section', { class: 'card' });
      const metric = function (x) {
        if (!weighted) return x.best.r;
        if (chartMode === 'e1rm') return x.e1rm;
        return Math.max.apply(null, x.sets.map(function (st) { return st.w; }));
      };
      const label = !weighted ? 'Best reps per session' : chartMode === 'e1rm' ? 'Estimated 1-rep max (' + unit() + ')' : 'Heaviest weight (' + unit() + ')';
      chartCard.append(h('h2', { text: label }));
      if (weighted) {
        const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Chart type' });
        [['weight', 'Heaviest weight'], ['e1rm', 'Strength (1RM)']].forEach(function (o) {
          seg.append(h('button', {
            type: 'button', 'aria-pressed': chartMode === o[0] ? 'true' : 'false', text: o[1],
            onclick: function () { chartMode = o[0]; render(); },
          }));
        });
        chartCard.append(seg);
      }
      chartCard.append(h('div', { class: 'chart-wrap' }, lineChart(hist.map(function (x) { return { date: x.date, v: metric(x) }; }), label)));
      if (weighted && chartMode === 'e1rm') {
        chartCard.append(h('p', { class: 'muted small', text: 'Combines weight and reps into one number, so more reps at the same weight also counts as progress.' }));
      }
      view.append(chartCard);
    }

    const list = h('section', { class: 'card' }, h('h2', { text: 'All sessions' }));
    hist.slice().reverse().forEach(function (x, idx, arr) {
      const older = arr[idx + 1];
      let badge = null;
      if (older) {
        const ch = L.describeChange(x.best, older.best, unit());
        badge = h('span', { class: 'badge ' + ch.status, text: (ch.status === 'up' ? '▲ ' : ch.status === 'down' ? '▼ ' : '') + ch.text });
      }
      list.append(h('div', { class: 'session' },
        h('div', { class: 'd' }, h('span', { text: relDate(x.date) }), badge),
        h('div', { class: 's', text: x.sets.map(fmtSet).join('  ·  ') })
      ));
    });
    view.append(list);
  }

  function stat(k, v) {
    return h('div', { class: 'stat' }, h('div', { class: 'k', text: k }), h('div', { class: 'v', text: v }));
  }

  // ---------- HISTORY ----------
  function renderHistory(view) {
    const list = L.sortedWorkouts(data.workouts).filter(function (w) { return w.exercises.length; }).reverse();
    if (!list.length) {
      view.append(h('div', { class: 'card empty' },
        h('div', { class: 'big', 'aria-hidden': 'true', text: '🗓️' }),
        h('p', null, h('strong', { text: 'No workouts yet' })),
        h('p', { class: 'muted', text: 'Every workout you log will be listed here.' })
      ));
      return;
    }
    view.append(h('p', { class: 'muted small', text: list.length + (list.length === 1 ? ' workout' : ' workouts') + ' · tap one to view or edit it.' }));
    list.forEach(function (w) {
      view.append(h('button', {
        type: 'button', class: 'card list-btn',
        onclick: function () { ui.date = w.date; go('workout'); },
      },
        h('span', null,
          h('span', { class: 'title', text: relDate(w.date) }),
          w.exercises.map(function (e) {
            return h('span', { class: 'muted small', style: 'display:block', text: e.name + ': ' + (e.sets.length ? e.sets.map(fmtSetShort).join(', ') : 'no sets') });
          })
        ),
        h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })
      ));
    });
  }

  // ---------- SETTINGS ----------
  function renderSettings(view) {
    const unitCard = h('section', { class: 'card' }, h('h2', { text: 'Weight unit' }));
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Weight unit' });
    [['kg', 'Kilograms (kg)'], ['lb', 'Pounds (lb)']].forEach(function (o) {
      seg.append(h('button', {
        type: 'button', 'aria-pressed': data.unit === o[0] ? 'true' : 'false', text: o[1],
        onclick: function () { data.unit = o[0]; save(); render(); },
      }));
    });
    unitCard.append(seg, h('p', { class: 'muted small', text: 'Only changes the label — numbers you already logged are not converted.' }));
    view.append(unitCard);

    const total = data.workouts.filter(function (w) { return w.exercises.length; }).length;
    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Backup' }),
      h('p', { class: 'muted small', text: 'Your data is stored only on this phone, in this browser. Save a backup file from time to time (to Files / iCloud Drive) so you never lose it.' }),
      h('button', { type: 'button', class: 'btn primary block', id: 'export-btn', onclick: exportData, disabled: total === 0 }, '⬇︎ Save backup file'),
      h('label', { class: 'btn ghost block', style: 'display:flex;align-items:center;justify-content:center', for: 'import-file' }, '⬆︎ Restore from backup file'),
      h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', style: 'display:none', onchange: importData })
    ));

    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Install on iPhone' }),
      h('p', { class: 'small', text: 'In Safari tap the Share button (□↑), then “Add to Home Screen”. It opens full-screen like an app and works without internet.' })
    ));

    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Danger zone' }),
      h('button', {
        type: 'button', class: 'btn danger block', disabled: total === 0,
        onclick: function () {
          if (!confirm('Delete ALL ' + total + ' workouts from this phone? This cannot be undone.')) return;
          if (!confirm('Are you really sure? Save a backup first if unsure.')) return;
          data = L.emptyData();
          save();
          render();
          toast('All data deleted');
        },
      }, 'Delete all data')
    ));
  }

  function exportData() {
    const json = JSON.stringify(data, null, 2);
    const name = 'gym-log-backup-' + L.todayISO() + '.json';
    const blob = new Blob([json], { type: 'application/json' });
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
    // On iPhone the share sheet offers "Save to Files" directly.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Gym Log backup' }).catch(function (err) {
        if (err && err.name !== 'AbortError') downloadBlob(blob, name);
      });
      return;
    }
    downloadBlob(blob, name);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Backup saved');
  }

  function importData(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast('File is too big to be a backup'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      let incoming;
      try {
        incoming = L.normalizeData(JSON.parse(String(reader.result)));
      } catch (err) {
        alert('Could not restore: ' + (err && err.message ? err.message : 'the file is not valid.'));
        return;
      }
      const n = incoming.workouts.length;
      if (!confirm('Replace the data on this phone with the backup (' + n + (n === 1 ? ' workout' : ' workouts') + ')?')) return;
      data = incoming;
      if (save()) toast('Backup restored');
      render();
    };
    reader.onerror = function () { toast('Could not read the file'); };
    reader.readAsText(file);
  }

  // Keep "Today" correct if the app was left open overnight.
  let lastToday = L.todayISO();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    const now = L.todayISO();
    if (now !== lastToday) {
      if (ui.date === lastToday) ui.date = now;
      lastToday = now;
      render();
    }
  });

  // Data changed in another tab -> reload it.
  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY) { data = load(); render(); }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode unavailable */ });
    });
  }

  render();
})();
