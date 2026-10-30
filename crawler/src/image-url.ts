import { safeWebUrl } from './safe-web-url.ts';

/** Read the first public HTTPS image URL exposed by a marketplace payload. */
export function extractImageUrl(value: unknown, base?: string): string | undefined {
  const queue: unknown[] = [value];
  for (let index = 0; index < queue.length && index < 12; index += 1) {
    const current = queue[index];
    if (Array.isArray(current)) {
      queue.push(...current.slice(0, 8));
      continue;
    }
    if (current && typeof current === 'object') {
      const image = current as Record<string, unknown>;
      queue.push(image.url, image.contentUrl, image.imageUrl, image.src);
      continue;
    }
    if (typeof current !== 'string') continue;
    const raw = current.trim();
    if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) continue;
    try {
      const absolute = new URL(raw.startsWith('//') ? `https:${raw}` : raw, base).href;
      const safe = safeWebUrl(absolute);
      if (safe) return safe.href;
    } catch {
      // Keep looking when a provider exposes several image candidates.
    }
  }
  return undefined;
}
