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
  let savedJSON = JSON.stringify(data);
  const drafts = new Map();

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
      const json = JSON.stringify(data);
      localStorage.setItem(STORAGE_KEY, json);
      savedJSON = json;
      return true;
    } catch (err) {
      data = JSON.parse(savedJSON);
      toast('Could not save. Storage is full or blocked. Your previous log is unchanged.');
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
    const reps = s.r + (s.r === 1 ? ' rep' : ' reps');
    return s.w > 0 ? L.fmtNum(s.w) + ' ' + unit() + ' × ' + reps : 'Bodyweight × ' + reps;
  }

  function fmtSetShort(s) {
    return fmtSet(s);
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
    week: L.weekStart(L.todayISO()),
    planSessionId: null,
    workoutId: null,
    planExerciseKey: null,
    activeExerciseKey: null,
    manageExerciseKey: null,
    planPane: null,
    settingsGroup: null,
    progressKey: null, // exercise key when viewing one exercise's progress
  };

  const titles = { workout: 'Today', progress: 'Progress', history: 'History', settings: 'Settings' };

  function go(tab) {
    if (tab === 'settings' && ui.tab !== 'settings') ui.settingsGroup = null;
    ui.tab = tab;
    if (tab !== 'progress') ui.progressKey = null;
    render();
    document.getElementById('view').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('.tabbar button').forEach(function (b) {
    b.addEventListener('click', function () {
      const tab = b.getAttribute('data-tab');
      if (tab === 'workout') { ui.date = L.todayISO(); ui.workoutId = null; }
      if (tab === 'progress') ui.progressKey = null;
      go(tab);
    });
  });

  function render() {
    const view = document.getElementById('view');
    const title = document.getElementById('title');
    const eyebrow = document.getElementById('eyebrow-right');
    view.replaceChildren();
    document.body.dataset.view = ui.tab;
    eyebrow.textContent = ui.tab === 'workout'
      ? fmtDate(ui.date, { day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    document.querySelectorAll('.tabbar button').forEach(function (b) {
      if (b.getAttribute('data-tab') === (['workout', 'plan'].includes(ui.tab) ? ui.tab : 'review')) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.getElementById('chapter').textContent = { review: 'Your training, at a glance', plan: 'Flexible training', workout: 'Workout log', progress: 'Exercise progress', history: 'Past workouts', settings: 'Preferences & backup' }[ui.tab];
    document.getElementById('page-note').textContent = { review: 'Progress, past workouts, and your preferences.', plan: 'Set a weekly goal. Train on any day, in any order.', workout: 'Add exercises and save each set.', progress: 'Choose an exercise to compare your weights and repetitions over time.', history: 'Open a past workout to review or edit your sets.', settings: 'Change weight units, back up your workouts, or restore a saved file.' }[ui.tab];
    if (['history', 'settings'].includes(ui.tab) || (ui.tab === 'progress' && !ui.progressKey)) view.append(h('button', { type: 'button', class: 'back', onclick: function () { go('review'); } }, '← Review'));
    if (ui.tab === 'review') {
      title.textContent = 'Review';
      renderReview(view);
    } else if (ui.tab === 'plan') {
      title.textContent = 'Weekly plan';
      renderPlan(view);
    } else if (ui.tab === 'workout') {
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
    if (focusAfterRender) {
      const target = view.querySelector('[data-reps-for="' + CSS.escape(focusAfterRender) + '"]');
      focusAfterRender = null;
      if (target) target.focus();
    }
  }

  // Menus use native details/summary; dialogs use native focus trapping and Escape.
  function actionMenu(label, items, ariaLabel) {
    const menu = h('details', { class: 'action-menu' });
    const trigger = h('summary', { text: label, 'aria-label': ariaLabel || label });
    menu.append(trigger, h('div', { class: 'action-menu-items' }, items.map(function (item) {
      return h('button', { type: 'button', disabled: !!item.disabled, class: item.danger ? 'danger-text' : '',
        onclick: function () { menu.open = false; trigger.focus(); item.run(); } }, item.label);
    })));
    menu.addEventListener('toggle', function () {
      if (menu.open && menu.isConnected) document.querySelectorAll('.action-menu[open]').forEach(function (other) { if (other !== menu) other.open = false; });
    });
    return menu;
  }

  const actionDialog = document.getElementById('action-dialog');
  document.querySelector('.sheet-close').addEventListener('click', function () { actionDialog.close(); });
  actionDialog.addEventListener('click', function (e) {
    const box = actionDialog.getBoundingClientRect();
    if (e.target === actionDialog && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) actionDialog.close();
  });
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.action-menu[open]').forEach(function (menu) { if (!menu.contains(e.target)) menu.open = false; });
  });
  document.addEventListener('pointerdown', function () { delete document.body.dataset.keyboard; });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab') document.body.dataset.keyboard = 'true';
    if (e.key === 'Escape') document.querySelectorAll('.action-menu[open]').forEach(function (menu) { menu.open = false; menu.querySelector('summary').focus(); });
  });
  function openSheet(title, content) {
    document.getElementById('action-title').textContent = title;
    document.getElementById('action-content').replaceChildren(content);
    actionDialog.showModal();
  }

  function renderReview(view) {
    const workouts = data.workouts.filter(function (w) { return w.exercises.some(function (e) { return e.sets.length; }); });
    const completedWithoutSets = data.weeks.flatMap(function (w) { return w.sessions; }).filter(function (session) { return session.completedOn && !workouts.some(function (w) { return w.id === session.workoutId; }); }).length;
    const setCount = workouts.reduce(function (sum, w) { return sum + w.exercises.reduce(function (n, e) { return n + e.sets.length; }, 0); }, 0);
    view.append(h('div', { class: 'review-totals' }, stat('Workouts', String(workouts.length + completedWithoutSets)), stat('Sets logged', String(setCount)), stat('Exercises', String(L.exerciseSummaries(data.workouts).length))));
    const map = h('section', { class: 'activity-map', 'aria-label': 'Training activity over the last four weeks' },
      h('div', { class: 'section-heading' }, h('h2', { text: '4-week activity' }), h('span', { class: 'muted', text: 'Days you trained' })));
    const days = h('div', { class: 'activity-grid' });
    const start = L.shiftDate(L.weekStart(L.todayISO()), -21);
    const completedDates = new Set(data.weeks.flatMap(function (w) { return w.sessions.filter(function (s) { return s.completedOn; }).map(function (s) { return s.completedOn; }); }));
    for (let i = 0; i < 28; i++) {
      const date = L.shiftDate(start, i), entries = workouts.filter(function (w) { return w.date === date; });
      const active = entries.length || completedDates.has(date);
      const label = fmtDate(date) + ': ' + (active ? entries.length ? entries.map(function (w) { return w.label || w.exercises.map(function (e) { return e.name; }).join(', '); }).join('; ') : 'Workout completed' : date > L.todayISO() ? 'Upcoming' : 'No workout');
      days.append(h('span', { class: 'activity-cell' + (active ? ' active' : '') + (date === L.todayISO() ? ' current' : '') + (date > L.todayISO() ? ' future' : ''), role: 'img', 'aria-label': label, title: label },
        h('span', { text: String(Number(date.slice(-2))) })));
    }
    const dayLabels = h('div', { class: 'map-weekdays', 'aria-hidden': 'true' }, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (day) { return h('span', { text: day }); }));
    map.append(dayLabels, days, h('p', { class: 'muted small', text: 'Filled squares mark days with logged sets or a completed workout.' }));
    view.append(map);
    const choices = h('div', { class: 'review-choices', 'aria-label': 'Review categories' });
    [['progress', 'Progress', 'Exercise charts and personal bests'], ['history', 'History', 'Find and edit a past workout'], ['settings', 'Settings', 'Units, backups, and app help']].forEach(function (choice) {
      choices.append(h('button', { type: 'button', class: 'review-choice', 'aria-label': choice[1], onclick: function () { go(choice[0]); } },
        h('span', null, h('strong', { text: choice[1] }), h('span', { class: 'muted', text: choice[2] })), h('span', { 'aria-hidden': 'true', text: '→' })));
    });
    view.insertBefore(choices, map);
  }

  // ---------- data helpers ----------
  function workoutFor(date, create) {
    let w = data.workouts.find(function (x) { return x.id === ui.workoutId && x.date === date; }) ||
      data.workouts.find(function (x) { return x.date === date; });
    if (!w && create) {
      w = { id: L.newId(), date: date, createdAt: Date.now(), exercises: [] };
      data.workouts.push(w);
    }
    return w || null;
  }

  function dropEmptyWorkout(w) {
    if (w && w.exercises.length === 0 && !L.plannedSession(data, w.id)) {
      data.workouts = data.workouts.filter(function (x) { return x !== w; });
    }
  }

  function plateIllustration() {
    const art = s('svg', { viewBox: '0 0 360 220', class: 'plate-art', 'aria-hidden': 'true' });
    art.append(s('path', { d: 'M35 190H325M180 28V204', class: 'art-guide' }));
    art.append(s('path', { d: 'M58 155L295 69', class: 'art-bar' }));
    const group = s('g', { transform: 'rotate(-20 180 110)' });
    group.append(s('ellipse', { cx: 180, cy: 110, rx: 83, ry: 91, class: 'plate-side' }));
    group.append(s('ellipse', { cx: 168, cy: 106, rx: 80, ry: 91, class: 'plate-face' }));
    [66, 53].forEach(function (r) { group.append(s('ellipse', { cx: 168, cy: 106, rx: r, ry: r * 1.13, class: 'plate-ring' })); });
    group.append(s('ellipse', { cx: 168, cy: 106, rx: 17, ry: 20, class: 'plate-hole' }));
    group.append(s('text', { x: 168, y: 64, 'text-anchor': 'middle', class: 'plate-word' }, 'GYM LOG'));
    group.append(s('text', { x: 168, y: 161, 'text-anchor': 'middle', class: 'plate-number' }, '01'));
    art.append(group);
    art.append(s('text', { x: 278, y: 188, class: 'art-caption' }, 'EST. TODAY'));
    return art;
  }

  // ---------- TODAY / WORKOUT ----------
  let focusAfterRender = null; // exercise key whose reps field should get focus

  function renderWorkout(view) {
    const w = workoutFor(ui.date, false);

    const dateInput = h('input', {
      type: 'date', id: 'workout-date', value: ui.date, max: L.todayISO(),
      onchange: function (e) {
        if (L.isISODate(e.target.value) && e.target.value <= L.todayISO()) { ui.date = e.target.value; ui.workoutId = null; render(); }
        else e.target.value = ui.date;
      },
    });
    view.append(h('div', { class: 'date-row' }, h('label', { for: 'workout-date', text: 'Date' }), dateInput));

    const dayWorkouts = data.workouts.filter(function (x) { return x.date === ui.date; });
    if (dayWorkouts.length > 1) {
      view.append(h('div', { class: 'day-workouts', role: 'group', 'aria-label': 'Workouts on this date' },
        dayWorkouts.map(function (x, i) { return h('button', { type: 'button', class: 'btn ghost',
          'aria-pressed': w && w.id === x.id ? 'true' : 'false',
          onclick: function () { ui.workoutId = x.id; render(); } }, x.label || 'Workout ' + (i + 1)); })
      ));
    }
    const link = w && L.plannedSession(data, w.id);
    if (link) {
      view.append(h('section', { class: 'linked-plan', 'aria-label': 'Linked weekly workout' },
        h('strong', { text: link.session.name }),
        completionControl(link.week, link.session),
        h('button', { type: 'button', class: 'back', onclick: function () { ui.week = link.week.start; ui.planSessionId = link.session.id; go('plan'); } }, 'Back to weekly plan')
      ));
    }

    const exercises = w ? w.exercises : [];
    const sets = exercises.reduce(function (n, e) { return n + e.sets.length; }, 0);
    view.append(h('div', { class: 'session-strip', 'aria-label': 'Session summary' },
      h('span', null, h('b', { text: String(exercises.length) }), exercises.length === 1 ? ' exercise' : ' exercises'),
      h('span', null, h('b', { text: String(sets) }), sets === 1 ? ' set saved' : ' sets saved')
    ));
    if (!w || w.exercises.length === 0) {
      view.append(h('div', { class: 'card empty' },
        plateIllustration(),
        h('p', null, h('strong', { text: 'No exercises yet' })),
        h('p', { class: 'muted', text: 'Tap Add exercise to start logging this workout.' })
      ));
    } else {
      w.exercises.forEach(function (ex, i) { view.append(exerciseCard(w, ex, i)); });
    }

    const addButton = h('button', { type: 'button', class: 'btn primary block', id: 'add-exercise', onclick: openAddDialog }, '＋ Add exercise');
    const emptyState = view.querySelector('.empty');
    if (emptyState) view.insertBefore(addButton, emptyState);
    else view.append(addButton);


  }

  function exerciseCard(w, ex, index) {
    const prev = L.previousPerformance(data.workouts, ex.name, w);
    const key = L.keyOf(ex.name);

    const card = h('section', { class: 'exercise-card', 'aria-label': ex.name });
    const knownActive = w.exercises.some(function (e) { return L.keyOf(e.name) === ui.activeExerciseKey; });
    const disclosure = h('details', { class: 'exercise-disclosure', name: 'workout-' + w.id, open: knownActive ? ui.activeExerciseKey === key : index === 0 });
    const last = ex.sets[ex.sets.length - 1];
    disclosure.append(h('summary', { class: 'exercise-summary' },
      h('span', { class: 'exercise-order', text: String(index + 1).padStart(2, '0') }),
      h('span', null, h('strong', { text: ex.name }), h('span', { class: 'exercise-preview', text: ex.sets.length + (ex.sets.length === 1 ? ' set' : ' sets') + (last ? ' · ' + fmtSet(last) : ' · Ready to log') })),
      h('span', { class: 'disclosure-chevron', 'aria-hidden': 'true', text: '⌄' })));
    disclosure.addEventListener('toggle', function () {
      if (!disclosure.open || !disclosure.isConnected) return;
      ui.activeExerciseKey = key;
      document.querySelectorAll('.exercise-disclosure[open]').forEach(function (other) { if (other !== disclosure) other.open = false; });
    });
    const content = h('div', { class: 'exercise-body' });
    const controls = h('div', { class: 'exercise-toolbar' }, actionMenu('Options', [
      { label: 'Manage sets', disabled: !ex.sets.length, run: function () { ui.manageExerciseKey = key; ui.activeExerciseKey = key; render(); } },
      { label: 'Remove exercise', danger: true, run: function () {
        if (!confirm('Remove “' + ex.name + '”' + (ex.sets.length ? ' and its logged sets' : '') + ' from this workout?')) return;
        w.exercises = w.exercises.filter(function (x) { return x !== ex; });
        dropEmptyWorkout(w); save(); render();
      } }
    ], 'Exercise options for ' + ex.name));
    if (ui.manageExerciseKey === key) controls.prepend(h('button', { type: 'button', class: 'back', onclick: function () { ui.manageExerciseKey = null; render(); } }, 'Done managing sets'));
    if (!prev) controls.prepend(h('p', { class: 'first-time-note muted', text: 'First time logging this exercise.' }));
    content.append(controls);

    if (prev) {
      const sug = L.suggestNext(prev.sets, unit());
      const goal = h('div', { class: 'goal' }, h('span', { class: 'goal-k', text: 'Suggested next set: ' }));
      if (sug.moreReps) goal.append(h('mark', { text: fmtSet(sug.moreReps) }));
      if (sug.moreWeight) goal.append(sug.moreReps ? ' or ' : '', h('mark', { text: fmtSet(sug.moreWeight) }));
      if (!sug.moreReps && !sug.moreWeight) goal.append('At the logging limit.');
      content.append(h('div', { class: 'last-time' },
        h('strong', { text: 'Last time · ' + relDate(prev.date) }),
        h('div', { class: 'lt-sets', text: prev.sets.map(fmtSet).join('  ·  ') }),
        goal
      ));
    }

    if (ex.sets.length) {
      const list = h('ol', { class: 'sets' });
      ex.sets.forEach(function (s, i) {
        const ch = L.describeChange(s, prev && prev.sets[i], unit());
        const arrow = ch.status === 'up' ? '▲ ' : ch.status === 'down' ? '▼ ' : '';
        list.append(h('li', null,
          h('span', { class: 'num', text: 'Set ' + (i + 1) }),
          h('span', { class: 'val', text: fmtSet(s) }),
          prev ? h('span', { class: 'badge ' + ch.status, text: arrow + ch.text }) : null,
          ui.manageExerciseKey === key ? h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': 'Delete set ' + (i + 1), text: 'Delete',
            onclick: function () {
              ex.sets.splice(i, 1);
              const saved = save();
              render();
              if (saved) toast('Set deleted');
            },
          }) : null
        ));
      });
      content.append(list);
    }

    // Prefill with the matching set from last time, else the previous set today.
    const n = ex.sets.length;
    const linked = L.plannedSession(data, w.id);
    const planned = linked && linked.session.exercises.find(function (e) { return L.keyOf(e.name) === key; });
    const target = planned && (planned.sets[n] || planned.sets[planned.sets.length - 1]);
    const guess = linked ? ex.sets[n - 1] || target || (prev && prev.sets[n]) || null
      : (prev && prev.sets[n]) || ex.sets[n - 1] || (prev && prev.sets[prev.sets.length - 1]) || null;
    const idBase = 'f-' + w.id + '-' + index;
    const draftKey = w.id + ':' + key + ':' + unit();
    const draft = drafts.get(draftKey);
    function rememberDraft() { drafts.set(draftKey, { w: wIn.value, r: rIn.value }); }
    const wIn = h('input', {
      id: idBase + '-w', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'next',
      placeholder: '0', value: draft ? draft.w : guess && guess.w > 0 ? L.fmtNum(guess.w) : '', oninput: rememberDraft,
    });
    const rIn = h('input', {
      id: idBase + '-r', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
      placeholder: '0', value: draft ? draft.r : guess ? String(guess.r) : '', 'data-reps-for': key, oninput: rememberDraft,
    });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', {
      class: 'set-form', novalidate: true,
      onsubmit: function (e) {
        e.preventDefault();
        const res = L.validateSetInput(wIn.value, rIn.value, unit());
        if (!res.ok) { err.textContent = res.error; return; }
        ex.sets.push(res.set);
        if (!save()) { render(); return; }
        drafts.delete(draftKey);
        render();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        toast('Set ' + ex.sets.length + ' saved: ' + fmtSet(res.set));
      },
    },
      h('div', null, h('label', { for: wIn.id, text: 'Weight (' + unit() + ')' }), wIn),
      h('div', null, h('label', { for: rIn.id, text: 'Repetitions' }), rIn),
      h('button', { type: 'submit', class: 'btn primary', text: 'Save set ' + (n + 1) })
    );
    content.append(form, err, h('p', { class: 'muted small bodyweight-hint', text: 'Bodyweight exercise? Leave weight at 0.' }));
    disclosure.append(content);
    card.append(disclosure);
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
      if (!save()) { render(); return; }
    }
    dlg.close();
    ui.activeExerciseKey = L.keyOf(clean);
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
  dlg.addEventListener('click', function (e) {
    const box = dlg.getBoundingClientRect();
    if (e.target === dlg && (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom)) dlg.close();
  });

  // ---------- FLEXIBLE WEEKLY PLAN ----------
  function currentWeek() {
    return data.weeks.find(function (w) { return w.start === ui.week; }) || L.newWeek(ui.week);
  }

  function commitWeek(week) {
    const index = data.weeks.findIndex(function (w) { return w.start === week.start; });
    if (index < 0) data.weeks.push(week);
    else data.weeks[index] = week;
    return save();
  }

  function completionDate(week, session) {
    const workout = data.workouts.find(function (w) { return w.id === session.workoutId; });
    return session.completedOn || (workout && workout.date) ||
      (L.todayISO() < week.start ? week.start : L.todayISO() > L.shiftDate(week.start, 6) ? L.shiftDate(week.start, 6) : L.todayISO());
  }

  function completionControl(week, session, compact) {
    const box = h('input', {
      type: 'checkbox', checked: !!session.completedOn,
      disabled: week.start > L.todayISO(), 'aria-label': 'Mark ' + session.name + ' complete',
      onchange: function () {
        try {
          L.completePlannedWorkout(data, week, session, box.checked, completionDate(week, session));
          if (commitWeek(week)) toast(box.checked ? 'Workout completed' : 'Completion unchecked. Your logged sets are kept.');
        } catch (err) { toast(err.message); }
        render();
      },
    });
    const wrap = h('div', { class: 'completion-control' },
      h('label', { class: 'completion-label' }, box, h('span', { text: session.completedOn ? 'Done' : 'Mark done' }))
    );
    if (session.completedOn && compact) wrap.append(h('span', { class: 'completion-stamp', text: fmtDate(session.completedOn, { weekday: 'short', day: 'numeric', month: 'short' }) }));
    if (session.completedOn && !compact) {
      const id = 'completed-' + session.id;
      const dateOptions = h('details', { class: 'completion-options' }, h('summary', { text: fmtDate(session.completedOn, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · Change date' }));
      dateOptions.append(h('label', { class: 'completion-date', for: id }, 'Completed on',
        h('input', { id: id, type: 'date', value: session.completedOn, min: week.start,
          max: L.shiftDate(week.start, 6) < L.todayISO() ? L.shiftDate(week.start, 6) : L.todayISO(),
          onchange: function (e) {
            try { L.completePlannedWorkout(data, week, session, true, e.target.value);
              if (ui.workoutId === session.workoutId) ui.date = e.target.value;
              commitWeek(week); }
            catch (err) { toast(err.message); }
            render();
          },
        })
      ));
      wrap.append(dateOptions);
    }
    return wrap;
  }

  function renderPlan(view) {
    const week = currentWeek();
    const end = L.shiftDate(week.start, 6);
    document.getElementById('eyebrow-right').textContent = fmtDate(week.start, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(end, { day: 'numeric', month: 'short' });
    const nav = h('div', { class: 'week-nav', 'aria-label': 'Choose week' },
      h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Previous week', onclick: function () { changeWeek(-7); } }, '←'),
      h('span', { text: fmtDate(week.start, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' }) }),
      h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Next week', onclick: function () { changeWeek(7); } }, '→')
    );
    if (week.start !== L.weekStart(L.todayISO())) view.append(h('button', { type: 'button', class: 'back', onclick: function () { ui.week = L.weekStart(L.todayISO()); ui.planSessionId = null; render(); } }, 'Return to this week'));
    if (ui.planSessionId) {
      const session = week.sessions.find(function (s) { return s.id === ui.planSessionId; });
      if (session) { renderPlanSession(view, week, session); return; }
      ui.planSessionId = null;
    }
    view.append(nav);
    const completed = week.sessions.filter(function (s) { return !!s.completedOn; }).length;
    const summary = h('section', { class: 'week-summary', 'aria-label': 'Weekly goal' },
      h('div', { class: 'week-count' }, h('strong', { text: String(completed) }), h('span', { text: 'of ' + week.goal + ' workouts completed' })),
      h('progress', { max: week.goal, value: Math.min(completed, week.goal), 'aria-label': completed + ' of ' + week.goal + ' workouts completed' }),
      h('p', { class: 'muted', text: 'Monday–Sunday. Any day, any order.' })
    );
    const goalInput = h('input', { type: 'number', id: 'weekly-goal', min: 1, max: 52, value: week.goal, inputmode: 'numeric', required: true });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const goalSettings = h('div', { class: 'goal-settings' });
    goalSettings.append(h('form', { class: 'goal-form', onsubmit: function (e) {
      e.preventDefault();
      const goal = Number(goalInput.value);
      if (!Number.isInteger(goal) || goal < 1 || goal > 52) { error.textContent = 'Choose 1–52 workouts per week.'; return; }
      week.goal = goal;
      while (week.sessions.length < goal) week.sessions.push(L.newSession(week.sessions.length));
      // Keep customized or logged workouts when lowering the goal.
      while (week.sessions.length > goal) {
        const last = week.sessions[week.sessions.length - 1];
        if (last.completedOn || last.workoutId || last.exercises.length || last.notes || last.name !== 'Workout ' + week.sessions.length) break;
        week.sessions.pop();
      }
      if (commitWeek(week)) { actionDialog.close(); toast('Weekly goal saved'); }
      else error.textContent = 'Your goal was not saved. Browser storage is full or blocked.';
      render();
    } }, h('label', { for: 'weekly-goal', text: 'Workouts this week' }), goalInput,
      h('button', { type: 'submit', class: 'btn ghost', text: 'Save goal' })), error);
    view.append(summary);
    const previous = data.weeks.find(function (w) { return w.start === L.shiftDate(week.start, -7); });
    const untouched = week.sessions.every(function (s, i) { return !s.workoutId && !s.completedOn && !s.exercises.length && !s.notes && s.name === 'Workout ' + (i + 1); });
    const weekMenu = actionMenu('Week options', [
      { label: 'Change weekly goal', run: function () { openSheet('Weekly goal', goalSettings); } },
      { label: 'Copy previous week’s plan', disabled: !previous || !untouched, run: function () {
        const copy = L.copyWeek(previous, week.start);
        if (commitWeek(copy)) toast('Copied exercises and targets. Completion starts fresh.');
        render();
      } },
      { label: 'Add another workout', disabled: week.sessions.length >= 100, run: function () { week.sessions.push(L.newSession(week.sessions.length)); commitWeek(week); render(); } }
    ]);
    view.append(h('div', { class: 'plan-section-heading' }, h('div', { class: 'section-heading' }, h('h2', { text: 'Your workouts' }), weekMenu), h('p', { class: 'muted', text: 'Open a workout to plan exercises or record your sets.' })));
    week.sessions.forEach(function (session, i) {
      const card = h('section', { class: 'plan-card' + (session.completedOn ? ' is-complete' : ''), 'aria-label': session.name });
      card.append(h('h2', { text: session.name }), completionControl(week, session, true));
      if (session.exercises.length) card.append(h('p', { class: 'planned-names', text: session.exercises.map(function (e) { return e.name; }).join(' · ') }));
      else card.append(h('p', { class: 'muted', text: 'No exercises planned yet.' }));
      card.append(h('button', { type: 'button', class: 'btn ghost block', onclick: function () { ui.planSessionId = session.id; ui.planExerciseKey = null; ui.planPane = session.exercises.length ? 'log' : 'exercises'; render(); window.scrollTo(0, 0); } }, 'Open ' + session.name));
      view.append(card);
    });

    renderWeekTimeline(view, week);
  }

  function changeWeek(days) {
    ui.week = L.shiftDate(ui.week, days); ui.planSessionId = null; ui.planExerciseKey = null; render();
  }

  function renderWeekTimeline(view, week) {
    const events = L.weekEvents(data, week);
    const timeline = h('section', { class: 'week-timeline', 'aria-label': 'When you trained' }, h('h2', { text: 'When you trained' }));
    const days = h('div', { class: 'week-days' });
    for (let i = 0; i < 7; i++) {
      const date = L.shiftDate(week.start, i), items = events.filter(function (e) { return e.date === date; });
      const done = items.some(function (e) { return e.completed; });
      days.append(h('div', { class: 'week-day' + (date === L.todayISO() ? ' is-today' : '') + (items.length ? ' has-activity' : ''),
        'aria-label': fmtDate(date) + ': ' + (items.length ? items.map(function (e) { return e.name + (e.completed ? ', completed' : ', sets logged'); }).join('; ') : 'No activity') },
        h('span', { class: 'day-name', text: fmtDate(date, { weekday: 'short' }) }),
        h('span', { class: 'day-number', text: String(Number(date.slice(-2))) }),
        h('span', { class: 'day-dot' + (done ? ' done' : ''), 'aria-hidden': 'true', text: done ? '✓' : items.length ? '•' : '–' })
      ));
    }
    timeline.append(days);
    if (!events.length) timeline.append(h('p', { class: 'muted', text: 'Your completed workouts and logged sets will appear here.' }));
    else {
      const list = h('ul', { class: 'activity-list' });
      events.forEach(function (event) {
        const w = data.workouts.find(function (w) { return w.id === event.workoutId; });
        list.append(h('li', null,
          h('span', { class: 'activity-date', text: fmtDate(event.date, { weekday: 'short', day: 'numeric', month: 'short' }) }),
          h('span', null, h('strong', { text: event.name }), h('span', { class: 'activity-status' + (event.completed ? ' completed' : ''), text: event.completed ? '✓ Completed' : 'Sets logged · not checked off' })),
          w ? h('button', { type: 'button', class: 'back', 'aria-label': 'View sets for ' + event.name, onclick: function () { ui.date = w.date; ui.workoutId = w.id; go('workout'); } }, 'View sets') : null
        ));
      });
      const activity = h('details', { class: 'activity-disclosure' }, h('summary', { text: 'Activity details · ' + events.length + (events.length === 1 ? ' entry' : ' entries') }));
      activity.append(list); timeline.append(activity);
    }
    view.append(timeline);
  }

  function renderPlanSession(view, week, session) {
    view.append(h('button', { type: 'button', class: 'back', onclick: function () { ui.planSessionId = null; ui.planExerciseKey = null; render(); } }, '← All weekly workouts'));
    document.getElementById('title').textContent = session.name;
    document.getElementById('page-note').textContent = 'Log your sets or edit this workout’s plan.';
    const header = h('section', { class: 'plan-detail', 'aria-label': 'Plan ' + session.name }, completionControl(week, session));
    const pane = ui.planPane || (session.exercises.length ? 'log' : 'exercises');
    const tasks = h('div', { class: 'task-switch', role: 'group', 'aria-label': 'Workout tasks' });
    [['log', 'Log sets'], ['exercises', 'Edit plan'], ['details', 'Name & notes']].forEach(function (task) { tasks.append(h('button', { type: 'button', 'aria-pressed': pane === task[0] ? 'true' : 'false', onclick: function () { ui.planPane = task[0]; render(); } }, task[1])); });
    header.append(tasks);
    const draftKey = 'plan-name:' + session.id;
    const draft = drafts.get(draftKey);
    const name = h('input', { id: 'session-name', type: 'text', value: draft ? draft.name : session.name, maxlength: 60, required: true });
    const notes = h('textarea', { id: 'session-notes', rows: 3, maxlength: 2000, placeholder: 'Optional notes, exercise order, or reminders' });
    notes.value = draft ? draft.notes : session.notes;
    function keep() { drafts.set(draftKey, { name: name.value, notes: notes.value }); }
    name.addEventListener('input', keep); notes.addEventListener('input', keep);
    const nameSettings = h('section', { class: 'name-settings', hidden: pane !== 'details' }, h('h2', { text: 'Workout details' }));
    nameSettings.append(h('form', { class: 'plan-name-form', onsubmit: function (e) {
      e.preventDefault();
      const clean = L.cleanName(name.value);
      if (!clean) return;
      session.name = clean; session.notes = notes.value;
      const w = data.workouts.find(function (w) { return w.id === session.workoutId; });
      if (w) w.label = clean;
      if (commitWeek(week)) { drafts.delete(draftKey); toast('Workout details saved'); }
      render();
    } }, h('label', { for: name.id, text: 'Workout name' }), name,
      h('label', { for: notes.id, text: 'Notes' }), notes,
      h('button', { type: 'submit', class: 'btn ghost', text: 'Save workout details' })));
    header.append(nameSettings);
    view.append(header);
    const targets = h('section', { class: 'plan-targets', hidden: pane !== 'exercises', 'aria-label': 'Planned exercises' },
      h('h2', { text: 'Planned exercises' }),
      h('p', { class: 'muted', text: 'These are targets. Use the workout log to record actual sets.' })
    );
    session.exercises.forEach(function (exercise) {
      targets.append(h('div', { class: 'planned-exercise' },
        h('div', null, h('strong', { text: exercise.name }), h('p', { text: exercise.sets.length ? exercise.sets.length + ' sets · ' + exercise.sets.map(fmtSet).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' / ') : 'No weight or repetition target yet' })),
        actionMenu('Options', [
          { label: 'Edit target', run: function () { ui.planExerciseKey = L.keyOf(exercise.name); render(); document.getElementById('planned-name').focus(); } },
          { label: 'Remove planned exercise', danger: true, run: function () {
            if (!confirm('Remove ' + exercise.name + ' from this plan? Any logged sets will be kept.')) return;
            session.exercises = session.exercises.filter(function (e) { return e !== exercise; });
            ui.planExerciseKey = null; commitWeek(week); render();
          } }
        ], 'Plan options for ' + exercise.name)
      ));
    });
    const exerciseEditor = h('details', { class: 'plan-form-disclosure', open: !!ui.planExerciseKey }, h('summary', { text: ui.planExerciseKey ? 'Edit exercise target' : 'Add planned exercise' }));
    exerciseEditor.append(plannedExerciseForm(week, session));
    targets.append(exerciseEditor);
    view.append(targets);
    const actual = data.workouts.find(function (w) { return w.id === session.workoutId; });
    const dateDraftKey = 'plan-date:' + session.id;
    const date = h('input', { type: 'date', id: 'planned-log-date', value: actual ? actual.date : drafts.get(dateDraftKey) || completionDate(week, session),
      min: week.start, max: L.shiftDate(week.start, 6) < L.todayISO() ? L.shiftDate(week.start, 6) : L.todayISO(),
      onchange: function () {
        drafts.set(dateDraftKey, date.value);
        if (actual) {
          try {
            L.startPlannedWorkout(data, week, session, date.value);
            if (commitWeek(week)) { ui.date = date.value; drafts.delete(dateDraftKey); toast('Workout date saved'); }
          } catch (err) { toast(err.message); }
          render();
        }
      } });
    const record = h('section', { class: 'plan-record', hidden: pane !== 'log', 'aria-label': 'Actual workout' },
      h('div', { class: 'date-row' }, h('label', { for: date.id, text: 'Workout date' }), date));
    if (actual && pane === 'log') {
      ui.date = actual.date; ui.workoutId = actual.id;
      const count = actual.exercises.reduce(function (sum, exercise) { return sum + exercise.sets.length; }, 0);
      record.append(h('div', { class: 'session-strip' }, h('span', { text: actual.exercises.length + (actual.exercises.length === 1 ? ' exercise' : ' exercises') }), h('span', { text: count + (count === 1 ? ' set saved' : ' sets saved') })));
      actual.exercises.forEach(function (exercise, i) { record.append(exerciseCard(actual, exercise, i)); });
      record.append(h('button', { type: 'button', class: 'btn primary block', onclick: openAddDialog }, '＋ Add exercise'));
    } else if (!actual) {
      record.append(h('p', { class: 'muted', text: 'Choose when you trained, then start recording your sets.' }),
        h('button', { type: 'button', class: 'btn primary block', disabled: week.start > L.todayISO(), onclick: function () {
          try {
            const workout = L.startPlannedWorkout(data, week, session, date.value);
            if (!commitWeek(week)) { render(); return; }
            ui.date = workout.date; ui.workoutId = workout.id; ui.planPane = 'log'; render();
          } catch (err) { toast(err.message); }
        } }, 'Start logging this workout'));
    }
    if (week.start > L.todayISO()) record.append(h('p', { class: 'muted', text: 'You can plan ahead. Logging and completion become available when this week begins.' }));

    view.insertBefore(record, targets);
  }

  function plannedExerciseForm(week, session) {
    const existing = session.exercises.find(function (e) { return L.keyOf(e.name) === ui.planExerciseKey; });
    const key = 'plan-exercise:' + session.id + ':' + (ui.planExerciseKey || 'new') + ':' + unit();
    const draft = drafts.get(key) || {};
    const first = existing && existing.sets[0];
    const name = h('input', { id: 'planned-name', type: 'text', maxlength: 60, value: draft.name != null ? draft.name : existing ? existing.name : '', placeholder: 'e.g. Bench press', required: true });
    const count = h('input', { id: 'planned-count', type: 'number', min: 1, max: 20, value: draft.count != null ? draft.count : existing && existing.sets.length || 3, required: true });
    const weight = h('input', { id: 'planned-weight', type: 'text', inputmode: 'decimal', placeholder: '0', value: draft.weight != null ? draft.weight : first ? L.fmtNum(first.w) : '' });
    const reps = h('input', { id: 'planned-reps', type: 'text', inputmode: 'numeric', placeholder: 'Optional', value: draft.reps != null ? draft.reps : first ? first.r : '' });
    function keep() { drafts.set(key, { name: name.value, count: count.value, weight: weight.value, reps: reps.value }); }
    [name, count, weight, reps].forEach(function (input) { input.addEventListener('input', keep); });
    const error = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'planned-form', onsubmit: function (e) {
      e.preventDefault();
      const clean = L.cleanName(name.value), n = Number(count.value);
      if (!clean) { error.textContent = 'Enter an exercise name.'; return; }
      if (!Number.isInteger(n) || n < 1 || n > 20) { error.textContent = 'Choose 1–20 sets.'; return; }
      if (session.exercises.some(function (ex) { return ex !== existing && L.keyOf(ex.name) === L.keyOf(clean); })) { error.textContent = 'This exercise is already in the plan. Use Edit to change its target.'; return; }
      let sets = [];
      if (reps.value.trim() || weight.value.trim()) {
        const result = L.validateSetInput(weight.value, reps.value, unit());
        if (!result.ok) { error.textContent = result.error; return; }
        sets = Array.from({ length: n }, function () { return { w: result.set.w, r: result.set.r }; });
      }
      if (existing) { existing.name = clean; existing.sets = sets; }
      else session.exercises.push({ name: clean, sets: sets });
      const actual = data.workouts.find(function (w) { return w.id === session.workoutId; });
      if (actual && !L.findExercise(actual, clean)) actual.exercises.push({ name: clean, sets: [] });
      if (commitWeek(week)) { drafts.delete(key); ui.planExerciseKey = null; toast('Planned exercise saved'); }
      render();
    } },
      h('h3', { text: existing ? 'Edit exercise target' : 'Add a planned exercise' }),
      h('div', { class: 'plan-exercise-name' }, h('label', { for: name.id, text: 'Exercise name' }), name),
      h('div', null, h('label', { for: count.id, text: 'Sets' }), count),
      h('div', null, h('label', { for: weight.id, text: 'Target weight (' + unit() + ')' }), weight),
      h('div', null, h('label', { for: reps.id, text: 'Target repetitions' }), reps),
      h('p', { class: 'muted plan-form-help', text: 'Weight and repetitions are optional. Use 0 weight for bodyweight exercises.' }),
      h('button', { type: 'submit', class: 'btn primary', text: existing ? 'Save target' : 'Add to plan' }), error
    );
    if (existing) form.append(h('button', { type: 'button', class: 'btn ghost', onclick: function () { ui.planExerciseKey = null; render(); } }, 'Cancel edit'));
    return form;
  }

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
        h('div', { class: 'big', 'aria-hidden': 'true', text: '—' }),
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
    const W = 340, H = 200, PL = 68, PR = 12, PT = 20, PB = 32;
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
    document.getElementById('page-note').textContent = 'Your best sets and progress for this exercise.';
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
        [['weight', 'Heaviest weight'], ['e1rm', 'Estimated max']].forEach(function (o) {
          seg.append(h('button', {
            type: 'button', 'aria-pressed': chartMode === o[0] ? 'true' : 'false', text: o[1],
            onclick: function () { chartMode = o[0]; render(); },
          }));
        });
        chartCard.append(seg);
      }
      chartCard.append(h('div', { class: 'chart-wrap' }, lineChart(hist.map(function (x) { return { date: x.date, v: metric(x) }; }), label)));
      if (weighted && chartMode === 'e1rm') {
        chartCard.append(h('p', { class: 'muted small', text: 'Estimated one-repetition maximum: the weight you might lift once, calculated from your logged weight and repetitions. This is an estimate, not a tested maximum.' }));
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
        h('div', { class: 'big', 'aria-hidden': 'true', text: '∅' }),
        h('p', null, h('strong', { text: 'No workouts yet' })),
        h('p', { class: 'muted', text: 'Every workout you log will be listed here.' })
      ));
      return;
    }
    view.append(h('p', { class: 'muted small', text: list.length + (list.length === 1 ? ' workout' : ' workouts') + ' · tap one to view or edit it.' }));
    list.forEach(function (w) {
      view.append(h('button', {
        type: 'button', class: 'card list-btn',
        onclick: function () { ui.date = w.date; ui.workoutId = w.id; go('workout'); },
      },
        h('span', null,
          h('span', { class: 'title', text: (w.label ? w.label + ' · ' : '') + relDate(w.date) }),
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
        onclick: function () {
          if (data.unit === o[0]) return;
          data = L.convertUnit(data, o[0]);
          if (save()) { drafts.clear(); toast('Weights converted to ' + o[0]); }
          render();
        },
      }));
    });
    unitCard.append(seg, h('p', { class: 'muted small', text: 'All saved weights convert automatically. Your history stays consistent.' }));
    view.append(unitCard);

    const total = data.workouts.filter(function (w) { return w.exercises.length; }).length;
    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Backup' }),
      h('p', { class: 'muted small', text: 'Your data is stored only on this phone, in this browser. Save a backup file from time to time (to Files / iCloud Drive) so you never lose it.' }),
      h('button', { type: 'button', class: 'btn primary block', id: 'export-btn', onclick: exportData, disabled: total === 0 && data.weeks.length === 0 }, '⬇︎ Save backup file'),
      h('button', { type: 'button', class: 'btn ghost block', onclick: function () { document.getElementById('import-file').click(); } }, '↑ Restore from backup file'),
      h('input', { type: 'file', id: 'import-file', accept: '.json,application/json', style: 'display:none', onchange: importData })
    ));

    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Install on iPhone' }),
      h('p', { class: 'small', text: 'In Safari tap the Share button (□↑), then “Add to Home Screen”. It opens full-screen like an app and works without internet.' })
    ));

    view.append(h('section', { class: 'card' },
      h('h2', { text: 'Delete workouts' }),
      h('button', {
        type: 'button', class: 'btn danger block', disabled: total === 0 && data.weeks.length === 0,
        onclick: function () {
          if (!confirm('Delete all workouts and weekly plans from this device? This cannot be undone.')) return;
          if (!confirm('Are you really sure? Save a backup first if unsure.')) return;
          data = L.emptyData();
          const saved = save();
          if (saved) drafts.clear();
          render();
          if (saved) toast('All data deleted');
        },
      }, 'Delete all data')
    ));
    const sections = Array.from(view.querySelectorAll(':scope > section.card'));
    const groups = [['Units', 'Kilograms or pounds', [sections[0]]], ['Backup & restore', 'Keep a copy of workouts and plans', [sections[1]]], ['Help & reset', 'Install the app or delete device data', [sections[2], sections[3]]]];
    groups.forEach(function (group) {
      const folder = h('details', { class: 'settings-group', name: 'settings-folders', open: ui.settingsGroup === group[0] }, h('summary', null, h('strong', { text: group[0] }), h('span', { class: 'muted', text: group[1] })));
      folder.addEventListener('toggle', function () {
        if (!folder.isConnected) return;
        if (folder.open) { ui.settingsGroup = group[0]; view.querySelectorAll('.settings-group[open]').forEach(function (other) { if (other !== folder) other.open = false; }); }
        else if (ui.settingsGroup === group[0]) ui.settingsGroup = null;
      });
      group[2].forEach(function (section) { folder.append(section); });
      view.append(folder);
    });

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
      if (!confirm('Replace workouts and weekly plans on this device with the backup (' + n + ' workouts, ' + incoming.weeks.length + ' weekly plans)?')) return;
      data = incoming;
      if (save()) { drafts.clear(); toast('Backup restored'); }
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
    if (e.key === STORAGE_KEY || e.key === null) { data = load(); savedJSON = JSON.stringify(data); render(); }
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode unavailable */ });
    });
  }

  render();
})();
