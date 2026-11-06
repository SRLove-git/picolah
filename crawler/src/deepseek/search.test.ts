import assert from 'node:assert/strict';
import test from 'node:test';
import { searchDeepSeekCandidates } from './search.ts';
import { parseWebProduct } from '../platforms/web-product.ts';
import { queryMatchesListing } from '../discovery-match.ts';

test('global discovery sends no country or currency constraint', async () => {
  await searchDeepSeekCandidates('Joyoung soy milk maker', 'SG', { geography: 'global', apiKey: 'test', fetchImpl: async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).query, 'Joyoung soy milk maker buy price');
    return Response.json({ results: [] });
  } });
});

test('DeepSeek discovery bounds and localizes the query, discards all price hints, and filters unsafe sources', async () => {
  const result = await searchDeepSeekCandidates('Sony WH-1000XM5', 'SG', { apiKey: 'test-only', fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.match(body.query, /Singapore SGD buy price$/);
    assert.equal(body.count, 30);
    return Response.json({ results: [
      { title: 'Sony WH-1000XM5', url: 'https://shop.sg/products/headphone?pr_rec_id=abc', snippet: 'S$1.00', price: 1 },
      { title: 'Sony WH-1000XM5', url: 'https://shop.sg/products/headphone?pr_rec_id=def' },
      { title: 'Unsafe', url: 'http://127.0.0.1/product' },
    ] });
  } });
  assert.deepEqual(result, [{ title: 'Sony WH-1000XM5', url: 'https://shop.sg/products/headphone' }]);
});
test('search provider failure is not an empty successful search and private errors are hidden', async () => {
  await assert.rejects(searchDeepSeekCandidates('Sony', 'SG', { apiKey: 'test', fetchImpl: async () => new Response('secret', { status: 401 }) }), (error: any) => error.code === 'SERP_AUTH_FAILED' && !error.message.includes('secret'));
  await assert.rejects(searchDeepSeekCandidates('Sony', 'SG', { apiKey: 'test', fetchImpl: async () => Response.json({ error: 'private' }) }), (error: any) => error.code === 'SERP_PARSE_FAILED');
});
test('single merchant offer with an empty URL object requires a matching explicit product identity', () => {
  const url = 'https://www.courts.com.sg/philips-series-2000-air-fryer-4.2l-na221%2F09-IP194844.html';
  const product = { '@type': 'Product', '@id': url, name: 'PHILIPS Series 2000 Air Fryer (4.2l) NA221/09', offers: { '@type': 'Offer', url: {}, priceCurrency: 'SGD', price: '158.00', availability: 'http://schema.org/InStock' } };
  const html = (data: unknown) => `<link rel="canonical" href="${url}"><script type="application/ld+json">${JSON.stringify(data)}</script>`;
  const listings = parseWebProduct(html(product), url, 'SG');
  assert.equal(listings.length, 1);
  assert.equal(listings[0].price, 158);
  assert.equal(listings[0].shippingFee, undefined);
  assert.equal(queryMatchesListing('Philips NA221/09', listings[0], 'SG', 'web'), true);
  for (const title of ['PHILIPS NA221/08 Air Fryer', 'PHILIPS NA221/09R1 Air Fryer', 'PHILIPS NA221/09 / NA221/08 Air Fryer']) {
    assert.equal(queryMatchesListing('Philips NA221/09', { ...listings[0], title }, 'SG', 'web'), false, title);
  }
  for (const id of [undefined, 'https://evil.example/product', 'https://www.courts.com.sg/other']) {
    assert.deepEqual(parseWebProduct(html({ ...product, '@id': id }), url, 'SG'), []);
  }
});

test('manufacturer model punctuation cannot turn into search exclusion operators', async () => {
  await searchDeepSeekCandidates('Philips NA-221/09', 'SG', { apiKey: 'test', fetchImpl: async (_url, init) => {
    const query = JSON.parse(String(init?.body)).query;
    assert.equal(query, 'Philips NA221/09 Singapore SGD buy price');
    return Response.json({ results: [] });
  } });
});

test('canonical multi-part model codes use the compact spelling in discovery only', async () => {
  await searchDeepSeekCandidates('Sony WH-CH720N', 'SG', { geography: 'global', apiKey: 'test', fetchImpl: async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).query, 'Sony WHCH720N buy price');
    return Response.json({ results: [] });
  } });
});

test('global discovery retains independent merchants beyond the first twelve candidates for later ranking', async () => {
  const result = await searchDeepSeekCandidates('Sony WH-CH720N', 'SG', { geography: 'global', apiKey: 'test', fetchImpl: async (_url, init) => {
    assert.equal(JSON.parse(String(init?.body)).count, 30);
    return Response.json({ results: Array.from({ length: 30 }, (_, i) => ({ title: 'Sony WH-CH720N', url: `https://shop${i}.example.com/product` })) });
  } });
  assert.equal(result.length, 30); assert.equal(result.at(-1)?.url, 'https://shop29.example.com/product');
});


test('all supported country searches retain country and currency in provider queries', async () => {
  const { MARKETS } = await import('../markets.ts');
  const { buildWebSearchUrl } = await import('../brightdata/serp.ts');
  for (const market of Object.values(MARKETS)) {
    const google = new URL(buildWebSearchUrl('Sony WH-CH720N', market.code));
    assert.equal(google.searchParams.get('gl'), market.code.toLowerCase());
    assert.ok(google.searchParams.get('q')?.includes(`${market.name} ${market.currency}`));
    await searchDeepSeekCandidates('Sony WH-CH720N', market.code, { apiKey: 'test', fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.query.endsWith(`${market.name} ${market.currency} buy price`));
      return Response.json({ results: [] });
    } });
  }
});
