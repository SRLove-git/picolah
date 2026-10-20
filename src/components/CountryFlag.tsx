import type { CountryCode } from '../../shared/types';

function starPoints(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI / points) * index - Math.PI / 2;
    return `${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`;
  }).join(' ');
}

function FlagArt({ code }: { code: CountryCode }) {
  switch (code) {
    case 'SG':
      return (
        <>
          <rect width="24" height="8" fill="#ed2939" />
          <rect y="8" width="24" height="8" fill="#ffffff" />
          <circle cx="5.4" cy="4" r="2.9" fill="#ffffff" />
          <circle cx="6.7" cy="4" r="2.5" fill="#ed2939" />
          {[
            [9, 1.8],
            [10.4, 3.2],
            [9.9, 5.1],
            [8.1, 5.6],
            [7.2, 3.6],
          ].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="0.42" fill="#ffffff" />
          ))}
        </>
      );
    case 'MY':
      return (
        <>
          {Array.from({ length: 14 }, (_, index) => (
            <rect
              key={index}
              y={(index * 16) / 14}
              width="24"
              height={16 / 14 + 0.12}
              fill={index % 2 === 0 ? '#cc0001' : '#ffffff'}
            />
          ))}
          <rect width="12.5" height="8.2" fill="#010066" />
          <circle cx="5.2" cy="4.1" r="2.5" fill="#ffcc00" />
          <circle cx="6.3" cy="4.1" r="2.1" fill="#010066" />
          <polygon points={starPoints(8.6, 4.1, 1.8, 0.78, 7)} fill="#ffcc00" />
        </>
      );
    case 'TH':
      return (
        <>
          <rect width="24" height="16" fill="#a51931" />
          <rect y="2.7" width="24" height="10.6" fill="#f4f5f8" />
          <rect y="5.3" width="24" height="5.4" fill="#2d2a4a" />
        </>
      );
    case 'ID':
      return (
        <>
          <rect width="24" height="8" fill="#ce1126" />
          <rect y="8" width="24" height="8" fill="#ffffff" />
        </>
      );
    case 'PH':
      return (
        <>
          <rect width="24" height="8" fill="#0038a8" />
          <rect y="8" width="24" height="8" fill="#ce1126" />
          <path d="M0 0 9.2 8 0 16Z" fill="#ffffff" />
          <circle cx="3" cy="8" r="1.25" fill="#fcd116" />
          {[
            [1.6, 4.4],
            [1.6, 11.6],
            [5.9, 8],
          ].map(([cx, cy], index) => (
            <circle key={index} cx={cx} cy={cy} r="0.45" fill="#fcd116" />
          ))}
        </>
      );
    case 'VN':
      return (
        <>
          <rect width="24" height="16" fill="#da251d" />
          <polygon points={starPoints(12, 8, 4.2, 1.75, 5)} fill="#ffff00" />
        </>
      );
    default:
      return <rect width="24" height="16" fill="#c9bfae" />;
  }
}

export function CountryFlag({
  code,
  width = 18,
  className = '',
}: {
  code: CountryCode;
  width?: number;
  className?: string;
}) {
  const height = Math.round((width * 2) / 3);
  return (
    <span
      className={`country-flag ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 16" preserveAspectRatio="none">
        <FlagArt code={code} />
      </svg>
    </span>
  );
}
