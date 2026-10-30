import assert from 'node:assert/strict';
import test from 'node:test';
import { mapShopeeDatasetRows, parseShopeeDatasetCsv, searchShopeeDataset, shopeeDatasetKeyword } from './shopee-dataset.ts';
import { config } from '../config.ts';

const HEADER = 'url,id,title,final_price,currency,rating,reviews,seller_name,stock,is_available,domain,image_url';

function row(values: Partial<Record<string, string>>): string {
  const order = HEADER.split(',');
  return order
    .map((key) => {
      const value = values[key] ?? '';
      return `"${value.replace(/"/g, '""')}"`;
    })
    .join(',');
}

const CSV = [
  HEADER,
  row({
    url: 'https://shopee.sg/Sony-WH-1000XM5-i.111.24661543126?model_id=1',
    id: '24661543126',
    title: 'Sony WH-1000XM5 Headphones',
    final_price: '2.959000000000000e+01',
    currency: 'SGD',
    rating: '4.8',
    reviews: '0',
    seller_name: 'Shop, Inc.',
    stock: '',
    is_available: '',
    domain: 'https://shopee.sg',
    image_url: 'https://down-sg.img.susercontent.com/file/sony-wh1000xm5',
  }),
  // Duplicate item id -> ignored.
  row({
    url: 'https://shopee.sg/Sony-WH-1000XM5-i.111.24661543126',
    id: '24661543126',
    title: 'Sony WH-1000XM5 duplicate',
    final_price: '30',
    currency: 'SGD',
  }),
  // Other market -> ignored.
  row({
    url: 'https://shopee.com.mx/Camisa-i.1.999',
    id: '999',
    title: 'Camisa',
    final_price: '868',
    currency: 'MXN',
    domain: 'https://shopee.com.mx',
  }),
  // Out of stock.
  row({
    url: 'https://shopee.sg/Anmum-i.222.6378783065',
    id: '6378783065',
    title: 'Anmum Materna',
    final_price: '308.23',
    currency: 'SGD',
    stock: '0',
  }),
  // No price -> ignored.
  row({
    url: 'https://shopee.sg/No-Price-i.333.123',
    id: '123',
    title: 'No price',
    currency: 'SGD',
  }),
].join('\n');

test('maps Shopee dataset CSV rows for the requested market', () => {
  const listings = parseShopeeDatasetCsv(CSV, 'SG');
  assert.equal(listings.length, 2);

  const [sony, anmum] = listings;
  assert.equal(sony.itemId, '24661543126');
  assert.equal(sony.title, 'Sony WH-1000XM5 Headphones');
  assert.equal(sony.price, 29.59);
  assert.equal(sony.currency, 'SGD');
  assert.equal(sony.rating, 4.8);
  assert.equal(sony.reviews, undefined);
  assert.equal(sony.seller, 'Shop, Inc.');
  assert.equal(sony.inStock, true);
  assert.equal(sony.isOfficial, false);
  assert.equal(sony.imageUrl, 'https://down-sg.img.susercontent.com/file/sony-wh1000xm5');

  assert.equal(anmum.itemId, '6378783065');
  assert.equal(anmum.price, 308.23);
  assert.equal(anmum.inStock, false);
});

test('falls back to the item id embedded in the URL', () => {
  const listings = mapShopeeDatasetRows(
    [{
      url: 'https://shopee.sg/Fallback-i.999.24661543127',
      id: '',
      title: 'Fallback item',
      final_price: '10',
      currency: 'SGD',
    }],
    'SG',
  );
  assert.equal(listings[0]?.itemId, '24661543127');
});

test('rounds prices to the market minor unit', () => {
  const idr = mapShopeeDatasetRows(
    [{
      url: 'https://shopee.co.id/Test-i.1.2',
      id: '2',
      title: 'Test',
      final_price: '1299000.6',
      currency: 'IDR',
    }],
    'ID',
  );
  assert.equal(idr[0]?.price, 1_299_001);
});

test('uses a distinctive model token for the dataset filter', () => {
  assert.equal(shopeeDatasetKeyword('Sony WH-1000XM5 Wireless Noise Cancelling Headphones'), 'WH-1000XM5');
  assert.equal(shopeeDatasetKeyword('Samsung Galaxy S24 Ultra'), 'S24');
  assert.equal(shopeeDatasetKeyword('Apple AirPods Pro'), 'Apple AirPods');
  assert.equal(shopeeDatasetKeyword('Sony WH-1000XM5 (2024)'), 'WH-1000XM5');
});

test('repeated live dataset searches do not reuse an unbounded process-lifetime quote cache', async (t) => {
  const previousId = config.brightData.shopeeDatasetId;
  const previousToken = config.brightData.apiToken;
  config.brightData.shopeeDatasetId = 'test-dataset';
  config.brightData.apiToken = 'test-token';
  t.after(() => { config.brightData.shopeeDatasetId = previousId; config.brightData.apiToken = previousToken; });
  let requests = 0;
  let jobs = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    requests++;
    const url = String(input);
    if (url.endsWith('/datasets/filter')) return new Response(JSON.stringify({ snapshot_id: `test-snapshot-${++jobs}` }));
    if (url.includes('/download?')) return new Response(CSV);
    return new Response(JSON.stringify({ status: 'ready', records_count: 2 }));
  });
  assert.equal((await searchShopeeDataset('SG', 'Sony WH-1000XM5')).length, 2);
  assert.equal((await searchShopeeDataset('SG', 'Sony WH-1000XM5')).length, 2);
  assert.equal(jobs, 2);
  assert.equal(requests, 6);
});
