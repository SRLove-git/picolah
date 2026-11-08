import assert from 'node:assert/strict';
import test from 'node:test';
import { isMallSite, mallDomains, mallPriority, searchMallPlatforms } from './mall-search.ts';

test('Singapore marketplaces and established retail malls outrank classifieds', () => {
  assert.ok(mallDomains('SG').includes('shopee.sg'));
  assert.ok(mallDomains('SG').includes('amazon.sg'));
  assert.equal(mallPriority(new URL('https://shopee.sg/product/1/2'), 'SG'), 3);
  assert.equal(mallPriority(new URL('https://www.amazon.sg/dp/B012345678'), 'SG'), 3);
  for (const url of ['https://www.courts.com.sg/product', 'https://www.harveynorman.com.sg/product',
    'https://www.gaincity.com/product', 'https://online.challenger.sg/products/item']) {
    assert.equal(isMallSite(new URL(url), 'SG'), true, url);
    assert.equal(mallPriority(new URL(url), 'SG'), 2, url);
  }
  assert.equal(mallPriority(new URL('https://store.example.sg/product'), 'SG'), 1);
  assert.equal(mallPriority(new URL('https://www.carousell.sg/p/item-123/'), 'SG'), 0);
});

test('mall discovery uses one Singapore-focused request and discards unrelated hosts', async () => {
  const calls: Array<[string,string]> = [];
  const rows = await searchMallPlatforms('SG', 'KitchenAid 5KSM175PS', async (query, market) => {
    calls.push([query,market]);
    return [
      {url:'https://www.courts.com.sg/kitchenaid',title:'KitchenAid 5KSM175PS'},
      {url:'https://www.amazon.sg/dp/B012345678',title:'KitchenAid 5KSM175PS'},
      {url:'https://www.carousell.sg/p/kitchenaid-123/',title:'KitchenAid 5KSM175PS'},
      {url:'https://news.example.sg/kitchenaid',title:'KitchenAid 5KSM175PS review'},
    ];
  });
  assert.equal(calls.length,1);assert.equal(calls[0][1],'SG');
  assert.equal(calls[0][0],'KitchenAid 5KSM175PS Singapore online shop');
  assert.deepEqual(rows.map(row=>new URL(row.url).hostname),['www.courts.com.sg','www.amazon.sg']);
  let searched=false;
  assert.deepEqual(await searchMallPlatforms('MY','KitchenAid',async()=>{searched=true;return [];}),[]);
  assert.equal(searched,false);
});
