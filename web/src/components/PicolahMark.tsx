import { useId } from 'react';

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

/**
 * Picolah's mascot: a cheerful horned capybara that carries a tiny shopping bag.
 * Drawn with plain SVG so it stays crisp at every size and can be animated with CSS.
 */
export function Capybara({
  size = 160,
  variant = 'full',
  className = '',
}: {
  size?: number;
  variant?: 'full' | 'face';
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const bodyGradient = `capy-body-${uid}`;
  const headGradient = `capy-head-${uid}`;
  const hornGradient = `capy-horn-${uid}`;

  return (
    <span
      className={`pc-capy pc-capy-${variant} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox={variant === 'face' ? '38 0 164 168' : '0 0 240 240'}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={bodyGradient} x1="74" y1="126" x2="182" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#DEA574" />
            <stop offset="1" stopColor="#C78755" />
          </linearGradient>
          <linearGradient id={headGradient} x1="74" y1="58" x2="178" y2="164" gradientUnits="userSpaceOnUse">
            <stop stopColor="#E5AF7F" />
            <stop offset="1" stopColor="#CE8F5C" />
          </linearGradient>
          <linearGradient id={hornGradient} x1="126" y1="4" x2="120" y2="54" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFD96B" />
            <stop offset=".5" stopColor="#FFA9C6" />
            <stop offset="1" stopColor="#B89BFF" />
          </linearGradient>
        </defs>

        {variant === 'full' && (
          <>
            <ellipse cx="120" cy="222" rx="72" ry="10" fill="#E9CBB8" opacity=".55" />
            <path
              d="M68 154c0-22 22-36 52-36s52 14 52 36v36c0 17-19 26-52 26s-52-9-52-26v-36Z"
              fill={`url(#${bodyGradient})`}
            />
            <ellipse cx="120" cy="184" rx="35" ry="27" fill="#F8E1C8" opacity=".92" />
            <ellipse cx="94" cy="214" rx="19" ry="8" fill="#B57445" />
            <ellipse cx="147" cy="214" rx="19" ry="8" fill="#B57445" />

            <g className="pc-capy-bag">
              <path
                d="M104 176v-6a17 17 0 0 1 34 0v6"
                stroke="#D19A6A"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <rect x="96" y="174" width="50" height="36" rx="9" fill="#FFF9F3" />
              <path
                d="M121 190c2.6-5 9.6-2.4 9.6 2.2 0 4.2-5.2 7.2-9.6 10.2-4.4-3-9.6-6-9.6-10.2 0-4.6 7-7.2 9.6-2.2Z"
                fill="#EF4F7E"
              />
            </g>

            <ellipse cx="68" cy="181" rx="14" ry="20" fill="#C78755" transform="rotate(16 68 181)" />
            <ellipse cx="173" cy="181" rx="14" ry="20" fill="#C78755" transform="rotate(-16 173 181)" />
            <ellipse cx="101" cy="180" rx="8" ry="6" fill="#E8B489" />
            <ellipse cx="140" cy="180" rx="8" ry="6" fill="#E8B489" />
          </>
        )}

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
          <path d="M110 55c3-8 7-13 12-18" stroke="#fff" strokeOpacity=".45" strokeWidth="2.2" strokeLinecap="round" />
          <path d="m122 4 1.8 4.8 4.8 1.6-4.8 1.8-1.8 4.8-1.8-4.8-4.8-1.8 4.8-1.6L122 4Z" fill="#FFF6D2" />
        </g>

        <rect
          x="48"
          y="54"
          width="145"
          height="110"
          rx="44"
          fill={`url(#${headGradient})`}
        />
        <path
          d="M104 55c4-6 11-7 16-4-2 6-6 9-11 9-2.4 0-4-1.8-5-5Z"
          fill="#B57445"
        />
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

        <path
          d="M109 122c3-4.6 18-4.6 22 0 1.8 4-2.6 7.4-11 7.4s-12.8-3.4-11-7.4Z"
          fill="#5B3A2E"
        />
        <path
          d="M120 129v4m0 0c-2.6 3-5.8 3.6-8.6 2.6m8.6-2.6c2.6 3 5.8 3.6 8.6 2.6"
          stroke="#5B3A2E"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <ellipse cx="120" cy="148" rx="11" ry="3" fill="#E8B79A" opacity=".5" />
        <path
          d="M54 98c-2 12 0 23 6 31"
          stroke="#B57445"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".35"
        />
        <path
          d="M186 98c2 12 0 23-6 31"
          stroke="#B57445"
          strokeWidth="2"
          strokeLinecap="round"
          opacity=".35"
        />

        <g className="pc-capy-spark pc-capy-spark-a">
          <path d="m171 20 1.8 4.8 4.8 1.8-4.8 1.8-1.8 4.8-1.8-4.8-4.8-1.8 4.8-1.8L171 20Z" fill="#FFC94D" />
        </g>
        <g className="pc-capy-spark pc-capy-spark-b">
          <path d="m82 28 1.4 3.7 3.7 1.4-3.7 1.4-1.4 3.7-1.4-3.7-3.7-1.4 3.7-1.4L82 28Z" fill="#FF8FB1" />
        </g>
        <g className="pc-capy-spark pc-capy-spark-c">
          <circle cx="200" cy="118" r="3.2" fill="#8FD8C6" />
          <circle cx="43" cy="135" r="2.6" fill="#FFB45C" />
        </g>
      </svg>
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
    <button className="pc-brand-lockup" type="button" onClick={onClick} aria-label="Picolah 首页">
      <Capybara variant="face" size={size + 12} />
      <Wordmark size={size} />
    </button>
  );
}
