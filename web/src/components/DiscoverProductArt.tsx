import { useState } from 'react';
import type { CatalogProduct } from '../lib/api';
import { discoverScene } from '../lib/discover-art';
import idle from '../assets/capy-actions-v1/idle.webp';

const artwork = import.meta.glob<string>('../assets/discover-capy-v1/*.webp', {
  eager: true, query: '?url', import: 'default',
});

/** Baked, properly fitted try-on art keeps a full catalog lightweight. */
export function DiscoverProductArt({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) {
  const scene = discoverScene(product);
  const source = artwork[`../assets/discover-capy-v1/${scene}.webp`] ?? idle;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <img className="discover-capy-art" data-scene={scene}
    src={failedSource === source ? idle : source} alt="" aria-hidden="true"
    width={640} height={680} loading={priority ? 'eager' : 'lazy'} decoding="async"
    onError={() => setFailedSource(source)} draggable={false} />;
}
