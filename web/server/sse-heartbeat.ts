interface SseResponse {
  readonly destroyed: boolean;
  readonly writableEnded: boolean;
  write(chunk: string): unknown;
  once(event: 'close' | 'finish', listener: () => void): unknown;
  removeListener(event: 'close' | 'finish', listener: () => void): unknown;
}

/** SSE comments keep idle search streams open without changing client events. */
export function startSseHeartbeat(response: SseResponse): () => void {
  const stop = () => {
    clearInterval(timer);
    response.removeListener('close', stop);
    response.removeListener('finish', stop);
  };
  const timer = setInterval(() => {
    if (response.destroyed || response.writableEnded) return stop();
    response.write(': keep-alive\n\n');
  }, 15_000);
  timer.unref?.();
  response.once('close', stop);
  response.once('finish', stop);
  return stop;
}
