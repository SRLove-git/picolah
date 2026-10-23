import type { Page } from 'playwright-core';
import { withBrowserPage } from '../brightdata/scraping-browser.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import { findPrice } from '../money.ts';
import type { RawListing } from '../types.ts';
import type { PlatformAdapter } from './types.ts';

interface ShopeeItemBasic {
  itemid?: number | string;
  shopid?: number | string;
  name?: string;
  price?: number;
  price_min?: number;
  item_rating?: { rating_star?: number; rating_count?: number[] };
  historical_sold?: number;
  shop_location?: string;
  shop_name?: string;
  is_official_shop?: boolean;
}

interface ShopeeSearchPayload {
  items?: Array<{
    item_basic?: ShopeeItemBasic;
    itemid?: number | string;
    shopid?: number | string;
    name?: string;
    price?: number;
    item_rating?: { rating_star?: number; rating_count?: number[] };
    shop_location?: string;
    is_official_shop?: boolean;
  }>;
}

export function shopeeSearchUrl(market: MarketCode, query: string): string {
  const domain = MARKETS[market].domains.shopee;
  if (!domain) throw new Error(`Shopee 不支持市场 ${market}`);
  return `https://${domain}/search?keyword=${encodeURIComponent(query)}`;
}

const PRICE_SCALE = 100_000;

function toAmount(value: number | undefined): number | undefined {
  if (!Number.isFinite(value) || !value) return undefined;
  return Math.round((value as number) / PRICE_SCALE);
}

function normalizeItem(raw: ShopeeItemBasic | undefined): ShopeeItemBasic | null {
  if (!raw) return null;
  if (raw.itemid === undefined || !raw.name) return null;
  return raw;
}

/** Parse the JSON returned by /api/v4/search/search_items (or a saved copy). */
export function parseShopeeSearchPayload(payload: ShopeeSearchPayload, market: MarketCode): RawListing[] {
  const marketConfig = MARKETS[market];
  const domain = marketConfig.domains.shopee || `shopee.${market.toLowerCase()}`;
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  for (const entry of payload.items ?? []) {
    const item = normalizeItem(entry.item_basic ?? entry);
    if (!item) continue;
    const itemId = String(item.itemid);
    if (seen.has(itemId)) continue;
    seen.add(itemId);

    const amount = toAmount(item.price ?? item.price_min);
    if (!amount) continue;

    const rating = Number(item.item_rating?.rating_star);
    const reviews = Number(item.item_rating?.rating_count?.[0]);
    const shopId = item.shopid ?? entry.shopid;

    listings.push({
      platform: 'shopee',
      market,
      itemId,
      title: item.name!.trim(),
      url: shopId
        ? `https://${domain}/product/${shopId}/${itemId}`
        : `https://${domain}/product/${itemId}`,
      price: amount,
      currency: marketConfig.currency,
      rating: Number.isFinite(rating) && rating > 0 ? rating : undefined,
      reviews: Number.isFinite(reviews) && reviews > 0 ? reviews : undefined,
      seller: item.shop_name?.trim() || 'Shopee',
      location: item.shop_location?.trim(),
      isOfficial: Boolean(item.is_official_shop),
      inStock: true,
    });
  }

  return listings;
}

interface DomAnchor {
  href: string;
  text: string;
}

/**
 * DOM fallback: Shopee product links are stable (/product/<shopid>/<itemid>),
 * so we read the card text under each link instead of hashed class names.
 */
async function parseShopeeDom(page: Page, market: MarketCode): Promise<RawListing[]> {
  const anchors = await page.evaluate<DomAnchor[]>(() => {
    const seen = new Set<string>();
    const rows: { href: string; text: string }[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/product/"]'))) {
      const href = element.href;
      const match = href.match(/\/product\/(\d+)\/(\d+)/);
      if (!match || seen.has(match[2])) continue;
      seen.add(match[2]);
      const text = (element.innerText || '').trim();
      if (text) rows.push({ href, text });
    }
    return rows;
  });

  const marketConfig = MARKETS[market];
  const currencyPattern = /(?:S\$|RM|Rp|฿|₱|\$|₫)\s?[\d.,]+/i;
  const listings: RawListing[] = [];

  for (const anchor of anchors) {
    const itemId = anchor.href.match(/\/product\/(\d+)\/(\d+)/)?.[2];
    if (!itemId) continue;
    const lines = anchor.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const priceLine = lines.find(
      (line) => currencyPattern.test(line) && !/%/.test(line) && !/\d\s?x\b/i.test(line) && !/per month/i.test(line),
    );
    if (!priceLine) continue;
    const price = findPrice(priceLine, marketConfig.decimals);
    if (price === null) continue;
    const title = lines
      .filter((line) => line !== priceLine)
      .filter((line) => !/^\d+(\.\d+)?k? sold$/i.test(line))
      .filter((line) => !/^free shipping$/i.test(line))
      .sort((a, b) => b.length - a.length)[0];
    if (!title) continue;

    listings.push({
      platform: 'shopee',
      market,
      itemId,
      title,
      url: anchor.href,
      price,
      currency: marketConfig.currency,
      seller: 'Shopee',
      inStock: true,
    });
  }

  return listings;
}

/**
 * Shopee is a heavy SPA. Prefer the search API response captured from the
 * rendered page; fall back to DOM text. This path needs the Scraping Browser
 * zone (IP allowlist) and is marked experimental until verified per market.
 */
export async function searchShopee(market: MarketCode, query: string): Promise<RawListing[]> {
  const url = shopeeSearchUrl(market, query);
  const listings = await withBrowserPage(async (page) => {
    const captured: RawListing[] = [];
    page.on('response', (response) => {
      if (!response.url().includes('/api/v4/search/search_items')) return;
      response
        .json()
        .then((payload: unknown) => {
          captured.push(...parseShopeeSearchPayload(payload as ShopeeSearchPayload, market));
        })
        .catch(() => {});
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    if (!response) throw new Error('Shopee 搜索页没有返回响应');

    await page.waitForTimeout(7_000);
    if (!captured.length) {
      await page.waitForSelector('a[href*="/product/"]', { timeout: 15_000 }).catch(() => {});
      for (let index = 0; index < 3; index += 1) {
        await page.mouse.wheel(0, 2_000);
        await page.waitForTimeout(1_000);
      }
    }

    const title = await page.title();
    const body = await page.content();
    if (!captured.length && /captcha|verify|are you a robot|unusual traffic/i.test(`${title} ${body.slice(0, 2_000)}`)) {
      throw new Error(`Shopee 返回了验证页（${title}）。Bright Data 的浏览器会话可能需要重试或更换出口 IP。`);
    }

    if (captured.length) return captured;

    const domListings = await parseShopeeDom(page, market);
    if (!domListings.length) {
      console.warn(`[crawler] shopee ${market} 未解析到商品：title="${title}" url=${page.url()}`);
    }
    return domListings;
  });

  const unique = [...new Map(listings.map((listing) => [listing.itemId, listing])).values()];
  console.log(`[crawler] shopee ${market} "${query.slice(0, 60)}" -> ${unique.length} listings`);
  return unique;
}

export const shopeeAdapter: PlatformAdapter = {
  id: 'shopee',
  experimental: true,
  search: searchShopee,
};
