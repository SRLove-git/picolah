import type { WebSearchCandidate } from './brightdata/serp.ts';
import type { MarketCode } from './markets.ts';
import { assertPublicWebUrl, safeWebUrl } from './safe-web-url.ts';

const shops = ['online.challenger.sg', 'owalalife.sg'] as const;
type Shop = typeof shops[number];

export function singaporeShops(query: string, market: MarketCode): Shop[] {
  if (market !== 'SG') return [];
  return /\bowala\b|\bfreesip\b/i.test(query) ? ['owalalife.sg'] : ['online.challenger.sg'];
}

async function fetchMerchantBody(url: URL, accept: string, maxBytes: number, fetchImpl: typeof fetch): Promise<string | undefined> {
  await assertPublicWebUrl(url.href);
  const response = await fetchImpl(url, {redirect:'error',signal:AbortSignal.timeout(6500),headers:{accept}});
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes(accept)) {
    await response.body?.cancel(); return;
  }
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    length += chunk.length;
    if (length > maxBytes) return;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Fetch the selected public retail page only from this fixed origin; never follow a redirect. */
export async function selectedMerchantHtml(value: string, market: MarketCode): Promise<string | undefined> {
  const page = safeWebUrl(value);
  if (market!=='SG' || page?.origin!=='https://owalalife.sg' || !/^\/products\/[^/]+\/?$/.test(page.pathname)
    || page.searchParams.getAll('variant').length!==1 || !/^\d+$/.test(page.searchParams.get('variant') || '')) return;
  return fetchMerchantBody(page,'text/html',6_000_000,fetch);
}

// Merchant-native suggestions provide candidate URLs only. All prices still come from verifying the detail page.
export async function searchMerchant(shop: Shop, query: string, fetchImpl = fetch): Promise<WebSearchCandidate[]> {
  const endpoint = new URL('/search/suggest.json', 'https://' + shop);
  endpoint.search = new URLSearchParams({ q:query, 'resources[type]':'product', 'resources[limit]':'8' }).toString();
  const json = await fetchMerchantBody(endpoint,'application/json',512_000,fetchImpl);
  if (!json) return [];
  const data = JSON.parse(json);
  const products = data?.resources?.results?.products;
  if (!Array.isArray(products)) return [];
  return products.slice(0,8).flatMap(product => {
    if (typeof product?.url !== 'string' || !product.url.startsWith('/products/') || typeof product.title !== 'string') return [];
    const url = safeWebUrl(new URL(product.url, endpoint).href);
    if (!url || url.origin !== endpoint.origin || !/^\/products\/[^/]+\/?$/.test(url.pathname)) return [];
    const variants = url.searchParams.getAll('variant');
    if (variants.length && (variants.length !== 1 || !/^\d+$/.test(variants[0]))) return [];
    url.search = '';
    if (variants.length) url.searchParams.set('variant',variants[0]);
    const option = variants.length && Array.isArray(product.variants)
      ? product.variants.find((v:{id?:number|string})=>String(v?.id)===variants[0]) : undefined;
    const title = [product.vendor,product.title,option?.title].filter(v=>typeof v==='string').join(' ').trim();
    return title && title.length<=1000 ? [{url:url.href,title}] : [];
  });
}
