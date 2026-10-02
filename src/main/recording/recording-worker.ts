import { createRequire } from 'node:module';

// Run the bundled CLI in an Electron Node utility process, without a system Node executable.
const require = createRequire(import.meta.url);
process.parentPort.on('message', () => { process.emit('SIGINT'); });
const { program } = require('playwright/lib/program') as { program: { parseAsync(args: string[]): Promise<void> } };
void program.parseAsync(['node', 'playwright', ...process.argv.slice(2)]).then(() => process.parentPort.postMessage('ready')).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
