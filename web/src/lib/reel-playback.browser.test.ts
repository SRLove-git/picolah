import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, expect, type Page } from '@playwright/test';
import { REELS, type ReelEventInput, type ReelFeedItem } from '../../shared/reels.ts';
import { mockGetConfig } from './mock-backend.ts';

// Run against a development Vite server, where React StrictMode is enabled:
// REELS_TEST_URL=http://127.0.0.1:5173 pnpm exec tsx --test src/lib/reel-playback.browser.test.ts
const baseURL = process.env.REELS_TEST_URL;

async function fixture(page: Page) {
  const events: ReelEventInput[] = [];
  const timeline: string[] = [];
  const gates = new Map<string, { wait: Promise<void>; received: () => void }>();
  let failAction = false;
  let failFeed = false;
  let reverse = false;
  let items: ReelFeedItem[] = REELS.map((item) => ({ ...item, liked: false, saved: false, following: false,
    reason: { code: 'explore', labelZh: '探索新兴趣', labelEn: 'Explore something new' } }));
  const config = await mockGetConfig();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/reels/events') {
      const event = request.postDataJSON() as ReelEventInput;
      events.push(event);
      const gateKey = event.type === 'watch' && event.ended ? 'final-watch' : event.type;
      const gate = gates.get(gateKey);
      if (gate) { gates.delete(gateKey); gate.received(); await gate.wait; }
      if (failAction && !['watch', 'view'].includes(event.type)) return route.fulfill({ status: 503 });
      if (event.type === 'not_interested') items = items.filter((item) => item.id !== event.reelId);
      items = items.map((item) => item.id === event.reelId ? { ...item,
        likes: item.likes + (event.type === 'like' && !item.liked ? 1 : event.type === 'unlike' && item.liked ? -1 : 0),
        liked: event.type === 'like' ? true : event.type === 'unlike' ? false : item.liked,
        saved: event.type === 'save' ? true : event.type === 'unsave' ? false : item.saved,
      } : item);
      timeline.push(`stored:${gateKey}`);
      return route.fulfill({ status: 204 });
    }
    if (url.pathname === '/api/reels') {
      timeline.push('feed');
      if (failFeed) return route.fulfill({ status: 503 });
      const excluded = (url.searchParams.get('exclude') ?? '').split(',');
      const available = items.filter((item) => !excluded.includes(item.id));
      return route.fulfill({ json: { items: reverse ? available.reverse() : available, personalized: true, algorithmVersion: 'test' } });
    }
    const body = url.pathname === '/api/auth/me' ? { user: null, required: false }
      : url.pathname === '/api/config' ? config
        : url.pathname === '/api/conversations' ? { conversations: [] }
          : { items: [], alerts: [], unread: 0 };
    return route.fulfill({ json: body });
  });
  return { events, timeline, setFailAction: (value: boolean) => { failAction = value; },
    firstLikes: (likes: number, liked: boolean) => { items[0] = { ...items[0], likes, liked }; },
    firstDuration: (durationMs: number) => { items[0] = { ...items[0], durationMs }; },
    hold: (type: string) => {
      let release!: () => void;
      let received!: () => void;
      const arrived = new Promise<void>((resolve) => { received = resolve; });
      const wait = new Promise<void>((resolve) => { release = resolve; });
      gates.set(type, { wait, received });
      return { arrived, release };
    },
    setFailFeed: (value: boolean) => { failFeed = value; }, setReverse: () => { reverse = true; } };
}

test('StrictMode tracks one view; paused/hidden time is excluded and leave closes the session', { skip: !baseURL }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const { events } = await fixture(page);
    await page.goto(`${baseURL}/#reels`);
    await page.locator('.pc-reel').waitFor();
    await page.waitForTimeout(700);
    assert.equal(events.filter((event) => event.type === 'view').length, 1);
    const firstSession = events.find((event) => event.type === 'view')!.sessionId;
    await page.locator('.pc-reels-head-actions button').first().click();
    await page.waitForTimeout(150);
    const paused = events.filter((event) => event.type === 'watch' && event.sessionId === firstSession).at(-1)!;
    assert.ok(paused.watchMs! > 400 && paused.watchMs! < 16_250, `Paused duration: ${paused.watchMs}`);
    assert.equal(paused.ended, false);
    await page.waitForTimeout(700);
    await page.locator('.pc-reels-head-actions button').first().click();
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
    const hidden = events.filter((event) => event.type === 'watch' && event.sessionId === firstSession).at(-1)!;
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    await page.locator('.pc-reels-next').click();
    await page.waitForTimeout(200);
    const last = events.filter((event) => event.type === 'watch' && event.sessionId === firstSession).at(-1)!;
    assert.equal(last.ended, true);
    assert.ok(last.watchMs! - hidden.watchMs! < 650, 'hidden interval must not count');
    assert.ok(last.watchMs! - paused.watchMs! < 1_650, 'pause and hidden intervals must be excluded');
    assert.equal(events.filter((event) => event.type === 'view' && event.sessionId === firstSession).length, 1);
    assert.equal(events.filter((event) => event.type === 'view').length, 2);
    assert.ok(events.filter((event) => event.type === 'watch').every((event) => event.watchMs! <= 16_250));
  } finally { await browser.close(); }
});

test('server aggregate likes are displayed once and change only after confirmed toggles', { skip: !baseURL }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const control = await fixture(page);
    control.firstLikes(8, true);
    await page.goto(`${baseURL}/#reels`);
    const like = page.getByRole('button', { name: '喜欢', exact: true });
    await expect(like.locator('small')).toHaveText('8');
    const gate = control.hold('unlike');
    await like.click();
    await gate.arrived;
    await expect(like.locator('small')).toHaveText('8');
    gate.release();
    await expect(like.locator('small')).toHaveText('7');
    await expect(like).toHaveAttribute('aria-pressed', 'false');
    await like.click();
    await expect(like.locator('small')).toHaveText('8');
    await expect(like).toHaveAttribute('aria-pressed', 'true');
  } finally { await browser.close(); }
});

for (const completion of [false, true]) {
  test(`${completion ? 'completion' : 'skip'} re-ranks after final watch persistence without moving the active Reel`, { skip: !baseURL }, async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
      const page = await browser.newPage();
      const control = await fixture(page);
      if (completion) control.firstDuration(600);
      const gate = control.hold('final-watch');
      await page.goto(`${baseURL}/#reels`);
      await page.locator('.pc-reel').waitFor();
      if (!completion) await page.locator('.pc-reels-next').click();
      await gate.arrived;
      await expect(page.locator('.pc-reel')).toHaveAttribute('data-reel-id', REELS[1].id);
      await page.waitForTimeout(100);
      control.setReverse();
      gate.release();
      await expect.poll(() => {
        const stored = control.timeline.indexOf('stored:final-watch');
        return stored >= 0 && control.timeline.slice(stored + 1).includes('feed');
      }).toBe(true);
      await expect(page.locator('.pc-reel')).toHaveAttribute('data-reel-id', REELS[1].id);
      await page.locator('.pc-reels-next').click();
      await expect(page.locator('.pc-reel')).toHaveAttribute('data-reel-id', REELS.at(-1)!.id);
    } finally { await browser.close(); }
  });
}

test('delayed not-interested response removes the old card without moving or restarting the active one', { skip: !baseURL }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const control = await fixture(page);
    const gate = control.hold('not_interested');
    await page.goto(`${baseURL}/#reels`);
    await page.getByRole('button', { name: '不感兴趣', exact: true }).click();
    await gate.arrived;
    await page.locator('.pc-reels-next').click();
    await expect(page.locator('.pc-reel')).toHaveAttribute('data-reel-id', REELS[1].id);
    await expect.poll(() => control.events.filter((event) => event.type === 'view' && event.reelId === REELS[1].id).length).toBe(1);
    const currentSession = control.events.find((event) => event.type === 'view' && event.reelId === REELS[1].id)!.sessionId;
    gate.release();
    await expect(page.getByRole('button', { name: '不感兴趣', exact: true })).toBeEnabled();
    await page.waitForTimeout(150);
    await expect(page.locator('.pc-reel')).toHaveAttribute('data-reel-id', REELS[1].id);
    assert.equal(control.events.filter((event) => event.type === 'view' && event.reelId === REELS[1].id).length, 1);
    assert.equal(control.events.filter((event) => event.sessionId === currentSession && event.type === 'watch' && event.ended).length, 0);
  } finally { await browser.close(); }
});

test('feedback failure retries safely, reranking keeps active stable, all hidden yields empty', { skip: !baseURL }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const control = await fixture(page);
    control.setFailFeed(true);
    await page.goto(`${baseURL}/#reels`);
    await page.getByText('推荐加载失败').waitFor();
    assert.equal(await page.locator('.pc-reel').count(), 0, 'no silent demo fallback');
    control.setFailFeed(false);
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.locator('.pc-reel').waitFor();
    const active = await page.locator('.pc-reel').getAttribute('data-reel-id');
    control.setFailAction(true);
    await page.getByRole('button', { name: '喜欢', exact: true }).click();
    await page.getByText('互动尚未保存，请重试').waitFor();
    assert.equal(await page.getByRole('button', { name: '喜欢', exact: true }).getAttribute('aria-pressed'), 'false');
    control.setFailAction(false);
    control.setReverse();
    await page.getByRole('button', { name: '重试', exact: true }).click();
    await page.waitForTimeout(250);
    assert.equal(await page.getByRole('button', { name: '喜欢', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.pc-reel').getAttribute('data-reel-id'), active);
    const likes = control.events.filter((event) => event.type === 'like');
    assert.equal(likes.length, 2);
    assert.equal(likes[0].eventId, likes[1].eventId, 'exact retries retain the event ID');
    await page.getByRole('button', { name: '评论', exact: true }).click();
    assert.ok(control.events.every((event) => String(event.type) !== 'comment'));
    for (let i = 0; i < REELS.length; i++) {
      await page.getByRole('button', { name: '不感兴趣', exact: true }).click();
      await page.waitForTimeout(120);
    }
    await page.getByText('暂时没有可推荐的短片').waitFor();
    assert.equal(await page.locator('.pc-reel').count(), 0);
  } finally { await browser.close(); }
});
