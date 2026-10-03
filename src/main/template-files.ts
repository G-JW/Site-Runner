import type { ScriptTemplate, ScriptTemplateInput } from '../shared/types.js';

export function validateTemplate(input: ScriptTemplateInput): Omit<ScriptTemplate, 'id'> {
  if (!input || typeof input !== 'object') throw new Error('Invalid template');
  const result: Omit<ScriptTemplate, 'id'> = { name: { en: '', 'zh-CN': '' }, description: { en: '', 'zh-CN': '' }, instructions: { en: '', 'zh-CN': '' }, script: null };
  for (const field of ['name', 'description', 'instructions'] as const) {
    for (const language of ['en', 'zh-CN'] as const) {
      const value = input[field]?.[language];
      if (typeof value !== 'string' || (field === 'name' && !value.trim())) throw new Error(`Invalid template ${field} (${language})`);
      result[field][language] = value.trim();
    }
  }
  if (input.script !== null && typeof input.script !== 'string') throw new Error('Invalid template script');
  result.script = input.script?.trim() || null;
  return result;
}

export function exportTemplates(templates: ScriptTemplate[]) {
  return { format: 'site-runner-templates', version: 1, templates: templates.map(validateTemplate) };
}

export function parseTemplateFile(value: unknown): ScriptTemplateInput[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid templates file');
  const file = value as { format?: unknown; version?: unknown; templates?: ScriptTemplateInput[] };
  if (file.format !== 'site-runner-templates' || file.version !== 1 || !Array.isArray(file.templates) || file.templates.length === 0 || file.templates.length > 500) {
    throw new Error('Expected a version 1 Site Runner templates file with 1–500 templates');
  }
  return file.templates.map(validateTemplate);
}
