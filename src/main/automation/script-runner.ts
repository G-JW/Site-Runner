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
  expect: typeof import('playwright/test').expect;
}

export async function runTrustedScript(source: string, context: Omit<AutomationContext, 'expect'>): Promise<void> {
  const { transform } = await import('esbuild');
  const transformed = await transform(source, { loader: 'ts', format: 'cjs', target: 'node20' });
  const scriptModule: { exports: unknown } = { exports: {} };
  const evaluate = new Function('module', 'exports', transformed.code) as (module: { exports: unknown }, exports: unknown) => void;
  evaluate(scriptModule, scriptModule.exports);
  const exported = scriptModule.exports as { default?: unknown };
  if (typeof exported.default !== 'function') throw new Error('Script must export a default run function');
  const { expect } = await import('playwright/test');
  await (exported.default as (value: AutomationContext) => Promise<void>)({ ...context, expect });
}
