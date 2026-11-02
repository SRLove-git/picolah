import { useState } from 'react';
import type { CapyClothingId } from '../../shared/capybara';
import { CapyClothedArt } from './CapyClothedArt';
import { CAPY_EXPRESSION_ART, type CapyExpression } from '../lib/capy-face';
export { CAPY_EXPRESSION_ART, type CapyExpression } from '../lib/capy-face';
const idle = CAPY_EXPRESSION_ART.idle;

/** Keep the previous frame visible until the next expression has loaded. */
export function CapyExpressionArt({ expression, clothing }: { expression?: CapyExpression; clothing?: CapyClothingId }) {
  const [loaded, setLoaded] = useState<Partial<Record<CapyExpression, boolean>>>({ idle: true });
  if (clothing) return <CapyClothedArt key={clothing} clothing={clothing} expression={expression ?? 'idle'} artwork={CAPY_EXPRESSION_ART} fallback={<CapyExpressionArt expression={expression} />} />;
  if (!expression) return <img src={idle} alt="" draggable={false} />;
  const visible = loaded[expression] ? expression : 'idle';
  return <span className="pc-capy-expressions" data-visible-expression={visible}>
    {(Object.entries(CAPY_EXPRESSION_ART) as [CapyExpression, string][]).map(([name, src]) => (
      <img key={name} src={src} alt="" draggable={false} decoding="async"
        className={name === visible ? 'is-visible' : ''}
        onLoad={() => setLoaded((current) => current[name] ? current : { ...current, [name]: true })}
        onError={() => setLoaded((current) => ({ ...current, [name]: false }))} />
    ))}
  </span>;
}
