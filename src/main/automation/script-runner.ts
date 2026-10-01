import { transform } from 'esbuild';
import type { Page } from 'playwright';

export interface AutomationLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface AutomationContext {
  page: Page;
  log: AutomationLogger;
  config: Record<string, unknown>;
}

export async function runTrustedScript(source: string, context: AutomationContext): Promise<void> {
  const transformed = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const scriptModule: { exports: unknown } = { exports: {} };
  const evaluate = new Function('module', 'exports', transformed.code) as (module: { exports: unknown }, exports: unknown) => void;
  evaluate(scriptModule, scriptModule.exports);
  const exported = scriptModule.exports as { default?: unknown };
  if (typeof exported.default !== 'function') throw new Error('Script must export a default run function');
  await (exported.default as (value: AutomationContext) => Promise<void>)(context);
}
