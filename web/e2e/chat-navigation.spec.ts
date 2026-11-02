import { createServer, type ServerResponse } from 'node:http';
import { expect, test as base, type Page } from '@playwright/test';

const conversationId = 'navigation-chat';
const now = new Date().toISOString();
const summary = { id: conversationId, title: 'Navigation conversation', market: 'SG', preview: '', createdAt: now, updatedAt: now };

interface ChatFixture {
  requests: number;
  inputs: Array<{ conversationId?: string | null; message: string }>;
  aborted: number;
  loads: number;
  holdLoad: boolean;
  releaseLoad: () => void;
  emit: (event: string, data: unknown) => void;
  start: () => void;
  finish: (text: string) => void;
}

// Use a real, controllable SSE connection so navigation cannot hide an abort
// behind an already-buffered mock response.
const test = base.extend<{ chat: ChatFixture }>({
  chat: async ({ page }, use) => {
    let response: ServerResponse | undefined;
    let answer = '';
    let releaseLoad = () => {};
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const chat: ChatFixture = {
      requests: 0, inputs: [], aborted: 0, loads: 0, holdLoad: false, releaseLoad,
      emit(event, data) { response!.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); },
      start() { chat.emit('meta', { conversationId, title: summary.title, market: 'SG', userMessageId: 'user-message' }); },
      finish(text) {
        answer = text;
        chat.emit('delta', { text });
        chat.emit('done', { conversationId, messageId: 'assistant-message' });
        response!.end();
      },
    };
    const server = createServer((request, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Picolah-User');
      if (request.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      request.resume();
      chat.requests += 1;
      response = res;
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.flushHeaders();
      const deadline = setTimeout(() => res.end(), 15_000);
      res.on('close', () => clearTimeout(deadline));
      res.on('close', () => { if (!res.writableEnded) chat.aborted += 1; });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing SSE fixture port');
    await page.addInitScript(() => localStorage.setItem('picolah.language', 'en'));
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/chat') {
        chat.inputs.push(route.request().postDataJSON());
        await route.continue({ url: `http://127.0.0.1:${address.port}/api/chat` });
        return;
      }
      if (path === `/api/conversations/${conversationId}`) {
        chat.loads += 1;
        if (chat.holdLoad) await loadGate;
        await route.fulfill({ json: { conversation: { ...summary, messages: [
          { id: 'saved-user', role: 'user', content: 'A saved question', createdAt: now },
          ...(answer ? [{ id: 'assistant-message', role: 'assistant', content: answer, createdAt: now }] : []),
        ] } } });
        return;
      }
      const payloads: Record<string, unknown> = {
        '/api/auth/me': { user: null, required: false },
        '/api/config': { llmConfigured: true, llmProvider: 'DeepSeek', llmModel: 'deepseek-flash', markets: [], gateway: {} },
        '/api/conversations': { conversations: [summary] },
        '/api/catalog': { products: [], categories: [], total: 0 },
        '/api/profile': { profile: { recent: [] } },
      };
      await route.fulfill({ json: payloads[path] ?? {} });
    });
    try { await use(chat); }
    finally {
      releaseLoad();
      response?.end();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      await closed;
    }
  },
});

async function navigate(page: Page, name: string) {
  if ((page.viewportSize()?.width ?? 1440) <= 820) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  }
  await page.locator('.pc-sidebar').getByRole('button', { name, exact: true }).click();
}

async function reopenActive(page: Page) {
  await navigate(page, 'Trail');
  await page.getByRole('button', { name: /Navigation conversation/ }).click();
}

async function send(page: Page, chat: ChatFixture) {
  await page.goto('/7hk9ho');
  await page.getByRole('textbox', { name: 'Enter a price comparison question' }).fill('Hello Pico');
  await page.getByRole('textbox', { name: 'Enter a price comparison question' }).press('Enter');
  await expect.poll(() => chat.requests).toBe(1);
}

for (const width of [1440, 390]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('page navigation and reopening the active conversation keep its stream alive', async ({ page, chat }) => {
      await send(page, chat);
      // Leave even before the server has assigned the new conversation ID.
      await navigate(page, 'Discover');
      chat.start();
      chat.emit('delta', { text: 'First part. ' });
      await reopenActive(page);
      await expect(page.getByRole('region', { name: 'Price comparison', exact: true })).toBeVisible();
      await expect(page.locator('.pc-chat')).toContainText('First part.');
      await navigate(page, 'Trail');
      await page.getByRole('button', { name: /Navigation conversation/ }).click();
      await expect(page.locator('.pc-chat')).toContainText('First part.');
      expect(chat.loads).toBe(0);
      expect(chat.aborted).toBe(0);
      await navigate(page, 'Discover');
      chat.finish('Reply completed while away.');
      await expect(page).toHaveTitle('PICOLAH');
      await expect(page.getByRole('region', { name: 'Discover', exact: true })).toBeVisible();
      await reopenActive(page);
      await expect(page.locator('.pc-chat .message-assistant')).toHaveCount(1);
      await expect(page.locator('.pc-chat')).toContainText('First part. Reply completed while away.');
      expect(chat.requests).toBe(1);
      expect(chat.aborted).toBe(0);
    });

    test('returning preserves the composer draft and reading position', async ({ page, chat }) => {
      await send(page, chat);
      chat.start();
      chat.finish(Array.from({ length: 70 }, (_, i) => `Paragraph ${i + 1}: a detailed reply to keep reading.`).join('\n\n'));
      await expect(page.locator('.pc-chat .message-assistant')).toHaveCount(1);
      const input = page.getByRole('textbox', { name: 'Enter a price comparison question' });
      await input.fill('Keep this unsent follow-up');
      const thread = page.locator('.pc-chat-scroll');
      await thread.evaluate((element) => { element.scrollTop = 180; });
      await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBe(180);
      await expect(page.getByRole('button', { name: 'Back to bottom' })).toBeVisible();
      await navigate(page, 'Discover');
      await reopenActive(page);
      await expect(input).toHaveValue('Keep this unsent follow-up');
      await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBe(180);
      await navigate(page, 'Trail');
      await page.getByRole('button', { name: /Navigation conversation/ }).click();
      await expect(input).toHaveValue('Keep this unsent follow-up');
      await expect.poll(() => thread.evaluate((element) => element.scrollTop)).toBe(180);
      expect(chat.loads).toBe(0);
    });
  });
}

test('a history response arriving after navigation does not reopen the chat page', async ({ page, chat }) => {
  chat.holdLoad = true;
  await page.goto('/7hk9ho#messages');
  await page.getByRole('button', { name: /Navigation conversation/ }).click();
  await expect.poll(() => chat.loads).toBe(1);
  await navigate(page, 'Discover');
  const loaded = page.waitForResponse((response) => response.url().endsWith(`/api/conversations/${conversationId}`));
  chat.releaseLoad();
  await loaded;
  await expect(page.getByRole('region', { name: 'Discover', exact: true })).toBeVisible();
  await reopenActive(page);
  await expect(page.locator('.pc-chat')).toContainText('A saved question');
  expect(chat.loads).toBe(1);
});

test('explicitly starting a new conversation still cancels and clears the active one', async ({ page, chat }) => {
  await send(page, chat);
  chat.start();
  chat.emit('delta', { text: 'Partial reply' });
  await expect(page.locator('.pc-chat')).toContainText('Partial reply');
  await page.locator('.pc-chat').getByRole('button', { name: 'New comparison', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Enter a price comparison question' })).toHaveValue('');
  await expect(page.locator('.pc-chat')).toHaveCount(0);
  await expect.poll(() => chat.aborted).toBe(1);
});

test('leaving the retained composer stops voice input without discarding its draft', async ({ page, chat }) => {
  await page.addInitScript(() => {
    const speech = { started: 0, aborted: 0 };
    Object.assign(window, {
      picoSpeech: speech,
      SpeechRecognition: class {
        start() { speech.started += 1; }
        stop() {}
        abort() { speech.aborted += 1; }
      },
    });
  });
  await send(page, chat);
  chat.start();
  chat.finish('Ready for a follow-up.');
  await expect(page.locator('.pc-chat .message-assistant')).toHaveCount(1);
  const input = page.getByRole('textbox', { name: 'Enter a price comparison question' });
  await input.fill('Keep the voice draft');
  await page.getByRole('button', { name: 'Voice input', exact: true }).click();
  await expect(page.locator('.pc-chat .pc-composer-card')).toHaveClass(/is-listening/);
  await navigate(page, 'Discover');
  await expect.poll(() => page.evaluate(() => (window as unknown as { picoSpeech: { aborted: number } }).picoSpeech.aborted)).toBe(1);
  await reopenActive(page);
  await expect(input).toHaveValue('Keep the voice draft');
  await expect(page.locator('.pc-chat .pc-composer-card')).not.toHaveClass(/is-listening/);
});

for (const width of [1440, 390]) for (const trigger of ['Home', 'Picolah']) {
  test(`${trigger} starts a fresh chat after searching at ${width}px`, async ({ page, chat }) => {
    await page.setViewportSize({ width, height: 900 });
    await send(page, chat);
    chat.start();
    chat.emit('delta', { text: 'Old reply still streaming' });
    await expect(page.locator('.pc-chat')).toContainText('Old reply still streaming');
    await navigate(page, trigger);
    await expect(page.locator('.pc-home')).toBeVisible();
    await expect(page.locator('.pc-chat')).toHaveCount(0);
    await expect.poll(() => chat.aborted).toBe(1);
    const input = page.getByRole('textbox', { name: 'Enter a price comparison question' });
    await expect(input).toHaveValue('');
    await input.fill('A different product');
    await input.press('Enter');
    await expect.poll(() => chat.requests).toBe(2);
    expect(chat.inputs[1].conversationId).toBeNull();
    chat.start();
    chat.finish('New reply completed');
    await expect(page.locator('.pc-chat')).toContainText('New reply completed');
    await navigate(page, trigger);
    await expect(input).toHaveValue('');
    await input.fill('Unsent home draft');
    await navigate(page, trigger);
    await expect(input).toHaveValue('');
  });
}

test('Home clears a history deep link and ignores its delayed response', async ({ page, chat }) => {
  chat.holdLoad = true;
  await page.goto('/7hk9ho?conversation=navigation-chat&source=test');
  await expect.poll(() => chat.loads).toBe(1);
  await navigate(page, 'Home');
  await expect(page).toHaveURL(/\?source=test#home$/);
  const loaded = page.waitForResponse(response => response.url().endsWith('/api/conversations/navigation-chat'));
  chat.releaseLoad();
  await loaded;
  await expect(page.locator('.pc-chat')).toHaveCount(0);
  await expect(page.locator('.pc-home')).toBeVisible();
  await page.reload();
  await expect(page.locator('.pc-home')).toBeVisible();
  expect(chat.loads).toBe(1);
});
