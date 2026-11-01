import type { CSSProperties } from 'react';
import type { CapyView } from '../../shared/capybara';
import { Capybara } from './PicolahMark';
import { AccessoryLayer } from './CapyAccessoryArt';
import type { CapyExpression } from './CapyExpressionArt';
import type { CapyMotion } from '../lib/capy-motion';
import './capybara.css';

interface CapyAvatarProps {
  view: CapyView;
  size?: number;
  className?: string;
  showBadge?: boolean;
  badgeLabel?: string;
  expression?: CapyExpression;
  motion?: CapyMotion;
}

/**
 * The living mascot: a complete dressed character when clothing is selected,
 * with smaller accessories placed in the shared 768×804 art coordinates.
 */
export function CapyAvatar({ view, size = 240, className = '', showBadge = false, badgeLabel, expression, motion }: CapyAvatarProps) {
  const scale = view.stage.scale;
  return (
    <span
      className={`pc-capy-live ${className}`}
      style={{ width: size, height: size }}
      data-legend={view.stage.id === 'legend' ? 'true' : undefined}
      data-clothing={view.worn.find((item) => item.slot === 'body')?.id || 'none'}
      aria-hidden="true"
    >
      <span
        className="pc-capy-live-aura"
        style={{ '--pc-capy-aura': view.stage.aura } as CSSProperties}
        aria-hidden="true"
      />
      {view.stage.id === 'legend' && (
        <span className="pc-capy-live-spark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span
        className="pc-capy-live-inner"
        style={{ '--pc-capy-scale': scale } as CSSProperties}
      >
        <Capybara size={size} className="pc-capy-live-art" expression={expression} motion={motion} worn={view.worn}>
          {view.worn.length > 0 && (
            <svg className="pc-capy-worn" viewBox="0 0 768 804" aria-hidden="true">
              <AccessoryLayer worn={view.worn} />
            </svg>
          )}
        </Capybara>
      </span>
      {showBadge && <span className="pc-capy-live-badge">{badgeLabel ?? `Lv.${view.level}`}</span>}
    </span>
  );
}
