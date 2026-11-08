import assert from 'node:assert/strict';
import test from 'node:test';
import { parseWebProduct } from './web-product.ts';

const url = 'https://www.sony.com.sg/products/wf-1000xm6';
const offer = { '@type': 'Offer', price: '399.00', priceCurrency: 'SGD', availability: 'https://schema.org/InStock', url };
const product = { '@type': 'Product', name: 'Sony WF-1000XM6 Wireless Earbuds', url,
  image: 'https://sony.scene7.com/is/image/sony/wf-1000xm6', offers: offer };
const html = (data: unknown, head = '') => `<html><head>${head}<script type="application/ld+json">${JSON.stringify(data)}</script></head></html>`;

test('a current product page yields an explicit source-bound price and stable URL hash', () => {
  const [listing] = parseWebProduct(html(product), url, 'SG');
  assert.equal(listing.platform, 'web'); assert.equal(listing.sourceHost, 'sony.com.sg');
  assert.equal(listing.seller, 'sony.com.sg'); assert.equal(listing.url, url);
  assert.equal(listing.title, product.name); assert.equal(listing.price, 399); assert.equal(listing.currency, 'SGD');
  assert.equal(listing.imageUrl, product.image);
  assert.equal(listing.inStock, true); assert.match(listing.itemId, /^[a-f0-9]{64}$/);
  assert.equal(parseWebProduct(html(product), `${url}#details`, 'SG')[0].itemId, listing.itemId);
  for (const key of ['rating', 'reviews', 'shippingFee', 'discount', 'isOfficial']) assert.equal(key in listing, false, key);
});

test('graph, mainEntity and repeated identical product declarations still represent one page', () => {
  for (const data of [[product], { '@graph': [product] }, { '@type': 'WebPage', mainEntity: product },
    [product, product], { ...product, offers: [offer] }]) assert.equal(parseWebProduct(html(data), url, 'SG').length, 1);
  assert.equal(parseWebProduct(html(product).replace('type="application/ld+json"', "TYPE = 'application/ld+json'"), url, 'SG').length, 1);
});

test('URLs may be absent or relative, but explicit product/offer/canonical URLs must bind this page', () => {
  assert.equal(parseWebProduct(html({ ...product, url: undefined, offers: { ...offer, url: undefined } }), url, 'SG')[0].url, url);
  assert.equal(parseWebProduct(html({ ...product, url: '/products/wf-1000xm6' }), url, 'SG').length, 1);
  assert.equal(parseWebProduct(html(product, '<link rel="canonical" href="https://sony.com.sg/products/wf-1000xm6">'), url, 'SG')[0].url,
    'https://sony.com.sg/products/wf-1000xm6');
  for (const bad of ['https://evil.example.com/products/wf-1000xm6', '/products/wf-1000xm5',
    'http://www.sony.com.sg/products/wf-1000xm6', 'https://www.sony.com.sg:443/products/wf-1000xm6',
    'https://user:secret@www.sony.com.sg/products/wf-1000xm6', `${url}?api_key=secret`, null, '']) {
    assert.deepEqual(parseWebProduct(html({ ...product, url: bad }), url, 'SG'), [], String(bad));
    assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, url: bad } }), url, 'SG'), [], String(bad));
    assert.deepEqual(parseWebProduct(html(product, `<link rel="canonical" href="${bad}">`), url, 'SG'), [], String(bad));
  }
});

test('canonical and variant identity conflicts are rejected rather than choosing a cheap variant', () => {
  assert.deepEqual(parseWebProduct(html(product, `<link rel="canonical" href="${url}"><link rel="canonical" href="${url}?a=1">`), url, 'SG'), []);
  assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, url: `${url}?variant=black` } }), url, 'SG'), []);
  const variant = `${url}?variant=black`;
  assert.equal(parseWebProduct(html({ ...product, url: variant, offers: { ...offer, url: variant } }), variant, 'SG').length, 1);
  assert.deepEqual(parseWebProduct(html({ ...product, url: variant, offers: { ...offer, url: variant } }, `<link rel="canonical" href="${url}">`), variant, 'SG'), []);
});

test('collections and related item lists remain excluded while product variants are separate', () => {
  for (const data of [ { '@type':'ItemList', itemListElement:[{item:product}] }, { '@type':'CollectionPage',mainEntity:product } ])
    assert.deepEqual(parseWebProduct(html(data),url,'SG'),[]);
  const rows=parseWebProduct(html({...product,'@type':'ProductGroup',offers:undefined,hasVariant:[
    {...product,name:'Sony WF-1000XM6 Black',sku:'black'}, {...product,name:'Sony WF-1000XM6 White',sku:'white'}
  ]}),url,'SG');
  assert.equal(rows.length,2);assert.notEqual(rows[0].itemId,rows[1].itemId);
});

test('explicit page amounts retain valid currency and precision checks', () => {
  for (const offers of [[],{...offer,price:'399-499'},{...offer,price:'S$399'},{...offer,price:'from 399'},
    {...offer,price:'399/499'},{...offer,price:399.005},{...offer,price:null},{...offer,price:0},
    {...offer,price:-1},{...offer,price:1e12},{...offer,priceCurrency:'USD'},{...offer,priceCurrency:undefined}])
    assert.deepEqual(parseWebProduct(html({...product,offers}),url,'SG'),[],JSON.stringify(offers));
  assert.equal(parseWebProduct(html({...product,offers:{...offer,price:'399,00'}}),url,'SG')[0]?.price,399);
  const range=parseWebProduct(html({...product,offers:{'@type':'AggregateOffer',lowPrice:299,highPrice:499,priceCurrency:'SGD'}})+'<button>Add to cart</button>',url,'SG')[0];
  assert.equal(range.priceQuote?.kind,'range');assert.equal(range.price,299);assert.equal(range.priceQuote?.maxPrice,499);
  const viet={...product,offers:{...offer,priceCurrency:'VND',price:4000000}};
  assert.equal(parseWebProduct(html(viet),url,'VN').length,1);
  assert.deepEqual(parseWebProduct(html({...viet,offers:{...viet.offers,price:4000000.01}}),url,'VN'),[]);
});

test('Shopee broad HTML offers cannot override its selected primary-price parser', () => {
  const shopee='https://shopee.sg/Canon-EOS-R50-i.40894980.22252976607';
  const data={...product,name:'Canon EOS R50 Mirrorless Camera',url:shopee,
    offers:{...offer,url:shopee,price:'2.00'}};
  assert.deepEqual(parseWebProduct(html(data),shopee,'SG'),[]);
});

test('unknown, out-of-stock and preorder prices retain truthful availability', () => {
  for (const availability of [undefined,null,'','OutOfStock','SoldOut','PreOrder','BackOrder','OnlineOnly','Unknown']) {
    const [row]=parseWebProduct(html({...product,offers:{...offer,availability}}),url,'SG');
    assert.ok(row);assert.equal(row.inStock,false);assert.ok(row.priceQuote?.availability);
  }
  assert.equal(parseWebProduct(html({...product,offers:{...offer,availability:'LimitedAvailability'}}),url,'SG')[0].inStock,true);
});

test('ratings, written review counts and seller are explicit and individually validated', () => {
  const [listing] = parseWebProduct(html({ ...product,
    offers: { ...offer, seller: { '@type': 'Organization', name: 'Sony Store' } },
    aggregateRating: { ratingValue: '4.8', reviewCount: '23', ratingCount: 99 },
  }), url, 'SG');
  assert.equal(listing.rating, 4.8); assert.equal(listing.reviews, 23); assert.equal(listing.seller, 'Sony Store');
  for (const aggregateRating of [
    { ratingValue: null, reviewCount: null }, { ratingValue: '', reviewCount: '' },
    { ratingValue: '4.8/5', reviewCount: 'many' }, { ratingValue: 8, bestRating: 10, reviewCount: -1 },
    { ratingValue: 6, reviewCount: 1.5 }, { ratingCount: 99 },
  ]) {
    const [result] = parseWebProduct(html({ ...product, aggregateRating }), url, 'SG');
    assert.equal(result.rating, undefined); assert.equal(result.reviews, undefined);
  }
});

test('no script execution, price snippets, commented scripts or hydration guesses', () => {
  for (const markup of [
    '<h1>Sony WF-1000XM6</h1><p>SGD 299 In stock</p>',
    `<script>window.__DATA__=${JSON.stringify(product)}</script>`,
    `<script data-type="application/ld+json">${JSON.stringify(product)}</script>`,
    '<script type="application/ld+json">{broken}</script>',
    '<script type="application/ld+json">process.exit()</script>',
    `<!--${html(product)}-->`,
  ]) assert.deepEqual(parseWebProduct(markup, url, 'SG'), []);
  assert.deepEqual(parseWebProduct(html(product), 'https://127.0.0.1/product', 'SG'), []);
  assert.deepEqual(parseWebProduct(html(product), `${url}?token=secret`, 'SG'), []);
  assert.deepEqual(parseWebProduct(html(Array(20001).fill(null)), url, 'SG'), []);
});

test('expired prices are excluded and non-new conditions are explicitly labelled', () => {
  for (const patch of [
    { priceValidUntil: '2000-01-01' }, { priceValidUntil: 'unknown' },
  ]) assert.deepEqual(parseWebProduct(html({ ...product, offers: { ...offer, ...patch } }), url, 'SG'), []);
  assert.equal(parseWebProduct(html({ ...product, itemCondition: 'UsedCondition' }), url, 'SG')[0]?.priceQuote?.condition,'used');
  for (const [itemCondition, expected] of [['https://schema.org/UsedCondition', 'used'], ['RefurbishedCondition', 'refurbished']]) {
    assert.equal(parseWebProduct(html({ ...product, offers: { ...offer, itemCondition } }), url, 'SG')[0]?.priceQuote?.condition, expected);
  }
  assert.equal(parseWebProduct(html({ ...product, offers: { ...offer, itemCondition: 'NewCondition', priceValidUntil: '2099-12-31' } }), url, 'SG').length, 1);
});

test('product details are extracted from the same page with bounded plain description', () => {
  const [row] = parseWebProduct(html({ ...product, brand: { name: 'Sony' }, model: 'WF-1000XM6',
    description: '<p>Wireless noise cancelling earbuds.</p>' }), url, 'SG');
  assert.deepEqual(row.productDetails, { brand: 'Sony', model: 'WF-1000XM6', description: 'Wireless noise cancelling earbuds.' });
});

test('a separately declared brand remains visible with a short numeric product name', () => {
  const [row] = parseWebProduct(html({ ...product, name: '17', brand: { name: 'Xiaomi' } }), url, 'SG');
  assert.equal(row.title, 'Xiaomi 17');
  assert.equal(row.productDetails?.brand, 'Xiaomi');
  assert.equal(parseWebProduct(html({ ...product, name: 'Xiaomi 17', brand: 'Xiaomi' }), url, 'SG')[0].title, 'Xiaomi 17');
});

test('the primary visible price can qualify a structured offer as a starting price', () => {
  const page = (label: string, heading = product.name, entry = product) => html(entry) +
    `<h1><a>Sony</a><p>${heading}</p></h1><div>${label}</div>`;
  for (const label of ['<span>from</span><span>$399.00</span>', 'Starting at S$399', '起价 SGD 399']) {
    const [row] = parseWebProduct(page(label), url, 'SG');
    assert.equal(row.price, 399);
    assert.deepEqual(row.priceQuote, { kind: 'from', source: 'html', availability: 'in-stock' });
  }
  for (const label of ['Shipping from $399', 'from US$399', 'from $399.95', 'from $3999',
    '<h2>Accessories</h2>from $399', '<template>from $399</template>$399']) {
    assert.notEqual(parseWebProduct(page(label), url, 'SG')[0]?.priceQuote?.kind, 'from', label);
  }
  assert.notEqual(parseWebProduct(page('from $399', 'Related earbuds'), url, 'SG')[0]?.priceQuote?.kind, 'from');
  const sku = url + '?variant=123';
  const selected = { ...product, url: sku, offers: { ...offer, url: sku } };
  assert.notEqual(parseWebProduct(page('from $399', product.name, selected), sku, 'SG')[0]?.priceQuote?.kind, 'from');
});

test('COURTS requires matching product metadata and view-item price instead of a small payment amount', () => {
  const page = 'https://www.courts.com.sg/lg-front-load-washer-and-dryer-13kg%2F8kg-fv1413h2ba-IP174279.html?bvstate=pg%3A2%2Fct%3Ar';
  const canonical = '/lg-front-load-washer-and-dryer-13kg%2F8kg-fv1413h2ba-IP174279.html';
  const name = 'LG Front Load Washer And Dryer (13kg/8kg) FV1413H2BA';
  const tracking = { event:'view_item', ecommerce:{ currency:'SGD', value:'1699.00', items:[{
    item_name:name, item_id:'IP174279', price:'1699.00', quantity:1,
  }] } };
  const markup = `<title>Shop ${name} in Singapore</title><link rel="canonical" href="${canonical}">`
    + `<meta name="description" content="Buy ${name} at COURTS. Price: S$ 1,699.00. Order now!">`
    + `<script>dataLayer.push(${JSON.stringify(tracking)});</script><div>S$ 11 monthly</div>`;
  const [row] = parseWebProduct(markup, page, 'SG');
  assert.equal(row.title, name); assert.equal(row.price, 1699); assert.equal(row.currency, 'SGD');
  assert.equal(row.url, 'https://www.courts.com.sg' + canonical); assert.equal(row.inStock, false);
  assert.deepEqual(row.priceQuote, { kind:'exact', availability:'unknown', source:'html' });

  for (const invalid of [
    markup.replace('Price: S$ 1,699.00', 'Price: S$ 11.00'),
    markup.replace('"value":"1699.00"', '"value":"11.00"'),
    markup.replace('"item_id":"IP174279"', '"item_id":"IP999999"'),
    markup.replace(`Shop ${name}`, 'Shop another appliance'),
  ]) assert.deepEqual(parseWebProduct(invalid, page, 'SG'), []);
});
