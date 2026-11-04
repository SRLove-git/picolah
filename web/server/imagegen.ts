import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.ts';

/**
 * AI try-on: compose a real product photo onto Picolah's capybara.
 *
 * Providers are interchangeable and selected with IMAGE_PROVIDER (or the
 * first one with a key). Every provider receives the capybara reference art
 * plus, when available, the marketplace product photo.
 */
export type ImageProviderId = 'gemini' | 'openai' | 'dashscope';

export interface TryOnInput {
  name: string;
  brand?: string;
  category?: string;
  productImageUrl?: string;
}

export interface TryOnImage {
  bytes: Buffer;
  mime: string;
  provider: ImageProviderId;
}

const here = dirname(fileURLToPath(import.meta.url));
/** Capybara brand art copied next to the server so Docker images carry it. */
export const capyBasePath = join(here, 'imagegen', 'capy-base.webp');

export function providerIds(): ImageProviderId[] {
  return ['gemini', 'openai', 'dashscope'];
}

export function providerConfigured(id: ImageProviderId): boolean {
  const gen = config.imagegen;
  if (!gen.enabled) return false;
  if (id === 'gemini') return Boolean(gen.geminiKey);
  if (id === 'openai') return Boolean(gen.openaiKey);
  return Boolean(gen.dashscopeKey);
}

/** Explicit IMAGE_PROVIDER wins; otherwise first provider with a key. */
export function activeProvider(): ImageProviderId | '' {
  const requested = config.imagegen.provider;
  if (requested && providerIds().includes(requested as ImageProviderId)) {
    const id = requested as ImageProviderId;
    return providerConfigured(id) ? id : '';
  }
  return providerIds().find(providerConfigured) ?? '';
}

export function imagegenConfigured(): boolean {
  return Boolean(activeProvider());
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

function extensionFor(mime: string): string {
  if (/jpe?g/.test(mime)) return 'jpg';
  if (/webp/.test(mime)) return 'webp';
  return 'png';
}

export function mediaExtension(mime: string): string {
  return extensionFor(mime);
}

/** Marketplace CDNs often 403 unknown UAs and hotlinks. Keep this short. */
async function downloadProductImage(url: string | undefined): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
        accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(Math.min(15_000, config.imagegen.timeoutMs)),
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const type = (response.headers.get('content-type') || '').toLowerCase();
    if (!/^image\//.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) return null;
    return { bytes, mime: type.split(';')[0] || 'image/jpeg' };
  } catch {
    return null;
  }
}

function promptFor(input: TryOnInput, hasProductPhoto: boolean): string {
  const product = [input.brand, input.name].filter(Boolean).join(' ');
  const usage = input.category
    ? `Use it the way someone would use a ${input.category}: wear it, hold it, or place it naturally in the scene.`
    : 'Wear it, hold it, or use it naturally in the scene.';
  return [
    'Edit the provided images into one square product photograph.',
    'Image 1 is the capybara mascot of Picolah: keep its face, fur, body proportions, plush style and lighting exactly the same; do not redraw the character.',
    hasProductPhoto
      ? `Image 2 is the real product: ${product}. Reproduce the product faithfully, including its real colours, materials, logos, shape and details.`
      : `The product is: ${product}. Draw this product faithfully from its real-world design, including colours and details.`,
    `Place the product on the capybara: ${usage}`,
    'Match perspective, scale, shadows and reflections so the product looks physically worn or held, not pasted on.',
    'Cute, warm, premium studio look with a soft pastel background that suits the product. Square 1:1 composition. No text, no watermark, no extra characters, no distorted logos.',
  ].join(' ');
}

async function loadCapyBase(): Promise<Buffer> {
  return readFile(capyBasePath);
}

async function callGemini(prompt: string, capy: Buffer, product: { bytes: Buffer; mime: string } | null): Promise<TryOnImage> {
  const gen = config.imagegen;
  const parts: Array<Record<string, unknown>> = [
    { text: prompt },
    { inlineData: { mimeType: 'image/webp', data: capy.toString('base64') } },
  ];
  if (product) parts.push({ inlineData: { mimeType: product.mime, data: product.bytes.toString('base64') } });

  const response = await fetch(
    `${gen.geminiBaseUrl}/v1beta/models/${encodeURIComponent(gen.geminiModel)}:generateContent?key=${encodeURIComponent(gen.geminiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
      signal: AbortSignal.timeout(gen.timeoutMs),
    },
  );
  if (!response.ok) throw new Error(`gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }>;
  };
  const inline = body.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error('gemini returned no image');
  return {
    bytes: Buffer.from(inline.data, 'base64'),
    mime: inline.mimeType || 'image/png',
    provider: 'gemini',
  };
}

async function callOpenai(prompt: string, capy: Buffer, product: { bytes: Buffer; mime: string } | null): Promise<TryOnImage> {
  const gen = config.imagegen;
  const form = new FormData();
  form.append('model', gen.openaiModel);
  form.append('prompt', prompt);
  form.append('size', '1024x1024');
  form.append('quality', 'medium');
  form.append('n', '1');
  form.append('image[]', new Blob([new Uint8Array(capy)], { type: 'image/webp' }), 'capybara.webp');
  if (product) form.append('image[]', new Blob([new Uint8Array(product.bytes)], { type: product.mime }), 'product');

  const response = await fetch(`${gen.openaiBaseUrl}/images/edits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${gen.openaiKey}` },
    body: form,
    signal: AbortSignal.timeout(gen.timeoutMs),
  });
  if (!response.ok) throw new Error(`openai ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as { data?: Array<{ b64_json?: string }> };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error('openai returned no image');
  return { bytes: Buffer.from(b64, 'base64'), mime: 'image/png', provider: 'openai' };
}

async function callDashscope(prompt: string, capy: Buffer, product: { bytes: Buffer; mime: string } | null): Promise<TryOnImage> {
  const gen = config.imagegen;
  const content: Array<Record<string, unknown>> = [
    { image: `data:image/webp;base64,${capy.toString('base64')}` },
  ];
  if (product) content.push({ image: `data:${product.mime};base64,${product.bytes.toString('base64')}` });
  content.push({ text: prompt });

  const response = await fetch(`${gen.dashscopeBaseUrl}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${gen.dashscopeKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: gen.dashscopeModel,
      input: { messages: [{ role: 'user', content }] },
      parameters: { negative_prompt: '', watermark: false },
    }),
    signal: AbortSignal.timeout(gen.timeoutMs),
  });
  if (!response.ok) throw new Error(`dashscope ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json() as {
    output?: { choices?: Array<{ message?: { content?: Array<{ image?: string }> } }> };
  };
  const url = body.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!url) throw new Error('dashscope returned no image');
  if (url.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(url);
    if (!match) throw new Error('dashscope returned an unreadable image');
    return { bytes: Buffer.from(match[2], 'base64'), mime: match[1], provider: 'dashscope' };
  }
  const fetched = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!fetched.ok) throw new Error(`dashscope image download ${fetched.status}`);
  return {
    bytes: Buffer.from(await fetched.arrayBuffer()),
    mime: (fetched.headers.get('content-type') || 'image/png').split(';')[0],
    provider: 'dashscope',
  };
}

/** Runs the configured provider. Throws when generation is unavailable. */
export async function generateTryOn(input: TryOnInput): Promise<TryOnImage> {
  const provider = activeProvider();
  if (!provider) throw new Error('IMAGE_GEN_NOT_CONFIGURED');
  const [capy, product] = await Promise.all([loadCapyBase(), downloadProductImage(input.productImageUrl)]);
  const prompt = promptFor(input, Boolean(product));
  if (provider === 'gemini') return callGemini(prompt, capy, product);
  if (provider === 'openai') return callOpenai(prompt, capy, product);
  return callDashscope(prompt, capy, product);
}
