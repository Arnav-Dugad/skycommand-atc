import { expect, test, type Page } from '@playwright/test';

type Sky = {
  world: { aircraft: { id: string; callsign: string; phase: string; gate?: string; turn?: { stage: string } }[]; score: { departures: number; arrivals: number } };
  advance: (s: number) => void;
  clearSave: () => void;
  renderer: { camera: { focus: (x: number, y: number, z?: number) => void } };
};

const consoleErrors: string[] = [];

async function boot(page: Page) {
  consoleErrors.length = 0;
  page.on('console', (m) => {
    if (m.type() === 'error' && !/api\//.test(m.text()) && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 60_000 });
}

async function dismissIntro(page: Page) {
  const intro = page.getByTestId('how-to-play');
  try {
    await intro.waitFor({ state: 'visible', timeout: 5000 });
    await intro.getByTestId('modal-close').click();
  } catch {
    /* no intro this time */
  }
  await expect(page.getByTestId('top-bar')).toBeVisible();
}

async function advanceUntil(page: Page, callsign: string, phases: string[], maxSeconds = 400) {
  await page.waitForFunction(
    ({ callsign, phases, maxSeconds }) => {
      const g = (globalThis as unknown as { __sky: Sky }).__sky;
      for (let i = 0; i < maxSeconds; i++) {
        const a = g.world.aircraft.find((x) => x.callsign === callsign);
        if (!a || phases.includes(a.phase)) return true;
        g.advance(1);
      }
      return true;
    },
    { callsign, phases, maxSeconds },
  );
  return page.evaluate((cs) => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.find((x) => x.callsign === cs)?.phase ?? 'gone', callsign);
}

async function firstArrival(page: Page) {
  await page.waitForFunction(() => {
    const g = (globalThis as unknown as { __sky: Sky }).__sky;
    for (let i = 0; i < 120; i++) {
      if (g.world.aircraft.some((a) => a.phase === 'holding' || a.phase === 'inbound')) return true;
      g.advance(1);
    }
    return false;
  });
  return page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.find((a) => a.phase === 'holding' || a.phase === 'inbound')!.callsign);
}

async function openBoardRow(page: Page, callsign: string, tab: 'arr' | 'dep') {
  if (await page.getByTestId('btn-board').isVisible().catch(() => false)) await page.getByTestId('btn-board').click();
  await page.getByTestId(`tab-${tab}`).click();
  await page.getByTestId(`board-row-${callsign}`).click();
  await expect(page.getByTestId('aircraft-panel')).toBeVisible();
}

test('main menu loads without errors and menus open', async ({ page }) => {
  await boot(page);
  await expect(page.getByTestId('btn-play')).toBeVisible();
  for (const id of ['hangar', 'missions', 'encyclopedia', 'stats', 'replays', 'settings']) {
    await page.getByTestId(`menu-${id}`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByTestId('modal-close').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  expect(consoleErrors).toEqual([]);
});

test('kids mode: full loop from landing to take-off with one-tap buttons', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.clearSave());
  await page.getByTestId('btn-play').click();
  await page.getByTestId('mode-kids').click();
  // intro guide
  await expect(page.getByTestId('how-to-play')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByTestId('tutorial-next').click();
  await expect(page.getByTestId('how-to-play')).toHaveCount(0);
  await expect(page.getByTestId('top-bar')).toBeVisible();

  const cs = await firstArrival(page);
  await openBoardRow(page, cs, 'arr');
  await page.getByTestId('act-land').click();
  await expect(page.getByTestId('panel-status')).toContainText(/Approach|Final|Sequenced/);
  await page.getByTestId('act-park').click(); // kids: picks the best gate automatically
  expect(await advanceUntil(page, cs, ['parked'])).toBe('parked');
  await page.waitForFunction((c) => {
    const g = (globalThis as unknown as { __sky: Sky }).__sky;
    for (let i = 0; i < 120; i++) {
      const a = g.world.aircraft.find((x) => x.callsign === c);
      if (a?.turn?.stage === 'ready') return true;
      g.advance(1);
    }
    return false;
  }, cs);
  await openBoardRow(page, cs, 'dep');
  await page.getByTestId('act-pushback').click();
  expect(await advanceUntil(page, cs, ['readyTaxi', 'taxiOut'])).toMatch(/readyTaxi|taxiOut/);
  if (await page.getByTestId('act-taxi').isVisible().catch(() => false)) await page.getByTestId('act-taxi').click();
  expect(await advanceUntil(page, cs, ['holdShort'])).toBe('holdShort');
  await page.getByTestId('act-takeoff').click();
  await advanceUntil(page, cs, ['climbOut', 'departed'], 120);
  const deps = await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.score.departures);
  expect(deps).toBeGreaterThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
});

test('casual: assign a gate by tapping the map, then undo', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.clearSave());
  await page.getByTestId('btn-play').click();
  await page.getByTestId('mode-casual').click();
  await dismissIntro(page);
  const cs = await firstArrival(page);
  await openBoardRow(page, cs, 'arr');
  await page.getByTestId('act-park').click();
  await expect(page.getByTestId('pick-banner')).toBeVisible();
  // tap the stand of gate A2 (N2) on the canvas
  const pt = await page.evaluate(() => {
    const g = (globalThis as unknown as { __sky: Sky & { renderer: { camera: { defaultView: () => void; update: (d: number, i: boolean) => void }; worldToScreen: (x: number, y: number) => { x: number; y: number } } } }).__sky;
    g.renderer.camera.defaultView();
    g.renderer.camera.update(0.016, true);
    return g.renderer.worldToScreen(1010, 900);
  });
  const box = await page.getByTestId('game-canvas').boundingBox();
  await page.mouse.click(box!.x + pt.x, box!.y + pt.y);
  await expect.poll(() => page.evaluate((c) => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.find((a) => a.callsign === c)?.gate ?? null, cs)).toBe('N2');
  await expect(page.getByTestId('btn-undo')).toBeVisible();
  await page.getByTestId('btn-undo').click();
  await expect.poll(() => page.evaluate((c) => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.find((a) => a.callsign === c)?.gate ?? null, cs)).toBe(null);
  expect(consoleErrors).toEqual([]);
});

test('save and resume restores the session', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.clearSave());
  await page.getByTestId('btn-play').click();
  await page.getByTestId('mode-casual').click();
  await dismissIntro(page);
  await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.advance(60));
  const before = await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.map((a) => a.callsign).sort().join(','));
  await page.getByTestId('btn-menu').click();
  await page.getByTestId('btn-quit').click();
  await expect(page.getByTestId('btn-continue')).toBeVisible();
  await page.reload();
  await page.getByTestId('btn-continue').click();
  await expect(page.getByTestId('top-bar')).toBeVisible();
  const after = await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.map((a) => a.callsign).sort().join(','));
  expect(after).toBe(before);
});

test('sandbox: spawn aircraft and change weather', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.clearSave());
  await page.getByTestId('btn-play').click();
  await page.getByTestId('mode-sandbox').click();
  await dismissIntro(page);
  await expect(page.getByTestId('sandbox-panel')).toBeVisible();
  const n0 = await page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.length);
  await page.getByTestId('spawn-a380').click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __sky: Sky }).__sky.world.aircraft.length)).toBe(n0 + 1);
  await page.getByText('Sky', { exact: true }).click();
  await page.getByTestId('weather-storm').click();
  await expect.poll(() => page.evaluate(() => (globalThis as unknown as { __sky: { world: { weather: string } } }).__sky.world.weather)).toBe('storm');
});

test('layout never overflows horizontally', async ({ page }) => {
  await boot(page);
  const check = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth);
  expect(await check()).toBe(true);
  await page.getByTestId('btn-play').click();
  expect(await check()).toBe(true);
  await page.getByTestId('mode-casual').click();
  await dismissIntro(page);
  const cs = await firstArrival(page);
  await openBoardRow(page, cs, 'arr');
  expect(await check()).toBe(true);
  const vp = page.viewportSize()!;
  // wait for the slide-in animation to settle, then the panel must be fully on screen
  await expect
    .poll(async () => {
      const b = await page.getByTestId('aircraft-panel').boundingBox();
      return !!b && b.x >= 0 && b.x + b.width <= vp.width + 1 && b.y + b.height <= vp.height + 1;
    }, { timeout: 20_000 })
    .toBe(true);
});
