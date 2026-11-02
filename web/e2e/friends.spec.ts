import { expect, test, type Page } from '@playwright/test';
import { COUNTRY_LIST } from '../shared/types';
import type { FriendView, SocialMessage } from '../src/lib/social';

test.use({ serviceWorkers: 'block' });
const now = new Date().toISOString();
const earlier = new Date(Date.now() - 20 * 60_000).toISOString();
const friend = (id: string, displayName: string, lastMessage: string, unread = 0): FriendView => ({
  id, displayName, avatar: '', lastMessage, lastMessageAt: id === 'alice' ? now : earlier, unread,
});
const message = (id: string, fromUser: string, toUser: string, body: string): SocialMessage => ({
  id, fromUser, toUser, body, createdAt: now, readAt: null,
});

async function setup(page: Page, options: { guest?: boolean; empty?: boolean; language?: string } = {}) {
  await page.addInitScript((language) => localStorage.setItem('picolah.language', language), options.language ?? 'zh');
  const friends = options.empty ? [] : [friend('alice', '小林', '周末一起去看看？', 2), friend('bob', 'Alex Chen', '这款耳机的价格很不错'), friend('long', '这是一个非常非常长的好友名称用来检查列表显示', '一条很长的最近消息，应该自动省略而不会挤压时间或头像。')];
  const history: Record<string, SocialMessage[]> = {
    alice: [message('a1', 'alice', 'me', '看到你分享的比价了，这款耳机很不错。'), message('a2', 'me', 'alice', '我也觉得，等周末一起看看。')],
    bob: [message('b1', 'bob', 'me', '这款耳机的价格很不错')], long: [],
  };
  const incoming = options.empty ? [] : [{ id: 'request-1', userId: 'new', displayName: '新朋友', avatar: '', createdAt: now }];
  const payloads: Record<string, unknown> = {
    '/api/auth/me': { user: options.guest ? null : { id: 'me', email: 'ui@example.test', displayName: '我', avatar: '' }, required: false },
    '/api/config': { llmConfigured: false, markets: COUNTRY_LIST, gateway: {} },
    '/api/conversations': { conversations: [] },
    '/api/catalog': { products: [], categories: [], total: 0 },
    '/api/capybara': { capybara: null },
    '/api/profile': { profile: { recent: [] } },
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/social/radar') return route.fulfill({ json: { friends, incoming, outgoing: [], candidates: [], self: { hasData: false, personaZh: '', personaEn: '', taglineZh: '', taglineEn: '', categories: [], brands: [], platforms: [], budget: null, comparisons: 0, clicks: 0 } } });
    if (url.pathname.startsWith('/api/social/messages/')) {
      const id = url.pathname.split('/').at(-1)!;
      const after = url.searchParams.get('after');
      return route.fulfill({ json: { messages: (history[id] ?? []).filter((item) => !after || item.createdAt > after) } });
    }
    if (url.pathname === '/api/social/messages' && request.method() === 'POST') {
      const body = request.postDataJSON();
      const sent = { ...message(`sent-${Date.now()}`, 'me', body.toUserId, body.body), createdAt: new Date().toISOString() };
      history[body.toUserId].push(sent);
      return route.fulfill({ json: { message: sent } });
    }
    if (url.pathname.includes('/api/social/requests/')) {
      incoming.splice(0);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({ status: payloads[url.pathname] ? 200 : 404, json: payloads[url.pathname] ?? {} });
  });
  await page.goto('/7hk9ho#friends');
  return history;
}

for (const width of [1440, 390, 320]) {
  test(`friends search, drafts and inline chat at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    await setup(page);
    const rows = page.locator('.friends-contact-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('小林');
    await expect(page.locator('.friends-unread')).toHaveText('2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`friends-list-${width}.png`) });
    await page.getByRole('searchbox', { name: '搜索好友' }).fill('不存在');
    await expect(page.getByText('没有找到匹配的好友')).toBeVisible();
    await page.getByRole('button', { name: '清除搜索' }).click();
    await page.getByRole('button', { name: '聊天 小林', exact: true }).click();
    await expect(page.getByRole('heading', { name: '小林' })).toBeVisible();
    await expect(page.locator('.friends-bubble')).toHaveCount(2);
    if (width > 760) {
      await expect(rows.first()).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.friends-unread')).toHaveCount(0);
    } else await expect(page.locator('.friends-list-panel')).toBeHidden();
    const input = page.getByRole('textbox', { name: '说点什么…' });
    await input.fill('保留给小林的草稿');
    await page.getByRole('button', { name: width > 760 ? '关闭' : '返回好友列表', exact: true }).click();
    await expect(page.getByRole('button', { name: '聊天 小林', exact: true })).toContainText('[草稿]');
    await page.getByRole('button', { name: '聊天 Alex Chen', exact: true }).click();
    await expect(input).toHaveValue('');
    await page.getByRole('button', { name: width > 760 ? '关闭' : '返回好友列表', exact: true }).click();
    await page.getByRole('button', { name: '聊天 小林', exact: true }).click();
    await expect(input).toHaveValue('保留给小林的草稿');
    await input.fill('周末见');
    await input.press('Shift+Enter');
    await input.press('z');
    await expect(input).toHaveValue('周末见\nz');
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(page.locator('.friends-bubble').last()).toHaveText('周末见\nz');
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`friends-chat-${width}.png`) });
  });
}

test('a slow send stays with its friend and preserves a newer draft after switching back', async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/social/messages', async (route) => {
    const body = route.request().postDataJSON();
    await pending;
    await route.fulfill({ json: { message: message('slow', 'me', body.toUserId, body.body) } });
  });
  await page.getByRole('button', { name: '聊天 小林', exact: true }).click();
  const input = page.getByRole('textbox', { name: '说点什么…' });
  await input.fill('旧消息');
  const request = page.waitForRequest('**/api/social/messages');
  await input.press('Enter');
  await request;
  await page.getByRole('button', { name: '聊天 Alex Chen', exact: true }).click();
  await input.fill('给 Alex 的草稿');
  await page.getByRole('button', { name: '聊天 小林', exact: true }).click();
  await input.fill('小林的新草稿');
  const response = page.waitForResponse('**/api/social/messages');
  release(); await response;
  await expect(input).toHaveValue('小林的新草稿');
  await page.getByRole('button', { name: '聊天 Alex Chen', exact: true }).click();
  await expect(input).toHaveValue('给 Alex 的草稿');
  await expect(page.locator('.friends-bubble')).not.toContainText(['旧消息']);
});

test('requests remain actionable and notification popover closes with Escape', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: '通知', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '通知' })).toBeVisible();
  await page.getByRole('button', { name: '接受 新朋友' }).click();
  await expect(page.getByRole('button', { name: '接受 新朋友' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '通知' })).toHaveCount(0);
});

test('empty friends offer a working Radar entry', async ({ page }) => {
  await setup(page, { empty: true });
  await expect(page.getByText('还没有好友，去雷达发现与你偏好相近的人。')).toBeVisible();
  await page.getByRole('button', { name: '去雷达找好友', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: '雷达', exact: true })).toBeVisible();
});

test('guest sign-in entry opens the login dialog', async ({ page }) => {
  await setup(page, { guest: true });
  await expect(page.getByRole('heading', { name: '登录后查看好友' })).toBeVisible();
  await page.locator('.friends-guest').getByRole('button', { name: '登录 / 注册', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('English labels, failed message loading and failed sends preserve usable chat', async ({ page }) => {
  await setup(page, { language: 'en' });
  await page.route('**/api/social/messages/alice', (route) => route.fulfill({ status: 503, json: { message: 'Connection unavailable' } }));
  await page.getByRole('button', { name: 'Chat 小林', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connection unavailable');
  await page.unroute('**/api/social/messages/alice');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.friends-bubble')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.route('**/api/social/messages', (route) => route.fulfill({ status: 503, json: { message: 'Send failed' } }));
  const input = page.getByRole('textbox', { name: 'Say something…' });
  await input.fill('Keep this draft');
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true });
  await expect(page.locator('.friends-bubble')).toHaveCount(2);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText('Send failed', { exact: true })).toBeVisible();
  await expect(input).toHaveValue('Keep this draft');
});
