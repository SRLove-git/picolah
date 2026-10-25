import { PLATFORMS } from '../../shared/types';

export function PlatformBadge({
  platformId,
  size = 28,
}: {
  platformId: string;
  size?: number;
}) {
  const sourceName = platformId.replace(/^web:/, '');
  const platform = PLATFORMS[platformId] || {
    short: sourceName.slice(0, 1).toUpperCase(),
    color: '#6f675b',
    tint: '#f2ede4',
    name: sourceName,
  };
  return (
    <span
      className="platform-badge"
      style={{
        width: size,
        height: size,
        color: platform.color,
        background: platform.tint,
        fontSize: size * 0.42,
      }}
      title={platform.name}
      aria-hidden="true"
    >
      {platform.short}
    </span>
  );
}

export function PlatformLabel({ platformId }: { platformId: string }) {
  const platform = PLATFORMS[platformId];
  return <span>{platform?.name || platformId.replace(/^web:/, '')}</span>;
}
