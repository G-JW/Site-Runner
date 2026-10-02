import { useState } from 'react';
import { PageHeader } from '../App';
import { useI18n } from '../i18n';
import { scriptTemplates, type ScriptTemplate } from '../script-templates';

export function TemplatesPage({ canCreate, onUse }: { canCreate: boolean; onUse(template: ScriptTemplate): void }) {
  const { language, t } = useI18n();
  const [selected, setSelected] = useState(scriptTemplates[0]!);
  return <>
    <PageHeader eyebrow={t('templates.eyebrow')} title={t('nav.templates')} description={t('templates.description')} />
    {!canCreate && <div className="callout">{t('sites.needProfile')}</div>}
    <section className="template-layout">
      <div className="template-list">{scriptTemplates.map((item) => <button key={item.id} data-testid={`template-${item.id}`} className={`panel template-card ${item.id === selected.id ? 'selected' : ''}`} onClick={() => setSelected(item)}><strong>{item.name[language]}</strong><span>{item.description[language]}</span></button>)}</div>
      <article className="panel template-preview"><h2>{selected.name[language]}</h2><p>{selected.instructions[language]}</p><pre data-testid="template-code">{selected.script ?? t('templates.noScript')}</pre><button data-testid="create-from-template" className="primary" disabled={!canCreate} onClick={() => onUse(selected)}>{t('templates.createSite')}</button></article>
    </section>
  </>;
}
