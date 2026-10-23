import { useId } from 'react';
import type { ProductVisual } from '../../shared/types';

const PALETTES: Record<ProductVisual, { bg1: string; bg2: string; op: string; hi: string; accent: string }> = {
  headphones: { bg1: '#f8fafc', bg2: '#e2e8f0', op: '#111827', hi: '#475569', accent: '#2563eb' },
  phone: { bg1: '#eff6ff', bg2: '#dbeafe', op: '#1e3a8a', hi: '#3b82f6', accent: '#f59e0b' },
  serum: { bg1: '#fafafa', bg2: '#eef2f7', op: '#94a3b8', hi: '#e2e8f0', accent: '#111827' },
  earbuds: { bg1: '#f0fdf4', bg2: '#dcfce7', op: '#ffffff', hi: '#d1d5db', accent: '#16a34a' },
  airfryer: { bg1: '#f8fafc', bg2: '#e2e8f0', op: '#111827', hi: '#475569', accent: '#d97706' },
  sneaker: { bg1: '#fafaf9', bg2: '#e7e5e4', op: '#e7e5e4', hi: '#fafaf9', accent: '#111827' },
  watch: { bg1: '#f5f3ff', bg2: '#ede9fe', op: '#18181b', hi: '#3f3f46', accent: '#2563eb' },
  speaker: { bg1: '#ecfeff', bg2: '#cffafe', op: '#0f172a', hi: '#334155', accent: '#06b6d4' },
  coffee: { bg1: '#fffbeb', bg2: '#fef3c7', op: '#78350f', hi: '#a16207', accent: '#d97706' },
};

interface ProductArtProps {
  visual: ProductVisual;
  size?: number;
  className?: string;
}

export function ProductArt({ visual, size = 72, className = '' }: ProductArtProps) {
  const uid = useId().replace(/:/g, '');
  const palette = PALETTES[visual] || PALETTES.phone;
  const bgId = `bg-${uid}`;
  const objId = `obj-${uid}`;
  const accentId = `accent-${uid}`;
  const meshId = `mesh-${uid}`;

  return (
    <div
      className={`product-art product-art-${visual} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id={bgId} x1="12" y1="8" x2="90" y2="94" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.bg1} />
            <stop offset="1" stopColor={palette.bg2} />
          </linearGradient>
          <linearGradient id={objId} x1="26" y1="18" x2="75" y2="86" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.hi} />
            <stop offset=".48" stopColor={palette.op} />
            <stop offset="1" stopColor={palette.op} />
          </linearGradient>
          <linearGradient id={accentId} x1="20" y1="20" x2="82" y2="82" gradientUnits="userSpaceOnUse">
            <stop stopColor={palette.accent} />
            <stop offset="1" stopColor={palette.accent} stopOpacity=".7" />
          </linearGradient>
          <pattern id={meshId} width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="1.4" cy="1.4" r="1" fill={palette.hi} opacity=".7" />
          </pattern>
        </defs>

        <rect width="100" height="100" rx="22" fill={`url(#${bgId})`} />
        <circle cx="79" cy="22" r="20" fill="#fff" opacity=".2" />
        <circle cx="86" cy="76" r="27" fill={palette.accent} opacity=".08" />
        <path d="M14 84h16" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".4" />
        <ellipse cx="51" cy="84" rx="25" ry="5" fill="#442c1b" opacity=".12" />

        {visual === 'headphones' && (
          <g>
            <path
              d="M26 55V45c0-16 11-25 24-25s24 9 24 25v10"
              fill="none"
              stroke={`url(#${objId})`}
              strokeWidth="6.2"
              strokeLinecap="round"
            />
            <path d="M32 36c3-8 10-12 18-12" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" opacity=".28" />
            <rect x="16" y="44" width="17" height="30" rx="8" fill={`url(#${objId})`} />
            <rect x="67" y="44" width="17" height="30" rx="8" fill={`url(#${objId})`} />
            <rect x="20" y="49" width="9" height="20" rx="4.5" fill={palette.hi} opacity=".75" />
            <rect x="71" y="49" width="9" height="20" rx="4.5" fill={palette.hi} opacity=".75" />
            <circle cx="24.5" cy="58" r="1.7" fill={`url(#${accentId})`} />
            <rect x="70" y="65" width="2.2" height="3.6" rx="1" fill="#1b1a18" />
          </g>
        )}

        {visual === 'phone' && (
          <g transform="rotate(-5 50 50)">
            <rect x="34" y="14" width="32" height="70" rx="9" fill={`url(#${objId})`} />
            <rect x="36.5" y="16.5" width="27" height="65" rx="7" fill="#1f2c46" />
            <clipPath id={`screen-${uid}`}>
              <rect x="36.5" y="16.5" width="27" height="65" rx="7" />
            </clipPath>
            <g clipPath={`url(#screen-${uid})`}>
              <rect x="36" y="16" width="28" height="66" fill="#283b5f" />
              <circle cx="57" cy="54" r="23" fill={`url(#${accentId})`} opacity=".9" />
              <circle cx="42" cy="65" r="17" fill="#f2ceb2" opacity=".5" />
              <path d="M35 70c10-9 22-10 32-3v16H35Z" fill="#17233c" opacity=".7" />
            </g>
            <rect x="45" y="20" width="10" height="3.5" rx="1.7" fill="#0e1626" />
            <rect x="47" y="77" width="6" height="1.4" rx=".7" fill="#f4efe3" opacity=".7" />
            <rect x="31.7" y="31" width="1.6" height="7" rx=".8" fill={palette.accent} />
          </g>
        )}

        {visual === 'serum' && (
          <g>
            <rect x="36" y="38" width="28" height="42" rx="7" fill={`url(#${objId})`} />
            <rect x="39" y="42" width="22" height="28" rx="4" fill={palette.hi} opacity=".32" />
            <rect x="45" y="28" width="10" height="12" rx="2" fill="#b78b5b" />
            <rect x="41" y="18" width="18" height="11" rx="3" fill="#2f2922" />
            <rect x="45.5" y="20" width="9" height="2.2" rx="1.1" fill="#766453" opacity=".7" />
            <rect x="42" y="49" width="18" height="18" rx="2" fill="#f7f0e0" />
            <rect x="45" y="53" width="9" height="2" rx="1" fill="#8d6e50" />
            <rect x="45" y="58" width="12" height="1.5" rx=".75" fill="#c5b49d" />
            <rect x="45" y="61.5" width="8" height="1.5" rx=".75" fill="#c5b49d" />
            <path d="M40 44v29" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".32" />
            <circle cx="58" cy="43" r="2" fill={`url(#${accentId})`} />
          </g>
        )}

        {visual === 'earbuds' && (
          <g>
            <path
              d="M29 64c0-5 4-9 9-9h24c5 0 9 4 9 9v7c0 5-4 9-9 9H38c-5 0-9-4-9-9Z"
              fill={palette.op}
            />
            <path d="M29 65h42" stroke={palette.hi} strokeWidth="1.3" opacity=".7" />
            <circle cx="50" cy="74" r="1.7" fill={palette.accent} />
            <g transform="rotate(-16 38 45)">
              <rect x="31" y="29" width="14" height="14" rx="7" fill="#fbf7ed" />
              <rect x="39" y="39" width="7" height="21" rx="3.5" fill="#fbf7ed" />
              <ellipse cx="37" cy="35" rx="4.2" ry="3.2" fill="#373b38" opacity=".85" />
              <rect x="41" y="49" width="2.5" height="4" rx="1.25" fill={palette.hi} />
            </g>
            <g transform="rotate(16 62 45)">
              <rect x="55" y="29" width="14" height="14" rx="7" fill="#fbf7ed" />
              <rect x="54" y="39" width="7" height="21" rx="3.5" fill="#fbf7ed" />
              <ellipse cx="63" cy="35" rx="4.2" ry="3.2" fill="#373b38" opacity=".85" />
              <rect x="56.5" y="49" width="2.5" height="4" rx="1.25" fill={palette.hi} />
            </g>
          </g>
        )}

        {visual === 'airfryer' && (
          <g>
            <path d="M41 20c-2-3 2-4 0-7M51 18c-2-3 2-4 0-7M61 20c-2-3 2-4 0-7" stroke={palette.hi} strokeWidth="1.8" strokeLinecap="round" opacity=".4" />
            <rect x="28" y="27" width="44" height="47" rx="10" fill={`url(#${objId})`} />
            <rect x="32" y="32" width="36" height="9" rx="4.5" fill="#201f1c" opacity=".55" />
            <circle cx="60" cy="36.5" r="2.2" fill={palette.accent} />
            <rect x="36" y="35.5" width="14" height="1.5" rx=".75" fill="#e9e1d2" opacity=".5" />
            <rect x="33" y="53" width="34" height="15" rx="5" fill="#4b4740" />
            <rect x="42" y="57" width="16" height="2.4" rx="1.2" fill="#d9d1c1" opacity=".85" />
            <rect x="35" y="68" width="30" height="2" rx="1" fill="#24231f" opacity=".6" />
            <path d="M35 45h30" stroke="#fff" strokeWidth=".8" opacity=".14" />
          </g>
        )}

        {visual === 'sneaker' && (
          <g>
            <path
              d="M17 66c6-2 12-7 16-15l11 2c5 9 13 14 24 15 8 .7 13 4 13 9H18c-1-4-1-7-1-11Z"
              fill={`url(#${objId})`}
              stroke="#b9b49e"
              strokeWidth=".8"
            />
            <path d="M16 77h66c0 5-4 7-9 7H25c-5 0-9-2-9-7Z" fill="#d4d8ca" />
            <path d="M25 73h56" stroke="#f8f3e5" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
            <path d="M34 54l6-5M40 57l7-6M47 60l8-5M54 63l9-4" stroke="#a8a58f" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M55 59c7 5 14 7 23 8" stroke={palette.accent} strokeWidth="3" strokeLinecap="round" opacity=".8" />
            <path d="M33 53c-2 4-5 7-9 10" stroke="#faf6e9" strokeWidth="1.7" strokeLinecap="round" opacity=".8" />
            <circle cx="24" cy="61" r="1.2" fill={palette.accent} />
            <path d="M61 64c4 3 9 4 14 4" stroke="#faf6e9" strokeWidth="1" strokeLinecap="round" opacity=".6" />
          </g>
        )}

        {visual === 'watch' && (
          <g>
            <rect x="40" y="10" width="20" height="29" rx="7" fill={`url(#${objId})`} />
            <rect x="40" y="62" width="20" height="29" rx="7" fill={`url(#${objId})`} />
            <path d="M44 20h12M44 25h12M44 71h12M44 76h12" stroke={palette.hi} strokeWidth="1.2" strokeLinecap="round" opacity=".5" />
            <rect x="33" y="30" width="34" height="42" rx="11" fill="#1c1b1e" />
            <rect x="37" y="34" width="26" height="34" rx="8" fill="#121923" />
            <circle cx="50" cy="51" r="8.5" fill="none" stroke={palette.accent} strokeWidth="3.4" strokeDasharray="42 12" strokeLinecap="round" transform="rotate(-85 50 51)" />
            <circle cx="50" cy="51" r="8.5" fill="none" stroke="#5a7c70" strokeWidth="1.2" opacity=".7" />
            <path d="M50 47v5l3 2" stroke="#f5eee2" strokeWidth="1.5" strokeLinecap="round" />
            <rect x="66.5" y="43" width="3" height="8" rx="1.5" fill="#5d575f" />
            <rect x="38" y="36" width="6" height="1" rx=".5" fill="#fff" opacity=".2" />
          </g>
        )}

        {visual === 'speaker' && (
          <g>
            <path d="M22 48c-3 3-3 8 0 11M16 43c-5 5-5 14 0 19" stroke={palette.accent} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
            <path d="M78 48c3 3 3 8 0 11M84 43c5 5 5 14 0 19" stroke={palette.accent} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
            <rect x="35" y="20" width="30" height="61" rx="15" fill={`url(#${objId})`} />
            <ellipse cx="50" cy="23" rx="15" ry="4.8" fill="#1a3339" />
            <rect x="39" y="29" width="22" height="35" rx="10" fill={`url(#${meshId})`} opacity=".9" />
            <rect x="39" y="29" width="22" height="35" rx="10" fill="#0f272c" opacity=".18" />
            <rect x="38" y="68" width="24" height="5" rx="2.5" fill={`url(#${accentId})`} />
            <circle cx="44" cy="27" r="1" fill="#cfe0df" opacity=".6" />
            <circle cx="48" cy="27" r="1" fill="#cfe0df" opacity=".35" />
            <path d="M83 25l2.5 2.5-2.5 2.5M17 70l-2.5 2.5L17 75" stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".7" />
          </g>
        )}

        {visual === 'coffee' && (
          <g>
            <path d="M43 18c-2-3 2-4 0-7M53 17c-2-3 2-4 0-7" stroke={palette.hi} strokeWidth="1.7" strokeLinecap="round" opacity=".4" />
            <rect x="27" y="24" width="42" height="47" rx="9" fill={`url(#${objId})`} />
            <rect x="30" y="27" width="36" height="11" rx="5" fill="#3f2c21" />
            <circle cx="59" cy="32.5" r="2.3" fill={palette.accent} />
            <rect x="34" y="32" width="12" height="1.6" rx=".8" fill="#e8d7c1" opacity=".55" />
            <rect x="44" y="41" width="9" height="5" rx="2.5" fill="#2e2019" />
            <path d="M40 46h18l-2 16H42Z" fill="#f2e9da" opacity=".92" />
            <path d="M44 52h10" stroke="#b58a65" strokeWidth="2.5" strokeLinecap="round" opacity=".75" />
            <rect x="33" y="64" width="30" height="4" rx="2" fill="#2d2019" opacity=".8" />
            <rect x="39" y="58" width="18" height="2.2" rx="1.1" fill="#2d2019" opacity=".3" />
            <path d="M32 30v24" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".18" />
          </g>
        )}
      </svg>
    </div>
  );
}
