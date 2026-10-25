import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

test('PostgreSQL driver runs the same repository flows as SQLite', async (t) => {
  const port = await freePort();
  const pglite = new PGlite();
  const socket = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1' });
  await socket.start();

  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  // PGlite's socket fixture accepts one connection; queue concurrent feed reads.
  process.env.DATABASE_POOL_SIZE = '1';
  process.env.NODE_ENV = 'test';
  process.env.AUTH_REQUIRED = 'false';
  process.env.LLM_API_KEY = '';
  process.env.CRAWLER_TOOL_URL = '';
  process.env.CRAWLER_TOOL_TOKEN = '';

  let httpServer: import('node:http').Server | undefined;
  const { db } = await import('./db.ts');
  const repo = await import('./repo.ts');
  const auth = await import('./auth.ts');
  const profile = await import('./profile.ts');
  const watchlist = await import('./watchlist.ts');
  const reels = await import('./reels.ts');
  const { REELS } = await import('../shared/reels.ts');

  t.after(async () => {
    if (httpServer?.listening) {
      httpServer.closeAllConnections();
      await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    }
    await db.close();
    await socket.stop();
    await pglite.close();
  });

  assert.equal(db.kind, 'postgres');

  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO products (id, name, brand, category, tagline, visual, specs, aliases, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['p1', 'Test Phone', 'Test', 'phone', 'tagline', 'phone', '{}', '[]', now, now],
  );
  await db.run(
    `INSERT INTO offers (id, external_id, source, product_id, platform_id, seller, country, currency,
       item_price, shipping_fee, discount, final_price, landed_price_confidence, url, rating, reviews,
       in_stock, is_official, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['o1', 'ext-1', 'crawler', 'p1', 'shopee', 'seller', 'SG', 'SGD', 100, 5, 0, 100, 'exact',
      'https://example.com/o1', 4.8, 10, 1, 0, now, now, now],
  );
  await db.run(
    `INSERT INTO offers (id, external_id, source, product_id, platform_id, seller, country, currency,
       item_price, shipping_fee, discount, final_price, landed_price_confidence, url, rating, reviews,
       in_stock, is_official, last_seen, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['o2', 'ext-2', 'crawler', 'p1', 'lazada', 'seller', 'SG', 'SGD', 90, 0, 10, 90, 'exact',
      'https://example.com/o2', 4.6, 4, 1, 0, now, now, now],
  );
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  await db.run('INSERT INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)', ['o1', oneHourAgo, 100]);
  await db.run('INSERT INTO price_points (offer_id, recorded_at, price) VALUES (?, ?, ?)', ['o1', now, 95]);

  const product = await repo.getProduct('p1');
  const comparison = await repo.buildComparison({ query: 'Test Phone', market: 'SG', product });
  assert.equal(comparison.offers.length, 2);
  assert.equal(comparison.offers[0].platformId, 'lazada');
  assert.equal(comparison.offers[0].finalPrice, 90);
  assert.equal(comparison.offers[1].low30d, 95);

  const history = await repo.getPriceHistory('o1');
  assert.equal(history.length, 2);

  const conversationId = 'c1';
  await repo.createConversationWithId(conversationId, 'Test', 'SG', now);
  await repo.addMessage({ conversationId, role: 'user', content: 'hello' });
  const conversation = await repo.getConversation(conversationId);
  assert.equal(conversation?.messages.length, 1);

  const user = await auth.createUser({ email: 'pg@example.com', passwordHash: 'hash', displayName: 'PG' });
  assert.equal((await auth.findUserByEmail('pg@example.com'))?.id, user.id);

  const reelOwner = 'pg-reels-anonymous';
  const watchedReel = REELS[0];
  const watchEvent = {
    eventId: 'pg-watch-first',
    sessionId: 'pg-reel-session',
    reelId: watchedReel.id,
    type: 'watch' as const,
    market: 'SG' as const,
    watchMs: 4000,
  };
  await reels.recordReelEvent(reelOwner, watchEvent);
  await reels.recordReelEvent(reelOwner, watchEvent);
  await reels.recordReelEvent(reelOwner, { ...watchEvent, eventId: 'pg-watch-second', watchMs: 9000 });
  await reels.recordReelEvent(reelOwner, {
    eventId: 'pg-like-first', sessionId: watchEvent.sessionId,
    reelId: watchedReel.id, type: 'like', market: 'SG',
  });
  const video = await reels.getVideoProfile(reelOwner);
  assert.equal(video.views, 1);
  assert.equal(video.watchedMs, 9000);
  assert.equal(video.likes, 1);
  assert.equal((await reels.getReelFeed(reelOwner, 'SG')).items.find((item) => item.id === watchedReel.id)?.liked, true);

  assert.equal(await reels.mergeVideoProfile(reelOwner, user.id), 2);
  assert.equal((await reels.getVideoProfile(reelOwner)).hasData, false);
  const accountVideo = await reels.getVideoProfile(user.id);
  assert.equal(accountVideo.views, 1);
  assert.equal(accountVideo.watchedMs, 9000);
  assert.equal(accountVideo.likes, 1);
  assert.equal(await reels.mergeVideoProfile(reelOwner, user.id), 0);
  assert.equal((await profile.getShoppingProfile(user.id)).video.likes, 1);
  await reels.resetVideoProfile(user.id);
  assert.equal((await reels.getVideoProfile(user.id)).hasData, false);
  assert.ok((await reels.getReelFeed(user.id, 'SG')).items.every((item) => !item.liked));

  // Reset must remove the receipt and session as well as the aggregate state.
  await reels.recordReelEvent(user.id, watchEvent);
  assert.equal((await reels.getVideoProfile(user.id)).watchedMs, 4000);
  await profile.resetProfile(user.id);
  assert.equal((await reels.getVideoProfile(user.id)).hasData, false);

  const { app } = await import('./index.ts');
  httpServer = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => httpServer.once('listening', resolve));
  const address = httpServer.address();
  const httpPort = typeof address === 'object' && address ? address.port : 0;
  const health = await fetch(`http://127.0.0.1:${httpPort}/api/health`);
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as { database?: string; databaseOk?: boolean };
  assert.equal(healthBody.database, 'postgres');
  assert.equal(healthBody.databaseOk, true);

  const { config } = await import('./config.ts');
  const ingestPayload = {
    source: 'pg-test',
    country: 'SG',
    products: [{ id: 'p2', name: 'Ingested Phone', brand: 'Test' }],
    offers: [{
      externalId: 'pg-ext-1',
      productId: 'p2',
      platformId: 'shopee',
      seller: 'seller',
      itemPrice: 120,
      url: 'https://example.com/p2',
    }],
  };
  for (let i = 0; i < 2; i += 1) {
    const ingest = await fetch(`http://127.0.0.1:${httpPort}/api/v1/ingest/offers`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.ingestKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(ingestPayload),
    });
    assert.equal(ingest.status, 200);
  }
  const ingested = await db.get<{ count: string }>('SELECT count(*) AS count FROM offers WHERE external_id = ?', ['pg-ext-1']);
  assert.equal(Number(ingested?.count), 1);


  await profile.recordComparisonEvent('u1', comparison);
  const shoppingProfile = await profile.getShoppingProfile('u1');
  assert.equal(shoppingProfile.totals.comparisons, 1);

  const watched = await watchlist.addWatchlist('u1', 'p1', 'SG', 95);
  assert.equal(watched?.product.id, 'p1');
  assert.equal((await watchlist.listWatchlist('u1', 'SG')).length, 1);
  await watchlist.evaluateWatchlist('SG');
  assert.ok((await watchlist.listAlerts('u1')).length >= 1);
});
