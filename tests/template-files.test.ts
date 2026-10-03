import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { exportTemplates, parseTemplateFile } from '../src/main/template-files.js';
import { defaultScriptTemplates } from '../src/shared/script-templates.js';
import { AppDatabase } from '../src/main/database/database.js';
import { DataService } from '../src/main/services/data-service.js';

it('round-trips bilingual templates without local IDs and rejects malformed files', () => {
  const file = exportTemplates(defaultScriptTemplates);
  const imported = parseTemplateFile(JSON.parse(JSON.stringify(file)));
  expect(imported).toHaveLength(6);
  expect(imported[0]).toMatchObject({ name: defaultScriptTemplates[0]?.name, script: null });
  expect(imported[1]?.script).toBe(defaultScriptTemplates[1]?.script);
  expect(imported.every((item) => !('id' in item))).toBe(true);
  expect(() => parseTemplateFile({ ...file, version: 2 })).toThrow();
  expect(() => parseTemplateFile({ ...file, templates: [] })).toThrow();
  expect(() => parseTemplateFile({ ...file, templates: [{ ...imported[0], name: { en: 'A' } }] })).toThrow();
  expect(() => parseTemplateFile({ ...file, templates: [{ ...imported[0], script: 42 }] })).toThrow();
});

it('imports additively with fresh IDs, unique names and no partial writes on invalid input', () => {
  const database = new AppDatabase(path.join(mkdtempSync('/private/tmp/site-runner-template-files-'), 'test.sqlite3'));
  try {
    const data = new DataService(database.connection);
    const before = data.listTemplates();
    const inputs = parseTemplateFile(exportTemplates(before));
    const imported = data.importTemplates(inputs);
    expect(data.listTemplates()).toHaveLength(12);
    expect(imported[0]?.name.en).toBe(`${before[0]?.name.en} (2)`);
    expect(imported[0]?.name['zh-CN']).toBe(`${before[0]?.name['zh-CN']} (2)`);
    expect(before.some((item) => item.id === imported[0]?.id)).toBe(false);
    expect(data.listTemplates().slice(0, 6)).toEqual(before);
    const snapshot = data.listTemplates();
    expect(() => data.importTemplates([inputs[0]!, { ...inputs[1]!, script: 12 } as never])).toThrow();
    expect(data.listTemplates()).toEqual(snapshot);
  } finally { database.close(); }
});
