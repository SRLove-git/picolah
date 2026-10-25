interface ComposerKey {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
  keyCode?: number;
}

/** Only an unmodified Enter submits; IME confirmation must keep editing. */
export function shouldSubmitComposerKey(event: ComposerKey, composing: boolean): boolean {
  return event.key === 'Enter'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.altKey
    && !event.metaKey
    && !event.isComposing
    && !composing
    // Safari can report isComposing=false for the Enter that confirms an IME candidate.
    && event.keyCode !== 229;
}

/** CSS owns the minimum; cap measured content without producing invalid heights. */
export function getComposerInputHeight(scrollHeight: number, maxHeight: number): number {
  const maximum = Number.isFinite(maxHeight) ? Math.max(0, maxHeight) : 0;
  const content = Number.isNaN(scrollHeight) ? 0 : Math.max(0, scrollHeight);
  return Math.min(content, maximum);
}
