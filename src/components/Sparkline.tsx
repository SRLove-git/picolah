import { useId } from 'react';

export function Sparkline({
  values,
  width = 82,
  height = 26,
  accent = '#111827',
}: {
  values: number[];
  width?: number;
  height?: number;
  accent?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const data = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const points = data.map((value, index) => {
    const x = pad + (index / (data.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = `M${points[0].x},${height} L${points.map((p) => `${p.x},${p.y}`).join(' L')} L${points[points.length - 1].x},${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity=".2" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${uid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".85"
      />
      <circle cx={last.x} cy={last.y} r="2.2" fill={accent} />
      <circle cx={last.x} cy={last.y} r="4.2" fill={accent} opacity=".16" />
    </svg>
  );
}
