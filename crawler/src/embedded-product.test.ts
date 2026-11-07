import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyProductPage } from './verify-product-page.ts';
import { parseWebProduct } from './platforms/web-product.ts';

const page = 'https://shop.example.sg/product/test';
const micro = `<div itemscope itemtype=http://schema.org/Product>
  <meta itemprop=name content="Example Test"><meta itemprop=sku content=AB-12>
  <div itemprop=offers itemscope itemtype="https://schema.org/Offer">
    <meta itemprop=url content=${page}><meta itemprop=price content=4.80>
    <meta itemprop=priceCurrency content=SGD><meta itemprop=availability content=http://schema.org/InStock>
  </div><div itemscope itemtype=http://schema.org/Review><meta itemprop=url content=/reviews></div>
</div><h1>Example Test</h1>`;
test('compact Product and Offer metadata bind a price to the visible product only', () => {
  const read = (html: string) => parseWebProduct(html,page,'SG');
  assert.deepEqual(read(micro).map(row=>[row.title,row.price,row.currency,row.inStock]),[['Example Test',4.8,'SGD',true]]);
  for (const html of [micro.replace('SGD','USD'),micro.replace('<h1>Example Test','<h1>Other Test'),
    micro.replace('content='+page,'content='+page+'-other'),micro.replace('content=4.80','content=4.80><meta itemprop=price content=3'),
    micro.replace('itemprop=offers','itemprop=review'),micro.replace('content=4.80','content=4.80><meta itemprop=priceValidUntil content=2001-01-01'),
    micro+'<div itemscope itemtype=http://schema.org/Product></div>',micro.replace('itemprop=name','data-itemprop=name'),
    '<template>'+micro+'</template><h1>Example Test</h1>']) assert.equal(read(html).length,0);
});

test('a Shopify selected variant resolves only its own same-page SKU, option and amount', () => {
  const url='https://shop.sg.canon/products/test';
  const selected = {id:101,sku:'C-101',title:'Body only',price:9900,available:false};
  const first = {'@type':'Offer',sku:'C-101',price:99,priceCurrency:'SGD',availability:'https://schema.org/OutOfStock',url:url+'?variant=101'};
  const second = {...first,sku:'C-102',price:149,url:url+'?variant=102'};
  const read = (v:typeof selected, o=first, at=url) => parseWebProduct(
    '<link rel=canonical href="'+url+'"><h1>Example R10</h1><script type="application/json" data-selected-variant>'+JSON.stringify(v)+'</script>'+
    '<script type="application/ld+json">'+JSON.stringify({'@type':'Product',url,name:'Example R10',offers:[o,second]})+'</script>',at,'SG');
  assert.deepEqual(read(selected).map(r=>[r.title,r.price,r.url,r.priceQuote?.availability,r.priceQuote?.variant]),
    [['Example R10 - Body only',99,first.url,'out-of-stock','C-101']]);
  assert.deepEqual(read(selected,first,first.url).map(r=>r.url),[first.url]);
  for (const rows of [read({...selected,sku:'OTHER'}),read({...selected,id:102}),read({...selected,price:14900}),
    read({...selected,available:true}),read(selected,{...first,url:'https://other.sg/products/test?variant=101'}),
    read(selected,{...first,url:url+'-accessory?variant=101'}),read(selected,first,url+'?variant=102')]) assert.equal(rows.length,0);
});

test('classified prices retain the seller condition and ignore unrelated listings', async () => {
  const url='https://www.carousell.sg/p/example-r10-123', title='Canon EOS R10 Camera';
  for (const [field, expected] of [['状况良好','used'],['全新','new'],['未说明',undefined]] as const) {
    const content='# '+title+'\n\n### S$900\n\n商品状况\n\n'+field+'\n\n浏览卖家页面\n商品状况\n全新';
    const rows=await verifyProductPage(url,{query:'Canon EOS R10',market:'SG'},async()=>({format:'markdown',title,content}));
    assert.equal(rows.length,1); assert.equal(rows[0].priceQuote?.condition,expected);
    if (!expected) assert.match(rows[0].priceQuote?.note ?? '', /成色未核实/);
  }
});
