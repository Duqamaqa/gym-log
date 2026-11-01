/*
 * Optional browser test (not part of `npm test`, needs Playwright).
 * Usage: start a server on :8080 (npm start), then
 *   PLAYWRIGHT=/path/to/node_modules/playwright node tests/e2e.js
 */
'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');

const URL = process.env.URL || 'http://localhost:8080/';
const SHOTS = path.join(__dirname, '..', 'screenshots');

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

(async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const iphone = Object.assign({}, devices['iPhone 13']);
  delete iphone.defaultBrowserType;
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', function (d) { d.accept(); });

  // 1. Empty state
  await page.goto(URL);
  await page.getByText('No exercises yet').waitFor();
  const addBounds = await page.locator('#add-exercise').boundingBox();
  const navBounds = await page.locator('.tabbar').boundingBox();
  assert.ok(addBounds.y + addBounds.height <= navBounds.y, 'first action is visible above phone navigation');
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '1-empty.png') });

  // Labels stay readable and the first action remains visible on a small phone.
  async function checkReadableUI() {
    const issues = await page.evaluate(function () {
      return Array.from(document.querySelectorAll('.tabbar button, main button, main label, main .small, main .num, main .val, main .badge, #page-note, .eyebrow, .session-strip')).filter(function (el) {
        return el.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(el).fontSize) < 14;
      }).map(function (el) { return el.textContent + ': ' + getComputedStyle(el).fontSize; });
    });
    assert.deepEqual(issues, [], 'functional text is at least 14px');
    assert.ok(await page.evaluate(function () { return document.documentElement.scrollWidth <= innerWidth; }), 'no horizontal scroll');
  }
  await checkReadableUI();
  await page.setViewportSize({ width: 320, height: 568 });
  const smallAdd = await page.locator('#add-exercise').boundingBox();
  const smallNav = await page.locator('.tabbar').boundingBox();
  assert.ok(smallAdd.y + smallAdd.height <= smallNav.y, 'add exercise is visible on a small phone');
  await checkReadableUI();
  await page.setViewportSize({ width: 390, height: 664 });

  // 2. Seed a previous workout (3 days ago) to test the comparison with last time.
  await page.evaluate(function (date) {
    localStorage.setItem('gymlog.v1', JSON.stringify({
      version: 1, unit: 'kg',
      workouts: [{ id: 'old1', date: date, createdAt: 1, exercises: [
        { name: 'Bench press', sets: [{ w: 60, r: 8 }, { w: 60, r: 7 }] },
      ] }],
    }));
  }, isoDaysAgo(3));
  await page.reload();

  // 3. Add exercise via the "recent" chip
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.locator('#add-recent button', { hasText: 'Bench press' }).click();
  const card = page.getByRole('region', { name: 'Bench press' });
  await card.getByText(/Last time/).waitFor();
  assert.match(await card.innerText(), /Suggested next set:\s+60 kg × 9 reps\s+or\s+62\.5 kg × 8/);

  // Prefilled with set 1 from last time
  assert.equal(await card.getByLabel('Weight (kg)').inputValue(), '60');
  assert.equal(await card.getByLabel('Repetitions').inputValue(), '8');

  // 4. Log 62,5 x 8 (comma decimal) -> heavier than last time
  await card.getByLabel('Weight (kg)').fill('62,5');
  await card.getByLabel('Repetitions').fill('8');
  await card.getByRole('button', { name: 'Save set 1' }).click();
  await card.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();
  assert.match(await card.locator('.badge').first().innerText(), /▲ \+2\.5 kg/);

  // 5. Set 2: same weight as last time, fewer reps -> down badge
  await card.getByLabel('Weight (kg)').fill('60');
  await card.getByLabel('Repetitions').fill('6');
  await card.getByRole('button', { name: 'Save set 2' }).click();
  await card.locator('.sets .val', { hasText: '60 kg × 6' }).waitFor();
  assert.match(await card.locator('.badge').nth(1).innerText(), /▼ −1 rep/);

  // 6. Validation: empty reps shows an error, nothing saved
  await card.getByLabel('Repetitions').fill('');
  await card.getByRole('button', { name: 'Save set 3' }).click();
  await card.getByText('Enter reps as a whole number').waitFor();
  assert.equal(await card.locator('.sets li').count(), 2);

  // 7. Typed exercise name containing HTML must be shown as text, never executed
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.fill('#add-name', '<img src=x onerror=alert(1)> Squat');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const unsafeCard = page.getByRole('region', { name: '<img src=x onerror=alert(1)> Squat' });
  await unsafeCard.getByText('First time').waitFor();
  assert.equal(await page.locator('main img').count(), 0, 'no HTML injected');
  await unsafeCard.getByRole('button', { name: 'Remove <img src=x onerror=alert(1)> Squat', exact: true }).click();
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.fill('#add-name', 'Squat');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const sq = page.getByRole('region', { name: 'Squat', exact: true });
  await sq.getByLabel('Weight (kg)').fill('100');
  await sq.getByLabel('Repetitions').fill('5');
  await sq.getByRole('button', { name: 'Save set 1' }).click();
  await sq.locator('.sets .val', { hasText: '100 kg × 5' }).waitFor();
  await checkReadableUI();
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '2-today.png'), fullPage: true });

  // 8. Data survives a reload
  await page.reload();
  await page.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();

  // 9. Progress tab -> list -> detail with chart
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByRole('button', { name: /Bench press/ }).click();
  await page.getByText('Best set ever').waitFor();
  await checkReadableUI();
  assert.equal(await page.locator('.chart-wrap svg circle').count(), 2);
  assert.match(await page.locator('main').innerText(), /All sessions/);
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '3-progress.png'), fullPage: true });
  await page.getByRole('button', { name: 'Estimated max' }).click();
  await page.getByText('Estimated 1-rep max (kg)').first().waitFor();

  // 10. History shows 2 workouts; tapping the older one opens it
  await page.getByRole('button', { name: 'History' }).click();
  await page.locator('main').getByText('2 workouts').waitFor();
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '4-history.png'), fullPage: true });
  await page.locator('main .list-btn').nth(1).click();
  await page.getByRole('heading', { name: 'Workout' }).waitFor();
  assert.equal(await page.locator('#workout-date').inputValue(), isoDaysAgo(3));

  // 11. Settings: convert every saved weight; Today returns to the current date in one tap
  await page.getByRole('button', { name: 'Settings' }).click();
  await checkReadableUI();
  await page.getByRole('button', { name: 'Pounds (lb)' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  assert.equal(await page.locator('#workout-date').inputValue(), isoDaysAgo(0));
  await page.locator('.sets .val', { hasText: '137.79 lb × 8' }).waitFor();

  // 12. Delete a set
  const card2 = page.getByRole('region', { name: 'Bench press' });
  await card2.getByRole('button', { name: 'Delete set 2' }).click();
  assert.equal(await card2.locator('.sets li').count(), 1);

  // 13. Narrow screen (iPhone SE 1st gen) has no horizontal scroll
  await page.setViewportSize({ width: 320, height: 568 });
  const overflow = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
  assert.ok(overflow <= 0, 'no horizontal overflow on 320px, got ' + overflow);

  // Unit changes persist across reloads and convert back without rounding drift.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Kilograms (kg)' }).click();
  await page.reload();
  await page.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();

  // A draft in one exercise survives saving a set in another exercise.
  const draftCard = page.getByRole('region', { name: 'Squat', exact: true });
  await draftCard.getByLabel('Weight (kg)').fill('107.5');
  await draftCard.getByLabel('Repetitions').fill('7');
  await card2.getByRole('button', { name: 'Save set 2' }).click();
  assert.equal(await draftCard.getByLabel('Weight (kg)').inputValue(), '107.5');
  assert.equal(await draftCard.getByLabel('Repetitions').inputValue(), '7');

  // Clearing the date is rejected without leaving an empty control.
  await page.locator('#workout-date').fill('');
  await page.locator('#workout-date').dispatchEvent('change');
  assert.equal(await page.locator('#workout-date').inputValue(), isoDaysAgo(0));

  // Blocked browser storage must never announce success or alter the visible log.
  const countBefore = await card2.locator('.sets li').count();
  await page.evaluate(function () {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
  });
  await card2.getByRole('button', { name: 'Save set 3' }).click();
  await page.getByRole('status').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await card2.locator('.sets li').count(), countBefore);
  await page.evaluate(function () { Storage.prototype.setItem = window.originalSetItem; });

  // Keyboard-accessible restore, export and restore the actual downloaded file.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.evaluate(function () { Object.defineProperty(navigator, 'canShare', { value: function () { return false; }, configurable: true }); });
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.unit, 'kg');
  await page.locator('#import-file').setInputFiles(backupPath);
  await page.getByRole('status').filter({ hasText: 'Backup restored' }).waitFor();

  // Desktop and dark-mode layouts remain within the viewport.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '6-desktop.png'), fullPage: true });
  assert.ok(await page.evaluate(function () { return document.documentElement.scrollWidth <= innerWidth; }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ scale: 'css', style: '#toast { visibility: hidden !important; }', path: path.join(SHOTS, '5-today-dark.png'), fullPage: true });

  // Installed app shell and scripts still load with the network unavailable.
  await page.evaluate(async function () { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await page.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();
  await context.setOffline(false);

  assert.deepEqual(errors, [], 'no JS errors');
  await browser.close();
  console.log('E2E OK — all scenarios passed');
})().catch(function (err) {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
