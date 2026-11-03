import { useState } from 'react';
import type { CatalogProduct } from '../lib/api';
import idle from '../assets/capy-actions-v1/idle.webp';

const artwork = import.meta.glob<string>('../assets/discover-capy-v2/*.webp', {
  eager: true, query: '?url', import: 'default',
});

/** Each scene is fitted from this product's actual model/color photograph. */
export function DiscoverProductArt({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) {
  // Unknown products keep the neutral mascot rather than borrowing another model.
  const source = artwork[`../assets/discover-capy-v2/${product.id}.webp`] ?? idle;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <img className="discover-capy-art" data-product-art={product.id}
    src={failedSource === source ? idle : source} alt="" aria-hidden="true"
    width={640} height={680} loading={priority ? 'eager' : 'lazy'} decoding="async"
    onError={() => setFailedSource(source)} draggable={false} />;
}
