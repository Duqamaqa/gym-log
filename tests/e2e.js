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
  await page.screenshot({ path: path.join(SHOTS, '1-empty.png') });

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
  assert.match(await card.innerText(), /Beat it: 60 kg × 9\s+or\s+62\.5 kg × 8/);

  // Prefilled with set 1 from last time
  assert.equal(await card.getByLabel('Weight (kg)').inputValue(), '60');
  assert.equal(await card.getByLabel('Reps').inputValue(), '8');

  // 4. Log 62,5 x 8 (comma decimal) -> heavier than last time
  await card.getByLabel('Weight (kg)').fill('62,5');
  await card.getByLabel('Reps').fill('8');
  await card.getByRole('button', { name: '＋ Set 1' }).click();
  await card.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();
  assert.match(await card.locator('.badge').first().innerText(), /▲ \+2\.5 kg/);

  // 5. Set 2: same weight as last time, fewer reps -> down badge
  await card.getByLabel('Weight (kg)').fill('60');
  await card.getByLabel('Reps').fill('6');
  await card.getByRole('button', { name: '＋ Set 2' }).click();
  await card.locator('.sets .val', { hasText: '60 kg × 6' }).waitFor();
  assert.match(await card.locator('.badge').nth(1).innerText(), /▼ −1 rep/);

  // 6. Validation: empty reps shows an error, nothing saved
  await card.getByLabel('Reps').fill('');
  await card.getByRole('button', { name: '＋ Set 3' }).click();
  await card.getByText('Enter reps as a whole number').waitFor();
  assert.equal(await card.locator('.sets li').count(), 2);

  // 7. Typed exercise name containing HTML must be shown as text, never executed
  await page.getByRole('button', { name: '＋ Add exercise' }).click();
  await page.fill('#add-name', '<img src=x onerror=alert(1)> Squat');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const sq = page.getByRole('region', { name: '<img src=x onerror=alert(1)> Squat' });
  await sq.getByText('First time').waitFor();
  assert.equal(await page.locator('main img').count(), 0, 'no HTML injected');
  await sq.getByLabel('Weight (kg)').fill('100');
  await sq.getByLabel('Reps').fill('5');
  await sq.getByRole('button', { name: '＋ Set 1' }).click();
  await sq.locator('.sets .val', { hasText: '100 kg × 5' }).waitFor();
  await page.screenshot({ path: path.join(SHOTS, '2-today.png'), fullPage: true });

  // 8. Data survives a reload
  await page.reload();
  await page.locator('.sets .val', { hasText: '62.5 kg × 8' }).waitFor();

  // 9. Progress tab -> list -> detail with chart
  await page.getByRole('button', { name: 'Progress' }).click();
  await page.getByRole('button', { name: /Bench press/ }).click();
  await page.getByText('Best set ever').waitFor();
  assert.equal(await page.locator('.chart-wrap svg circle').count(), 2);
  assert.match(await page.locator('main').innerText(), /All sessions/);
  await page.screenshot({ path: path.join(SHOTS, '3-progress.png'), fullPage: true });
  await page.getByRole('button', { name: 'Strength (1RM)' }).click();
  await page.getByText('Estimated 1-rep max (kg)').first().waitFor();

  // 10. History shows 2 workouts; tapping the older one opens it
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByText('2 workouts').waitFor();
  await page.screenshot({ path: path.join(SHOTS, '4-history.png'), fullPage: true });
  await page.locator('main .list-btn').nth(1).click();
  await page.getByRole('heading', { name: 'Workout' }).waitFor();
  assert.equal(await page.locator('#workout-date').inputValue(), isoDaysAgo(3));

  // 11. Settings: switch unit to lb; "Today" tab tapped twice jumps back to today
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Pounds (lb)' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Today' }).click();
  await page.locator('.sets .val', { hasText: '62.5 lb × 8' }).waitFor();

  // 12. Delete a set
  const card2 = page.getByRole('region', { name: 'Bench press' });
  await card2.getByRole('button', { name: 'Delete set 2' }).click();
  assert.equal(await card2.locator('.sets li').count(), 1);

  // 13. Narrow screen (iPhone SE 1st gen) has no horizontal scroll
  await page.setViewportSize({ width: 320, height: 568 });
  const overflow = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; });
  assert.ok(overflow <= 0, 'no horizontal overflow on 320px, got ' + overflow);

  assert.deepEqual(errors, [], 'no JS errors');
  await browser.close();
  console.log('E2E OK — all scenarios passed');
})().catch(function (err) {
  console.error('E2E FAILED:', err);
  process.exit(1);
});
