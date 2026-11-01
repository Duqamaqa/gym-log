# Gym Log

A free, simple workout log for progressive overload. Built for iPhone, and it works in any browser.

- **Today**: add exercises and log each set (weight × reps). Under every exercise it shows what you did **last time** and a **"Beat it"** target.
- **Progress**: for each exercise you see your best set, estimated 1-rep max, and how it changed over time.
- **History**: every past workout, by date.
- **Settings**: kg/lb, save or restore a backup file, delete data.

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
