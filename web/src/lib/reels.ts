export { REELS } from '../../shared/reels';
export type { Reel } from '../../shared/reels';

export function compactCount(value: number): string {
  if (value >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, '')}w`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}
