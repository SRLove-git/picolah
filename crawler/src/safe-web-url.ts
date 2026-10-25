import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const PRIVATE_HOST_SUFFIXES = ['localhost', 'local', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'corp', 'private', 'test', 'invalid', 'example', 'onion', 'arpa'];

function sensitiveParameter(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /(?:token|secret|password|passwd|credential|signature|authorization|cookie|session)/.test(normalized)
    || /^(?:auth|apikey|key|pwd|sid|sig|jwt|code|ticket|accesskey|securitykey)$/.test(normalized)
    || /^(?:xamz|xgoog)/.test(normalized);
}

/** Syntactic validation only. Call assertPublicWebUrl before any network request. */
export function safeWebUrl(value: string): URL | null {
  if (typeof value !== 'string' || value.length > 4000 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    // URL normalizes explicit :443 away, so inspect the original authority as well.
    const authority = value.match(/^https:\/\/([^/?#]+)/i)?.[1];
    if (url.protocol !== 'https:' || !authority || authority.includes(':') || url.username || url.password || url.port) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname.endsWith('.') || isIP(hostname.replace(/^\[|\]$/g, '')) || !hostname.includes('.')) return null;
    if (!hostname.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return null;
    if (PRIVATE_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) return null;
    for (const key of url.searchParams.keys()) if (sensitiveParameter(key)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

function publicIPv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const parts = address.split('.').map(Number);
  const value = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const forbidden: Array<[number, number]> = [
    [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8],
    [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
    [0xc0586300, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24],
    [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
  ];
  return !forbidden.some(([network, bits]) => (value >>> (32 - bits)) === (network >>> (32 - bits)));
}

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) return publicIPv4(address);
  if (isIP(address) !== 6 || address.includes('%') || address.includes('.')) return false;
  const halves = address.toLowerCase().split('::');
  const start = halves[0] ? halves[0].split(':') : [];
  const end = halves.length > 1 && halves[1] ? halves[1].split(':') : [];
  const words = halves.length > 1 ? [...start, ...Array(8 - start.length - end.length).fill('0'), ...end] : start;
  if (words.length !== 8) return false;
  const [first, second] = words.map((part) => parseInt(part, 16));
  // Only ordinary global-unicast IPv6. This also excludes all IPv4-mapped,
  // NAT64, loopback, link-local, ULA and multicast ranges, even in hex form.
  if (first < 0x2000 || first > 0x3fff) return false;
  if (first === 0x2001 && (second < 0x0200 || second === 0x0db8)) return false;
  if (first === 0x2002 || (first === 0x3fff && second < 0x1000)) return false;
  return true;
}

export type WebDnsLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: number }>>;

/** Reject the whole resolution if *any* address is private or otherwise non-public. */
export async function assertPublicWebUrl(value: string, lookupImpl: WebDnsLookup = lookup): Promise<URL> {
  const url = safeWebUrl(value);
  if (!url) throw Object.assign(new Error('Unsafe product URL'), { code: 'UNSAFE_WEB_URL' });
  let addresses: Awaited<ReturnType<WebDnsLookup>>;
  try { addresses = await lookupImpl(url.hostname, { all: true, verbatim: true }); }
  catch { throw Object.assign(new Error('Product host DNS lookup failed'), { code: 'WEB_DNS_FAILED' }); }
  if (!addresses.length || addresses.some(({ address, family }) => ![4, 6].includes(family)
    || isIP(address) !== family || !publicAddress(address))) {
    throw Object.assign(new Error('Product host does not resolve exclusively to public addresses'), { code: 'UNSAFE_WEB_URL' });
  }
  return url;
}
