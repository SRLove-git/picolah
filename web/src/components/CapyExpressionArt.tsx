import { useState } from 'react';
import idle from '../assets/picolah-capybara-v2.webp';
import happy from '../assets/capy-expressions-v3/happy.webp';
import snack from '../assets/capy-expressions-v3/snack.webp';
import playful from '../assets/capy-expressions-v3/playful.webp';
import sleepy from '../assets/capy-expressions-v3/sleepy.webp';

export type CapyExpression = 'idle' | 'happy' | 'snack' | 'playful' | 'sleepy';
const ART: Record<CapyExpression, string> = { idle, happy, snack, playful, sleepy };

/** Keep the previous frame visible until the next expression has loaded. */
export function CapyExpressionArt({ expression }: { expression?: CapyExpression }) {
  const [loaded, setLoaded] = useState<Partial<Record<CapyExpression, boolean>>>({ idle: true });
  if (!expression) return <img src={idle} alt="" draggable={false} />;
  const visible = loaded[expression] ? expression : 'idle';
  return <span className="pc-capy-expressions" data-visible-expression={visible}>
    {(Object.entries(ART) as [CapyExpression, string][]).map(([name, src]) => (
      <img key={name} src={src} alt="" draggable={false} decoding="async"
        className={name === visible ? 'is-visible' : ''}
        onLoad={() => setLoaded((current) => current[name] ? current : { ...current, [name]: true })}
        onError={() => setLoaded((current) => ({ ...current, [name]: false }))} />
    ))}
  </span>;
}
