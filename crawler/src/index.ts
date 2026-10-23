import { main } from './cli.ts';
import { errorMessage } from './log.ts';

void main().catch((error: unknown) => {
  console.error(`[crawler] fatal: ${errorMessage(error)}`);
  process.exitCode = 1;
});
