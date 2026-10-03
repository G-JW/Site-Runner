import { useState } from 'react';
import type { ScriptTemplate, ScriptTemplateInput } from '../../shared/types';
import { useI18n } from '../i18n';

export function TemplateFilesDialog({ templates, inputs, onClose, onChange, onError }: {
  templates: ScriptTemplate[]; inputs: ScriptTemplateInput[] | null;
  onClose(): void; onChange(): Promise<void>; onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const items = inputs ?? templates;
  const [selected, setSelected] = useState(new Set(items.map((_item, index) => index)));
  const [busy, setBusy] = useState(false);
  async function submit(event: { preventDefault(): void }) {
    event.preventDefault(); setBusy(true);
    try {
      if (inputs) { await window.siteRunner.templates.importFiles(inputs.filter((_item, index) => selected.has(index))); await onChange(); onClose(); }
      else if (await window.siteRunner.templates.exportFiles(templates.filter((_item, index) => selected.has(index)).map((item) => item.id))) onClose();
    } catch (error) { onError(error); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><form data-testid="template-files-dialog" className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="template-files-title" onSubmit={(event) => void submit(event)}>
    <div className="modal-head"><h2 id="template-files-title">{t(inputs ? 'templates.import' : 'templates.export')}</h2><button type="button" className="close" disabled={busy} aria-label={t('common.close')} onClick={onClose}>×</button></div>
    <div className="rules-content"><p>{t(inputs ? 'templates.importNote' : 'templates.exportNote')}</p><label className="checkbox"><input type="checkbox" checked={selected.size === items.length} onChange={(event) => setSelected(event.target.checked ? new Set(items.map((_item, index) => index)) : new Set())} />{t('folders.selectAll')}</label>
      {items.map((item, index) => <section className="rule-preview" key={index}><label className="checkbox"><input type="checkbox" checked={selected.has(index)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })} /><strong>{item.name[language]}</strong></label><small>{item.description[language]}</small><details><summary>{t('editor.script')}</summary><p>{item.instructions[language]}</p><pre>{item.script ?? t('templates.noScript')}</pre></details></section>)}
    </div><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>{t('common.cancel')}</button><button data-testid="confirm-template-files" className="primary" disabled={busy || selected.size === 0}>{busy ? t('editor.saving') : inputs ? t('templates.importCount', { count: selected.size }) : t('templates.export')}</button></div>
  </form></div>;
}
