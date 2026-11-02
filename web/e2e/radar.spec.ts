import { expect, test, type Page } from '@playwright/test';
import { COUNTRY_LIST } from '../shared/types';
import type { RadarData } from '../src/lib/social';

test.use({ serviceWorkers: 'block' });

async function setup(page: Page, options: { guest?: boolean; noData?: boolean; empty?: boolean; error?: boolean; en?: boolean } = {}) {
  await page.addInitScript((language) => localStorage.setItem('picolah.language', language), options.en ? 'en' : 'zh');
  const stamp = new Date().toISOString();
  const data: RadarData = {
    self: {
      hasData: !options.noData, personaZh: '数码生活家', personaEn: 'Tech explorer',
      taglineZh: '喜欢实用好物，也在意每一笔花费。', taglineEn: 'Useful finds, thoughtful spending.',
      categories: [{ zh: '数码电子', en: 'Electronics' }], brands: [{ zh: '索尼', en: 'Sony' }], platforms: [],
      budget: { min: 100, max: 500, median: 250, currency: 'SGD' }, comparisons: 12, clicks: 8,
    },
    candidates: options.empty ? [] : [
      { id: 'mia', displayName: 'Mia Tan', avatar: '', similarity: 93, shared: [{ zh: '数码电子', en: 'Electronics' }, { zh: '索尼', en: 'Sony' }], relationship: 'none' },
      { id: 'lin', displayName: '小林', avatar: '', similarity: 87, shared: [{ zh: '家居生活', en: 'Home & living' }, { zh: '小米', en: 'Xiaomi' }], relationship: 'friend' },
      { id: 'alex', displayName: 'Alex Chen', avatar: '', similarity: 82, shared: [{ zh: '运动户外', en: 'Sports & outdoors' }, { zh: '耐克', en: 'Nike' }], relationship: 'requested' },
      { id: 'yue', displayName: '小悦', avatar: '', similarity: 75, shared: [{ zh: '数码电子', en: 'Electronics' }, { zh: '苹果', en: 'Apple' }], relationship: 'incoming' },
      { id: 'long', displayName: '喜欢收集生活好物的朋友与超长昵称', avatar: '', similarity: 68, shared: [{ zh: '日常好物与很长很长的消费偏好标签', en: 'Everyday essentials and a very long preference label' }], relationship: 'none' },
    ],
    incoming: [{ id: 'request-yue', userId: 'yue', displayName: '小悦', avatar: '', createdAt: stamp }], outgoing: [],
    friends: [{ id: 'lin', displayName: '小林', avatar: '', lastMessage: '周末一起看看吧。', lastMessageAt: stamp, unread: 1 }],
  };
  let fail = !!options.error;
  let sent = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const payloads: Record<string, unknown> = {
    '/api/auth/me': { user: options.guest ? null : { id: 'me', email: 'ui@example.test', displayName: '我', avatar: '' }, required: false },
    '/api/config': { llmConfigured: false, markets: COUNTRY_LIST, gateway: {} },
    '/api/conversations': { conversations: [] }, '/api/catalog': { products: [], categories: [], total: 0 },
    '/api/capybara': { capybara: null }, '/api/profile': { profile: { recent: [] } },
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/social/radar') {
      if (fail) return route.fulfill({ status: 503, json: { message: '暂时无法连接服务' } });
      return route.fulfill({ json: data });
    }
    if (url.pathname === '/api/social/requests') {
      data.candidates.find((candidate) => candidate.id === request.postDataJSON().toUserId)!.relationship = 'requested';
      return route.fulfill({ json: { status: 'pending' } });
    }
    if (url.pathname.startsWith('/api/social/requests/request-yue/')) {
      const accept = url.pathname.endsWith('/accept');
      data.incoming = [];
      data.candidates.find((candidate) => candidate.id === 'yue')!.relationship = accept ? 'friend' : 'none';
      if (accept) data.friends.push({ id: 'yue', displayName: '小悦', avatar: '', unread: 0, lastMessage: null, lastMessageAt: null });
      return route.fulfill({ json: { ok: true } });
    }
    if (url.pathname.startsWith('/api/social/messages/')) return route.fulfill({ json: { messages: [] } });
    if (url.pathname === '/api/social/messages') {
      const body = request.postDataJSON();
      sent++;
      return route.fulfill({ json: { message: { id: `message-${sent}`, fromUser: 'me', toUser: body.toUserId, body: body.body, createdAt: stamp, readAt: null } } });
    }
    return route.fulfill({ status: payloads[url.pathname] ? 200 : 404, json: payloads[url.pathname] ?? {} });
  });
  await page.goto('/7hk9ho#radar');
  return { data, errors, recover: () => { fail = false; } };
}

for (const width of [1440, 390, 320]) {
  test(`people list, filtering, requests and chat at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    const state = await setup(page);
    await expect(page.locator('.radar-candidates > li')).toHaveCount(5);
    await expect(page.locator('.radar-stage')).toHaveCount(0);
    await expect(page.locator('.radar-candidates')).toContainText('相似度 93%');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`radar-list-${width}.png`), fullPage: true });
    await page.getByRole('combobox', { name: '筛选相似的人' }).selectOption('friends');
    await expect(page.locator('.radar-candidates > li')).toHaveCount(1);
    await page.getByRole('button', { name: '聊天 小林', exact: true }).click();
    await page.getByRole('textbox', { name: '说点什么…' }).fill('周末见');
    await page.getByRole('button', { name: '发送', exact: true }).click();
    await expect(page.locator('.radar-bubble')).toHaveText('周末见');
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('combobox', { name: '筛选相似的人' }).selectOption('new');
    await expect(page.locator('.radar-candidates > li')).toHaveCount(4);
    await page.getByRole('button', { name: '加好友 Mia Tan', exact: true }).click();
    await expect(page.locator('.radar-candidates > li').filter({ hasText: 'Mia Tan' })).toContainText('已申请');
    await page.getByRole('button', { name: '查看申请 小悦', exact: true }).click();
    await expect(page.getByRole('button', { name: '接受 小悦', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '接受 小悦', exact: true }).click();
    await expect(page.locator('.radar-candidates > li')).toHaveCount(3);
    await page.getByText('我的消费偏好', { exact: true }).click();
    await expect(page.getByText('12 次比价 · 8 次跳转', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('a failed API response has a visible retry and never masquerades as missing preferences', async ({ page }) => {
  const state = await setup(page, { error: true });
  await expect(page.getByRole('alert')).toContainText('暂时无法连接服务');
  await expect(page.getByRole('heading', { name: '先比几次价，雷达才能读懂你' })).toHaveCount(0);
  state.recover();
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.locator('.radar-candidates > li')).toHaveCount(5);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('people with no comparisons can still handle incoming requests', async ({ page }) => {
  await setup(page, { noData: true });
  await expect(page.getByRole('heading', { name: '先比几次价，雷达才能读懂你' })).toBeVisible();
  await page.getByText('新的朋友', { exact: true }).click();
  await page.getByRole('button', { name: '拒绝 小悦', exact: true }).click();
  await expect(page.getByText('暂无新的好友请求', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '去发现商品', exact: true }).click();
  await expect(page.getByRole('heading', { name: '发现', exact: true })).toBeVisible();
});

test('English empty results and guest sign-in entry remain readable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, { empty: true, en: true });
  await expect(page.getByText('No one close yet. Check back as more people compare products.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter similar people' }).selectOption('friends');
  await page.getByRole('button', { name: 'Show everyone' }).click();
  await expect(page.getByRole('combobox')).toHaveValue('all');
  await page.screenshot({ path: info.outputPath('radar-empty-en.png') });
});

test('guest has a working login action without requesting protected radar data', async ({ page }) => {
  let radarRequests = 0;
  page.on('request', (request) => { if (request.url().endsWith('/api/social/radar')) radarRequests++; });
  await setup(page, { guest: true });
  await expect(page.getByRole('heading', { name: '登录后开启雷达' })).toBeVisible();
  await page.locator('.radar-guest').getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(radarRequests).toBe(0);
});
