import { createHash } from 'node:crypto';
import { decodeAmazonHtml } from './amazon-sg.ts';
import { MARKETS, type MarketCode } from '../markets.ts';
import type { WebListing } from '../types.ts';

const attr = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'));
  return match ? decodeAmazonHtml(match[1] ?? match[2]) : '';
};
const visible = (html: string) => decodeAmazonHtml(html.replace(/<[^>]*>/g, ' '));
type Element = { tag: string; body: string };

// Balanced elements keep prices and inventory inside the selected buy box.
function elements(html: string, select: (tag: string) => boolean): Element[] {
  const result: Element[] = [];
  const tokens = [...html.matchAll(/<\/?[a-z][\w-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token[0].startsWith('</') || !select(token[0])) continue;
    const name = token[0].match(/^<([\w-]+)/)![1].toLowerCase();
    if (/^(?:input|img|link|meta|br|hr)$/.test(name)) { result.push({ tag: token[0], body: '' }); continue; }
    let depth = 1;
    for (let j = i + 1; j < tokens.length; j++) {
      const next = tokens[j][0];
      if (next.match(/^<\/?([\w-]+)/)![1].toLowerCase() !== name) continue;
      depth += next.startsWith('</') ? -1 : 1;
      if (!depth) {
        result.push({ tag: token[0], body: html.slice(token.index! + token[0].length, tokens[j].index) });
        break;
      }
    }
  }
  return result;
}
function one(html: string, id: string, tag?: string): Element | undefined {
  const found = elements(html, (opening) => attr(opening, 'id') === id && (!tag || opening.startsWith(`<${tag} `)));
  return found.length === 1 ? found[0] : undefined;
}

/** Primary new-product offer only. Recommendations, used offers and list prices are excluded. */
export function parseAmazonProduct(html: string, page: URL, market: MarketCode, geography?: 'global'): WebListing[] {
  const host = page.hostname.replace(/^www\./, '');
  const currency = ({ 'amazon.com': 'USD', 'amazon.sg': 'SGD', 'amazon.co.uk': 'GBP' } as Record<string, string>)[host];
  const asin = page.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase();
  if (!currency || !asin || (geography !== 'global' && currency !== MARKETS[market].currency)
    || [...page.searchParams].some(([key, value]) => /condition/i.test(key) && !/^new$/i.test(value))) return [];
  const clean = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  for (const link of elements(clean, (tag) => tag.startsWith('<link ') && attr(tag, 'rel') === 'canonical')) {
    try {
      const target = new URL(attr(link.tag, 'href'), page);
      if (target.hostname.replace(/^www\./, '') !== host || target.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1].toUpperCase() !== asin) return [];
    } catch { return []; }
  }
  const primaryTitle = visible(one(clean, 'productTitle', 'span')?.body ?? '');
  // Amazon may put the complete model in the visible title differentiator.
  // Bind it to the primary title container, never recommendations or body text.
  const heading = one(clean, 'title_feature_div');
  const subtitles = elements(heading?.body ?? '', tag => attr(tag, 'class').split(/\s+/).includes('dp-title-differentiators'));
  if (subtitles.length > 1) return [];
  const subtitle = subtitles.length ? visible(subtitles[0].body) : '';
  if (subtitle.length > 500) return [];
  const title = primaryTitle + (subtitle ? ' | ' + subtitle : '');
  const box = one(clean, 'newAccordionRow_0');
  const priceNodes = (fragment: string) => elements(fragment, tag => attr(tag, 'id') === 'corePriceDisplay_desktop_feature_div')
    .filter(node => elements(node.body, tag => attr(tag, 'class').split(/\s+/).includes('priceToPay')).length > 0);
  const selectedPrices = priceNodes(box?.body ?? '');
  const usedBoxes = elements(clean, tag => /^usedAccordionRow/.test(attr(tag, 'id')));
  const primaryPrices = selectedPrices.length ? selectedPrices
    : priceNodes(clean).filter(node => !usedBoxes.some(used => used.body.includes(node.body)));
  const primary = primaryPrices.length === 1 ? primaryPrices[0] : undefined;
  const selectedAmounts = elements(box?.body ?? '', tag => attr(tag, 'class').split(/\s+/).includes('apex-pricetopay-value'));
  if (selectedAmounts.length > 1) return [];
  const selectedAmount = selectedAmounts[0];
  const currencies = elements(clean, (tag) => tag.startsWith('<input ') && attr(tag, 'name') === 'currencyOfPreference');
  if (!primaryTitle || /\b(?:renewed|refurbished|used)\b/i.test(title) || !box || (!primary && !selectedAmount)
    || !attr(box.tag, 'class').split(/\s+/).includes('a-accordion-active')
    || (!selectedAmount && attr(primary!.tag, 'data-csa-c-asin') !== asin)
    || (currencies.length ? currencies.length !== 1 || attr(currencies[0].tag, 'value') !== currency : currency !== 'GBP')
    || attr(one(box.body, 'ASIN', 'input')?.tag ?? '', 'value') !== asin
    || !one(box.body, 'add-to-cart-button') || !/^in stock\b/i.test(visible(one(box.body, 'availability')?.body ?? ''))) return [];
  const prices = selectedAmount ? [selectedAmount] : elements(primary!.body, (tag) => attr(tag, 'class').split(/\s+/).includes('priceToPay'));
  if (prices.length !== 1) return [];
  const pricePart = (name: string) => elements(prices[0].body, (tag) => attr(tag, 'class').split(/\s+/).includes(name));
  const whole = pricePart('a-price-whole'), fraction = pricePart('a-price-fraction'), symbol = pricePart('a-price-symbol');
  if (whole.length !== 1 || fraction.length !== 1 || symbol.length !== 1) return [];
  const w = visible(whole[0].body).replace(/\s/g, ''), f = visible(fraction[0].body), s = visible(symbol[0].body);
  if (!/^(?:\d{1,3}(?:,\d{3})*|\d+)\.$/.test(w) || !/^\d{2}$/.test(f) || !(currency === 'GBP' ? ['£'] : currency === 'USD' ? ['$', 'US$'] : ['S$', '$']).includes(s)) return [];
  const price = Number(w.replace(/,/g, '') + f);
  if (!Number.isFinite(price) || price <= 0 || price >= 1e9) return [];
  const url = `https://www.${host}/dp/${asin}`;
  return [{ platform: 'web', sourceHost: host, market, itemId: createHash('sha256').update(url).digest('hex'), title, url,
    price, currency, inStock: true, seller: host }];
}
