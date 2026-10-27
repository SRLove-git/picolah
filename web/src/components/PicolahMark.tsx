import { useId, type ReactNode } from 'react';
import capybaraImage from '../assets/picolah-capybara-v2.webp';

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
      aria-label="PICOLAH!"
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
      <span
        className="pc-wordmark-letter pc-wordmark-bang"
        style={{ color: tone === 'ink' ? 'currentColor' : '#ef4f7e' }}
      >
        !
      </span>
    </span>
  );
}

/** Image2.5 mascot for large artwork; the original illustrated face for avatars. */
export function Capybara({
  size = 160,
  variant = 'full',
  className = '',
  children,
}: {
  size?: number;
  variant?: 'full' | 'face';
  className?: string;
  children?: ReactNode;
}) {
  const uid = useId().replace(/:/g, '');
  const headGradient = `capy-head-${uid}`;
  const hornGradient = `capy-horn-${uid}`;

  return (
    <span
      className={`pc-capy pc-capy-${variant} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {variant === 'full' ? (
        <img src={capybaraImage} alt="" draggable={false} />
      ) : (
        <svg viewBox="38 0 164 168" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient
              id={headGradient}
              x1="74"
              y1="58"
              x2="178"
              y2="164"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#E5AF7F" />
              <stop offset="1" stopColor="#CE8F5C" />
            </linearGradient>
            <linearGradient
              id={hornGradient}
              x1="126"
              y1="4"
              x2="120"
              y2="54"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#FFD96B" />
              <stop offset=".5" stopColor="#FFA9C6" />
              <stop offset="1" stopColor="#B89BFF" />
            </linearGradient>
          </defs>
          <g className="pc-capy-ear-l">
            <ellipse cx="64" cy="60" rx="12" ry="13" fill="#BE7A49" />
            <ellipse cx="64" cy="61" rx="6" ry="7" fill="#F2B3B5" />
          </g>
          <g className="pc-capy-ear-r">
            <ellipse cx="177" cy="60" rx="12" ry="13" fill="#BE7A49" />
            <ellipse cx="177" cy="61" rx="6" ry="7" fill="#F2B3B5" />
          </g>
          <g className="pc-capy-horn">
            <path d="M105 58C99 36 107 18 122 4c10 18 15 34 13 54Z" fill={`url(#${hornGradient})`} />
            <path d="M111 45c2-9 6-17 11-24" stroke="#fff" strokeOpacity=".6" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <rect x="48" y="54" width="145" height="110" rx="44" fill={`url(#${headGradient})`} />
          <ellipse cx="120" cy="137" rx="46" ry="24" fill="#FBE7D1" />
          <ellipse cx="73" cy="126" rx="11" ry="6.5" fill="#EF8B98" opacity=".42" />
          <ellipse cx="168" cy="126" rx="11" ry="6.5" fill="#EF8B98" opacity=".42" />
          <g className="pc-capy-eye-l">
            <ellipse cx="88" cy="98" rx="5.2" ry="6.2" fill="#3D2B22" />
            <circle cx="90" cy="96" r="1.8" fill="#fff" opacity=".9" />
          </g>
          <g className="pc-capy-eye-r">
            <ellipse cx="153" cy="98" rx="5.2" ry="6.2" fill="#3D2B22" />
            <circle cx="155" cy="96" r="1.8" fill="#fff" opacity=".9" />
          </g>
          <path d="M109 122c3-4.6 18-4.6 22 0 1.8 4-2.6 7.4-11 7.4s-12.8-3.4-11-7.4Z" fill="#5B3A2E" />
          <path d="M120 129v4m0 0c-2.6 3-5.8 3.6-8.6 2.6m8.6-2.6c2.6 3 5.8 3.6 8.6 2.6" stroke="#5B3A2E" strokeWidth="1.8" strokeLinecap="round" />
          <g className="pc-capy-spark pc-capy-spark-a">
            <path d="m171 20 1.8 4.8 4.8 1.8-4.8 1.8-1.8 4.8-1.8-4.8-4.8-1.8 4.8-1.8L171 20Z" fill="#FFC94D" />
          </g>
        </svg>
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
      <Capybara variant="face" size={size + 12} />
      <Wordmark size={size} />
    </button>
  );
}
