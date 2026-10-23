export function logInfo(message: string): void {
  console.log(`[crawler] ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`[crawler] WARN ${message}`);
}

export function logError(message: string): void {
  console.error(`[crawler] ERROR ${message}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
