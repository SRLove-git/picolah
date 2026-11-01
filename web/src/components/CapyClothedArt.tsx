import { useEffect, useId, useState, type ReactNode } from 'react';
import type { CapyClothingId } from '../../shared/capybara';
import { CAPY_CLOTHING_ART, CAPY_CLOTHING_FACE } from '../lib/capy-clothing';
import type { CapyExpression } from './CapyExpressionArt';

/** The static/reduced-motion version of the same complete outfit used by the rig. */
export function CapyClothedArt({ clothing, expression, artwork, fallback }: {
  clothing: CapyClothingId; expression: CapyExpression; artwork: Record<CapyExpression, string>; fallback: ReactNode;
}) {
  const uid = useId();
  const [loaded, setLoaded] = useState(false);
  const [faces, setFaces] = useState<Partial<Record<CapyExpression, boolean>>>({});
  useEffect(() => {
    let disposed = false;
    // Cached SVG <image> load events can be missed after a mobile reload.
    // Decode through HTMLImageElement so fallback readiness is deterministic.
    function decode(src: string, ready: () => void) {
      const image = new Image();
      image.src = src;
      void image.decode().then(() => { if (!disposed) ready(); }).catch(() => { /* Keep the loaded fallback. */ });
    }
    decode(CAPY_CLOTHING_ART[clothing], () => setLoaded(true));
    for (const [name, src] of Object.entries(artwork) as [CapyExpression, string][]) {
      if (name !== 'idle') decode(src, () => setFaces((current) => ({ ...current, [name]: true })));
    }
    return () => { disposed = true; };
  }, [clothing, artwork]);
  const mask = `capy-face-${uid}`, gradient = `capy-feather-${uid}`;
  const { x, y, rx, ry, solid } = CAPY_CLOTHING_FACE;
  const visible = faces[expression] ? expression : 'idle';
  return <span className="pc-capy-expressions pc-capy-dressed" data-visible-expression={visible}>
    {!loaded && fallback}
    <svg viewBox="0 0 768 804" aria-hidden="true" style={{ visibility: loaded ? 'visible' : 'hidden' }}>
      <defs>
        <radialGradient id={gradient} gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"
          gradientTransform={`translate(${x} ${y}) scale(${rx} ${ry})`}>
          <stop offset={solid} stopColor="white" /><stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="768" height="804" style={{ maskType: 'alpha' }}>
          <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${gradient})`} />
        </mask>
      </defs>
      <g data-wearable={clothing} data-art="fitted-character">
        <image href={CAPY_CLOTHING_ART[clothing]} width="768" height="804" preserveAspectRatio="none"
          onError={() => setLoaded(false)} />
      </g>
      <g mask={`url(#${mask})`}>
        {(Object.entries(artwork) as [CapyExpression, string][]).filter(([name]) => name !== 'idle').map(([name, src]) => (
          <image key={name} href={src} width="768" height="804" preserveAspectRatio="none"
            className={`pc-capy-face-patch ${name === visible ? 'is-visible' : ''}`}
            onError={() => setFaces((current) => ({ ...current, [name]: false }))} />
        ))}
      </g>
    </svg>
  </span>;
}
