import { createRequire } from 'node:module';

interface Node {
  type: string; start: number; end: number; body?: Node;
  expression?: Node; arguments?: Node[]; callee?: Node;
}
const require = createRequire(import.meta.url);

export function convertRecording(source: string): string {
  const { babelParse } = require('playwright/lib/transform/babelBundle') as { babelParse(source: string, filename: string, isModule: boolean): { program: { body: Node[] } } };
  const parsed = babelParse(source, 'recording.js', true);
  const call = parsed.program.body.find((node) => node.type === 'ExpressionStatement' && node.expression?.type === 'CallExpression' && node.expression.arguments?.some((arg) => arg.type === 'ArrowFunctionExpression' && arg.body?.type === 'BlockStatement'))?.expression;
  const callback = call?.arguments?.find((arg) => arg.type === 'ArrowFunctionExpression' && arg.body?.type === 'BlockStatement');
  const block = callback?.body as Node | undefined;
  if (!block || !Array.isArray(block.body)) throw new Error('Unsupported recording format');
  const actions = source.slice(block.start + 1, block.end - 1).trim();
  if (!actions) throw new Error('No actions were recorded');
  return `export default async function run({ page, log, expect }: AutomationContext) {\n  const context = page.context();\n  ${actions}\n  log.info('Recorded actions completed');\n}`;
}
