/** A monotonic clock counting only explicitly enabled, visible playback. */
export class ReelClock {
  private total = 0;
  private startedAt: number | null = null;

  constructor(readonly durationMs: number) {}

  read(now: number): number {
    const elapsed = this.startedAt === null ? 0 : Math.max(0, now - this.startedAt);
    return Math.min(this.durationMs, this.total + elapsed);
  }

  setRunning(running: boolean, now: number): void {
    this.total = this.read(now);
    this.startedAt = running && this.total < this.durationMs ? now : null;
  }
}
