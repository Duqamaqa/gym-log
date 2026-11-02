'use strict';
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const URL = process.env.URL || 'http://localhost:8080/';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', 'screenshots');

(async () => {
  const browser = await chromium.launch();
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);
    assert.deepEqual(await page.locator('.tabbar button').allTextContents(), ['Train', 'Weekly plan', 'Review']);
    assert.equal(await page.locator('.mode-switch').count(), 0, 'no duplicate primary navigation');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    assert.ok((await page.locator('.skip-link').boundingBox()).y >= 0, 'keyboard skip link is visible');
    await page.evaluate(() => {
      const data = GymLogic.emptyData();
      data.workouts.push({ id: 'logged', date: GymLogic.todayISO(), createdAt: 1, exercises: [
        { name: 'Bench press', sets: [{ w: 60, r: 8 }, { w: 60, r: 8 }] },
        { name: 'Squat', sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] },
        { name: 'Row', sets: [{ w: 40, r: 10 }, { w: 40, r: 10 }] },
      ] });
      const week = GymLogic.newWeek(GymLogic.todayISO());
      week.sessions[0].completedOn = GymLogic.todayISO();
      data.weeks.push(week);
      localStorage.setItem('gymlog.v1', JSON.stringify(data));
    });
    await page.reload();
    assert.equal(await page.locator('.exercise-disclosure[open]').count(), 1);
    assert.equal(await page.locator('.set-form:visible').count(), 1, 'one logging form at a time');
    assert.equal(await page.getByRole('button', { name: /^Delete set/ }).count(), 0, 'destructive set controls are hidden by default');
    const first = page.getByRole('region', { name: 'Bench press', exact: true });
    const options = first.locator('.action-menu > summary');
    await options.focus();
    await page.keyboard.press('Enter');
    assert.equal(await first.locator('.action-menu[open]').count(), 1);
    assert.deepEqual(await first.locator('.action-menu-items button').allTextContents(), ['Manage sets', 'Remove exercise']);
    await page.keyboard.press('Escape');
    assert.equal(await first.locator('.action-menu[open]').count(), 0);
    assert.ok(await options.evaluate(el => el === document.activeElement));
    await options.click();
    await first.getByRole('button', { name: 'Manage sets', exact: true }).click();
    assert.equal(await first.getByRole('button', { name: /^Delete set/ }).count(), 2);
    await first.getByRole('button', { name: 'Delete set 2', exact: true }).click();
    assert.equal(await first.locator('.sets li').count(), 1);
    await first.getByRole('button', { name: 'Done managing sets', exact: true }).click();
    await page.screenshot({ path: path.join(SHOTS, '10-compact-train.png'), fullPage: true, style: '#toast {visibility:hidden}' });
    const squat = page.getByRole('region', { name: 'Squat', exact: true });
    await squat.locator('.exercise-summary').click();
    assert.equal(await page.locator('.exercise-disclosure[open]').count(), 1);
    await squat.getByLabel('Weight (kg)').fill('105');
    await first.locator('.exercise-summary').click();
    await squat.locator('.exercise-summary').click();
    assert.equal(await squat.getByLabel('Weight (kg)').inputValue(), '105', 'collapsing another exercise keeps drafts');

    await page.getByRole('button', { name: 'Review', exact: true }).click();
    assert.equal(await page.locator('.review-choice').count(), 3);
    assert.deepEqual(await page.locator('.review-choice').evaluateAll(items => items.map(el => el.getAttribute('aria-label'))), ['Progress', 'History', 'Settings']);
    assert.equal(await page.locator('.activity-cell').count(), 28);
    assert.equal(await page.locator('.activity-cell.active').count(), 1);
    assert.equal(await page.locator('.review-totals .stat .v').first().innerText(), '2', 'checked workouts without sets are counted without double-counting logs');
    await page.screenshot({ path: path.join(SHOTS, '11-review.png'), fullPage: true, style: '#toast {visibility:hidden}' });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    assert.equal(await page.locator('.settings-group').count(), 3);
    assert.equal(await page.locator('.settings-group[open]').count(), 0);
    await page.getByText('Units', { exact: true }).click();
    assert.ok(await page.getByRole('button', { name: 'Pounds (lb)', exact: true }).isVisible());
    await page.getByText('Backup & restore', { exact: true }).click();
    assert.equal(await page.locator('.settings-group[open]').count(), 1, 'one settings folder at a time');
    assert.ok(!await page.getByRole('button', { name: 'Pounds (lb)', exact: true }).isVisible());
    assert.ok(await page.locator('#export-btn').isVisible());

    await page.getByRole('button', { name: 'Weekly plan', exact: true }).click();
    await page.getByText('Week options', { exact: true }).click();
    assert.equal(await page.locator('.action-menu[open] button').count(), 3);
    await page.getByRole('button', { name: 'Change weekly goal', exact: true }).click();
    assert.ok(await page.locator('#action-dialog').isVisible());
    await page.keyboard.press('Escape');
    assert.ok(!await page.locator('#action-dialog').isVisible());
    assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Week options', 'dialog returns focus to its group');
    await page.getByRole('button', { name: 'Open Workout 1', exact: true }).click();
    assert.equal(await page.locator('.task-switch button').count(), 3);
    assert.deepEqual(await page.locator('.task-switch button').allTextContents(), ['Log sets', 'Edit plan', 'Name & notes']);
    assert.ok(await page.getByRole('region', { name: 'Planned exercises', exact: true }).isVisible());
    assert.ok(!await page.getByRole('region', { name: 'Actual workout', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Log sets', exact: true }).click();
    assert.ok(await page.getByRole('region', { name: 'Actual workout', exact: true }).isVisible());
    assert.ok(!await page.getByRole('region', { name: 'Planned exercises', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Name & notes', exact: true }).click();
    assert.ok(await page.getByLabel('Workout name', { exact: true }).isVisible());
    assert.ok(!await page.getByRole('region', { name: 'Actual workout', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click();
    await page.getByText('Add planned exercise', { exact: true }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'review fits ' + width + 'px');
      const tooSmall = await page.locator('main button:visible, main label:visible, main summary:visible, .tabbar button').evaluateAll(els => els.filter(el => parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.textContent));
      assert.deepEqual(tooSmall, [], 'functional text is at least 14px');
    }
    await page.screenshot({ path: path.join(SHOTS, '12-review-desktop.png'), fullPage: true, style: '#toast {visibility:hidden}' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.screenshot({ path: path.join(SHOTS, '13-review-dark.png'), fullPage: true, style: '#toast {visibility:hidden}' });
    assert.deepEqual(errors, []);
    console.log('Compact UX checks passed: 3 main destinations, contextual actions, one active exercise/task/settings group, keyboard menus, dialog focus, readable responsive layout, draft preservation and activity visuals.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
