# Gym Log

A free, simple workout log for progressive overload. Built for iPhone, and it works in any browser.

- **Today**: add exercises and log each set (weight × reps). Under every exercise it shows what you did **last time** and a **suggested next set**.
- **Progress**: for each exercise you see your best set, estimated 1-rep max, and how it changed over time.
- **History**: every past workout, by date.
- **Settings**: kg/lb with automatic conversion of saved weights, save or restore a backup file, delete data.

There are no accounts, no ads, no subscriptions and no server. Your data stays on your phone (in the browser's localStorage).

## Where is my data stored?

**Only on your phone**, inside Safari's storage for this website (localStorage). The website host (Cloudflare) and GitHub only serve the app files; they never receive your workouts. Nobody else can see them.

- Deleting Safari website data, or "Offload/Delete" of the Home Screen app, deletes the log. Use **Settings → Save backup file** regularly.
- The Home Screen app and the Safari tab can have separate storage on iPhone, so pick one (the Home Screen icon is recommended) and stick with it.
- To move to a new phone: save a backup file, then open the app on the new phone and use **Restore from backup file**.

## Put it on your iPhone (free)

The app is just static files, so any free static host works. The easiest is GitHub Pages:

1. Make a free GitHub account, create a **public** repository (e.g. `gym-log`) and upload every file in this folder.
2. In the repository go to **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. After about a minute, open `https://<your-username>.github.io/gym-log/` in **Safari** on your iPhone.
4. Tap **Share (□↑) → Add to Home Screen**. It now opens full-screen like an app and works offline.

Other free options: Netlify Drop (drag the folder onto https://app.netlify.com/drop) or Cloudflare Pages.

> Important: iPhone keeps the data for that web address. Always open the app from the same Home Screen icon. Use **Settings → Save backup file** now and then (save it to Files / iCloud Drive).

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Tests

```bash
npm test                                   # unit tests for logic.js (Node built-in test runner)
PLAYWRIGHT=/path/to/node_modules/playwright node tests/e2e.js   # browser test, needs a local server on :8080
```

## Files

- `index.html`, `styles.css`, `app.js`: the UI
- `logic.js`: pure logic (last-time lookup, targets, 1RM, data validation)
- `sw.js`, `manifest.webmanifest`, `icons/`: offline support and "Add to Home Screen"
- `tools/make-icons.js`: regenerates the icons

## Visual direction

An editorial training journal: warm paper, oxblood accents, serif headlines,
numbered exercises, quiet session totals, and an original inline SVG weight plate.
Desktop uses margin navigation and a journal note; phones use bottom navigation.
Light and dark themes follow the device. All artwork and fonts work offline.

Progress targets are simple optional increments, not personalized training advice.
Changing units converts all saved weights, retaining full precision in backups.
Unsubmitted set drafts survive navigation during the current session; they are not
saved across a reload. If browser storage fails, the app keeps the last saved log
and reports the failure instead of claiming the change was saved.

The interface uses plain instructions and readable control labels. Workout values
include units and repetitions, set actions are labeled Save/Delete, and controls
use at least 44px height for primary touch controls. Functional UI text is at least 14px; smaller lettering
is confined to decorative artwork. Weight, repetitions, and Save share one compact row on phones.

## Flexible weekly plans

Use **Weekly plan** in the three-item main navigation. Weeks run
Monday–Sunday. Choose a weekly goal (four workouts by default), name each workout,
and use **Edit plan** to add optional set/weight/repetition targets. Workouts
have no assigned weekday or order. You can copy the previous week's plan.

Open a workout and choose **Log sets** to record actual sets directly in that workout.
Use **Start logging this workout** once for a new session.
Targets prefill the form but never count as performed sets. Tick **Mark as
completed** after training; change the completion date if you trained earlier in
that week. Unchecking a workout keeps its logged sets. Multiple workouts on the
same date remain separate in History and the daily workout selector.

The weekly activity strip and dated activity list show completed workouts and
logged sets. Plans are stored on this device alongside the existing workout log
and included in backups. Version 1 backups migrate to version 2 without removing
existing workouts. New backups include weekly plans; older app versions cannot
read the new backup format.

Browser checks for the planner use the same local server and Playwright setup:
`PLAYWRIGHT=/path/to/node_modules/playwright node tests/planner-e2e.js`.

## Compact navigation (v1.2)

- **Train**: open one exercise at a time, enter weight/repetitions, save the set.
  **Options** groups **Manage sets** and **Remove exercise**. Delete controls appear
  only while managing sets. Collapsed exercises retain their drafts and summaries.
- **Weekly plan**: the weekly goal and activity strip stay visible. **Week options**
  groups changing the goal, copying last week, and adding a workout. Inside a
  workout, **Log sets / Edit plan / Name & notes** shows one focused task at a time.
- **Review**: a four-week activity map, totals, then three destinations:
  **Progress / History / Settings**. Settings has **Units / Backup & restore /
  Help & reset**, with one folder open at a time.

This uses progressive disclosure and task-based grouping, keeping frequent
logging actions visible and less frequent editing behind named groups. Guidance:
[Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/)
and [GitLab Pajamas](https://design.gitlab.com/patterns/progressive-disclosure/).
The grouping is a heuristic based on the user's difficulty discovering the plan,
not a claim of usability research with a participant sample. Menus and dialogs
support keyboard use, Escape, and focus return. Workout storage and the backup
schema are unchanged.

Additional browser checks: `PLAYWRIGHT=/path/to/node_modules/playwright node
tests/compact-e2e.js`. They verify the new hierarchy, absence of default destructive
controls, independent task panes, draft retention, responsive layouts, and keyboard
behavior. The existing workout and planner suites still exercise the full flows.

## Smaller controls (v1.2.1)

Action buttons use their natural width rather than filling the page. The brand
header, bottom navigation, exercise rows, workout cards, and activity summaries
have tighter spacing. Primary touch controls keep a 44px minimum height on touch
screens; labels remain at least 14px and inputs at least 16px to stay readable.
