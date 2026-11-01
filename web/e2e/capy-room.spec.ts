import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
test.use({ serviceWorkers: 'block' });
async function open(page: Page) {
  const identity = `room-e2e-${randomUUID()}`;
  await page.addInitScript(id => { localStorage.setItem('picolah.userId', id); localStorage.setItem('picolah.language', 'en'); }, identity);
  await page.goto('/7hk9ho#capybara');
  const room = page.locator('.pc-companion.is-room');
  await expect(room).toHaveAttribute('data-renderer', 'frames'); await expect(room).toHaveAttribute('data-sync', 'saved');
  return { room, headers: { 'X-Picolah-User': identity } };
}

test('sleep and lighting survive a real SQLite save and reload without storing transient games', async ({ page }) => {
  const { room, headers } = await open(page);
  await room.getByRole('button', { name: 'Switch to evening', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'saved');
  await room.getByRole('button', { name: 'Nap time', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'saved');
  expect((await (await page.request.get('/api/capybara/room', { headers })).json()).room).toMatchObject({ evening: true, sleeping: true });
  await page.reload(); await expect(room).toHaveAttribute('data-action', 'rest'); await expect(room).toHaveAttribute('data-night', 'true');
  await room.getByRole('button', { name: 'Turn on daylight', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'saved');
  await page.locator('.pc-room-dock-button.is-play').click(); await page.locator('[data-game-choice="ball"]').click();
  await page.reload(); await expect(room).toHaveAttribute('data-action', 'idle'); await expect(room).toHaveAttribute('data-night', 'false');
});

test('failed room writes show a retry that preserves the latest rapid sleep/wake choice', async ({ page }) => {
  const { room, headers } = await open(page); let fail = true;
  await page.route('**/api/capybara/room', route => route.request().method() === 'PATCH' && fail ? route.fulfill({ status: 503, json: { error: 'offline' } }) : route.continue());
  await room.getByRole('button', { name: 'Nap time', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'error');
  await room.getByRole('button', { name: 'Wake up', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'error');
  fail = false; await room.getByRole('button', { name: 'Room not saved · Retry', exact: true }).click(); await expect(room).toHaveAttribute('data-sync', 'saved');
  expect((await (await page.request.get('/api/capybara/room', { headers })).json()).room.sleeping).toBe(false);
  await page.reload(); await expect(room).toHaveAttribute('data-action', 'idle');
});

test('the room works without WebGL and falls back to the matching original artwork if a sequence fails', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return original.call(this, type as '2d', ...args);
    } as typeof original;
  });
  const { room } = await open(page), canvas = room.locator('.pc-play-canvas');
  await expect(canvas).toHaveAttribute('data-engine', 'canvas2d-sequence'); await expect(canvas).toHaveAttribute('data-animation', 'sequence');
  // Frame assets have a distinct name from the source portrait. Only break the sequence.
  await page.route('**/assets/snack-*.webp', async route => {
    const response = await route.fetch();
    if (Number(response.headers()['content-length'] || (await response.body()).length) > 200000) await route.abort();
    else await route.fulfill({ response });
  });
  await room.getByRole('button', { name: 'Little snack', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-art-state', 'snack'); await expect(canvas).toHaveAttribute('data-animation', 'poster');
  await room.getByRole('button', { name: 'Nap time', exact: true }).click(); await expect(canvas).toHaveAttribute('data-art-state', 'sleep');
});
