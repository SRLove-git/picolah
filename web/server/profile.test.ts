import assert from 'node:assert/strict';
import test from 'node:test';
import type { Comparison } from '../shared/types.ts';
import { db } from './db.ts';
import {
  getShoppingProfile,
  recordComparisonEvent,
  recordOfferClick,
  requestUserId,
  resetProfile,
} from './profile.ts';

function comparisonFixture(): Comparison {
  return {
    query: 'Sony WH-1000XM5',
    kind: 'comparison',
    market: 'SG',
    product: {
      id: 'sony-wh1000xm5',
      name: 'Sony WH-1000XM5',
      brand: 'Sony',
      category: '耳机',
    } as Comparison['product'],
    offers: [
      {
        platformId: 'shopee',
        finalPrice: 399,
        currency: 'SGD',
        isOfficial: false,
      } as Comparison['offers'][number],
    ],
    alternatives: [],
    totalOffers: 1,
    updatedAt: new Date().toISOString(),
    sourceCount: 1,
    platformFilter: [],
  };
}

async function cleanup(userId: string): Promise<void> {
  await resetProfile(userId);
  await db.run('DELETE FROM app_users WHERE id = ?', [userId]);
}

test('requestUserId only accepts anonymous ids of a safe shape', () => {
  assert.equal(requestUserId({ header: () => '8f5b4d5f-3b5e-4a75-9f0a-1f1b5b7d4c2a' }), '8f5b4d5f-3b5e-4a75-9f0a-1f1b5b7d4c2a');
  assert.equal(requestUserId({ header: () => 'short' }), null);
  assert.equal(requestUserId({ header: () => 'bad id with spaces' }), null);
  assert.equal(requestUserId({ header: () => undefined }), null);
});

test('records a comparison and a lowest-price click into a persona', async () => {
  const userId = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await cleanup(userId);

  try {
    await recordComparisonEvent(userId, comparisonFixture(), 'conversation-1');
    await recordOfferClick(userId, {
      type: 'offer_click',
      market: 'SG',
      productId: 'sony-wh1000xm5',
      platformId: 'shopee',
      price: 399,
      isLowest: true,
      position: 1,
    });

    const profile = await getShoppingProfile(userId);
    assert.equal(profile.hasData, true);
    assert.equal(profile.totals.comparisons, 1);
    assert.equal(profile.totals.clicks, 1);
    assert.equal(profile.totals.offersSeen, 1);
    assert.equal(profile.totals.conversations, 1);
    assert.equal(profile.traits.length, 5);
    assert.equal(profile.markets[0]?.id, 'SG');
    assert.equal(profile.platforms[0]?.id, 'shopee');
    assert.equal(profile.recent.length, 2);
    assert.equal(profile.budget?.min, 399);
    assert.equal(profile.budget?.currency, 'SGD');
    assert.equal(profile.persona?.key, 'deal_hunter');
  } finally {
    await cleanup(userId);
  }
});

test('reset keeps the anonymous user but clears every shopping signal', async () => {
  const userId = `test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await cleanup(userId);

  try {
    await recordComparisonEvent(userId, comparisonFixture(), 'conversation-2');
    assert.equal((await getShoppingProfile(userId)).hasData, true);

    await resetProfile(userId);

    const cleared = await getShoppingProfile(userId);
    assert.equal(cleared.hasData, false);
    assert.equal(cleared.totals.comparisons, 0);
    assert.equal(cleared.recent.length, 0);
  } finally {
    await cleanup(userId);
  }
});

test('recommendation history has an English title, including legacy bilingual snapshots', async () => {
  const userId = 'test-recommendation-title';
  const comparison = comparisonFixture();
  comparison.kind = 'recommendation';
  comparison.alternatives = [
    { product: { ...comparison.product, name: 'Apple iPhone 18 Pro' } },
    { product: { ...comparison.product, name: 'Samsung Galaxy' } },
    { product: { ...comparison.product, name: 'Google Pixel' } },
  ] as Comparison['alternatives'];
  comparison.product = null;
  await cleanup(userId);
  try {
    await recordComparisonEvent(userId, comparison);
    const recorded = (await getShoppingProfile(userId)).recent[0];
    assert.equal(recorded.titleZh, 'Apple iPhone 18 Pro 等 3 款');
    assert.equal(recorded.titleEn, 'Apple iPhone 18 Pro and 2 more');
    const event = await db.get<{ metadata: string }>('SELECT metadata FROM user_events WHERE user_id = ?', [userId]);
    const metadata = JSON.parse(event!.metadata);
    metadata.titleEn = metadata.titleZh;
    await db.run('UPDATE user_events SET metadata = ? WHERE user_id = ?', [JSON.stringify(metadata), userId]);
    assert.equal((await getShoppingProfile(userId)).recent[0].titleEn, 'Apple iPhone 18 Pro and 2 more');
  } finally {
    await cleanup(userId);
  }
});
