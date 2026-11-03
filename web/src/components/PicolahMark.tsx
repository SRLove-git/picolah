import type { ReactNode } from 'react';
import { CapyExpressionArt, type CapyExpression } from './CapyExpressionArt';
import { CapyMotionArt } from './CapyMotionArt';
import type { CapyMotion } from '../lib/capy-motion';
import type { CapyAccessory, CapyClothingId } from '../../shared/capybara';
import brandHead from '../assets/brand-v3/capybara-head.webp';
import './picolah-mark.css';

const LETTER_COLORS = ['#ef4f7e', '#ff8b5e', '#f2b53c', '#4fc5a5', '#5b9cf5', '#9a78f0', '#ef5fa7'];

export function Wordmark({
  size = 48,
  className = '',
  tone = 'color',
}: {
  size?: number;
  className?: string;
  tone?: 'color' | 'ink';
}) {
  const letters = 'PICOLAH'.split('');
  return (
    <span
      className={`pc-wordmark ${className}`}
      style={{ fontSize: size }}
      role="img"
      aria-label="PICOLAH"
    >
      {letters.map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          className="pc-wordmark-letter"
          style={{
            color: tone === 'ink' ? 'currentColor' : LETTER_COLORS[index],
            transform: `rotate(${index % 2 === 0 ? -1.6 : 1.4}deg)`,
          }}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/** Share the current mascot head across navigation and Pico message avatars. */
export function Capybara({
  size = 160,
  variant = 'full',
  className = '',
  children,
  expression,
  motion,
  worn,
}: {
  size?: number;
  variant?: 'full' | 'face';
  className?: string;
  children?: ReactNode;
  expression?: CapyExpression;
  motion?: CapyMotion;
  worn?: CapyAccessory[];
}) {
  return (
    <span
      className={`pc-capy pc-capy-${variant} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {variant === 'full' ? (
        motion ? <CapyMotionArt expression={expression ?? 'idle'} motion={motion} worn={worn} />
          : <CapyExpressionArt expression={expression} clothing={worn?.find((item) => item.slot === 'body')?.id as CapyClothingId | undefined} />
      ) : (
        <img src={brandHead} width={256} height={256} alt="" draggable={false} decoding="async" />
      )}
      {children}
    </span>
  );
}

export function BrandLockup({
  size = 24,
  onClick,
}: {
  size?: number;
  onClick?: () => void;
}) {
  return (
    <button
      className="pc-brand-lockup"
      type="button"
      onClick={onClick}
      aria-label="Picolah"
      data-tooltip="Picolah"
    >
      <Capybara variant="face" size={size + 21} className="pc-capy-brand" />
      <Wordmark size={size} />
    </button>
  );
}
