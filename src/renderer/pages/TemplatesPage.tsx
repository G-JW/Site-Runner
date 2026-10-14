import { useState } from "react";
import type {
  BrowserProfile,
  ScriptTemplate,
  ScriptTemplateInput,
} from "../../shared/types";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useI18n } from "../i18n";
import { TemplateFilesDialog } from "../components/TemplateFilesDialog";
import { RecorderPanel } from "../components/RecorderPanel";

export function TemplatesPage({
  templates,
  profiles,
  canCreate,
  onRecordingChange,
  onUse,
  onChange,
  onError,
}: {
  templates: ScriptTemplate[];
  profiles: BrowserProfile[];
  canCreate: boolean;
  onRecordingChange?(active: boolean): void;
  onUse(template: ScriptTemplate): void;
  onChange(): Promise<void>;
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected =
    templates.find((item) => item.id === selectedId) ?? templates[0];
  const [editing, setEditing] = useState<ScriptTemplate | "new" | null>(null);
  const [pending, setPending] = useState<ScriptTemplate | "restore" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [recordedScript, setRecordedScript] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [imported, setImported] = useState<ScriptTemplateInput[] | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  async function loadImport() {
    setLoadingImport(true);
    try {
      const inputs = await window.siteRunner.templates.previewImport();
      if (inputs) setImported(inputs);
    } catch (error) {
      onError(error);
    } finally {
      setLoadingImport(false);
    }
  }
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending === "restore")
        await window.siteRunner.templates.restoreDefaults();
      else await window.siteRunner.templates.remove(pending.id);
      await onChange();
      setSelectedId(null);
      setPending(null);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={t("templates.eyebrow")}
        title={t("nav.templates")}
        description={t("templates.description")}
        actions={
          <>
            <button
              data-testid="export-templates"
              className="secondary"
              disabled={!templates.length}
              onClick={() => setExporting(true)}
            >
              {t("templates.export")}
            </button>
            <button
              data-testid="import-templates"
              className="secondary"
              disabled={loadingImport}
              onClick={() => void loadImport()}
            >
              {t("templates.import")}
            </button>
            <button
              data-testid="restore-templates"
              className="secondary"
              onClick={() => setPending("restore")}
            >
              {t("templates.restore")}
            </button>
            <button
              data-testid="add-template"
              className="primary"
              onClick={() => setEditing("new")}
            >
              {t("templates.add")}
            </button>
          </>
        }
      />
      <RecorderPanel
        profiles={profiles}
        onActiveChange={onRecordingChange}
        onRecorded={(script) => {
          setRecordedScript(script);
          setEditing("new");
        }}
        onError={onError}
      />
      {!canCreate && <div className="callout">{t("sites.needProfile")}</div>}
      {!selected ? (
        <section className="panel table-empty">{t("templates.empty")}</section>
      ) : (
        <section className="template-layout">
          <div className="template-list">
            {templates.map((item) => (
              <button
                key={item.id}
                data-testid={`template-${item.id}`}
                aria-pressed={item.id === selected.id}
                className={`panel template-card ${item.id === selected.id ? "selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                <strong>{item.name[language]}</strong>
                <span>{item.description[language]}</span>
              </button>
            ))}
          </div>
          <article className="panel template-preview">
            <h2>{selected.name[language]}</h2>
            <p>{selected.instructions[language]}</p>
            <pre data-testid="template-code">
              {selected.script ?? t("templates.noScript")}
            </pre>
            <div className="template-actions">
              <button
                data-testid="create-from-template"
                className="primary"
                disabled={!canCreate}
                onClick={() => onUse(selected)}
              >
                {t("templates.createSite")}
              </button>
              <button
                data-testid="edit-template"
                className="secondary"
                onClick={() => setEditing(selected)}
              >
                {t("common.edit")}
              </button>
              <button
                data-testid="delete-template"
                className="danger-ghost"
                onClick={() => setPending(selected)}
              >
                {t("common.delete")}
              </button>
            </div>
          </article>
        </section>
      )}
      {(exporting || imported) && (
        <TemplateFilesDialog
          templates={templates}
          inputs={imported}
          onClose={() => {
            setExporting(false);
            setImported(null);
          }}
          onChange={onChange}
          onError={onError}
        />
      )}
      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          initialScript={recordedScript}
          onClose={() => {
            setEditing(null);
            setRecordedScript(null);
          }}
          onSaved={async (saved) => {
            await onChange();
            setSelectedId(saved.id);
            setEditing(null);
            setRecordedScript(null);
          }}
          onError={onError}
        />
      )}
      {pending && (
        <ConfirmDialog
          title={
            pending === "restore"
              ? t("templates.restore")
              : t("templates.deleteQuestion", { name: pending.name[language] })
          }
          description={
            pending === "restore"
              ? t("templates.restoreDescription")
              : t("templates.deleteDescription")
          }
          busy={busy}
          {...(pending === "restore"
            ? {
                confirmLabel: t("templates.restoreConfirm"),
                eyebrow: t("templates.restore"),
              }
            : {})}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirm()}
        />
      )}
    </>
  );
}

function TemplateEditor({
  template,
  initialScript,
  onClose,
  onSaved,
  onError,
}: {
  template: ScriptTemplate | null;
  initialScript: string | null;
  onClose(): void;
  onSaved(template: ScriptTemplate): Promise<void>;
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const [name, setName] = useState(template?.name[language] ?? "");
  const [description, setDescription] = useState(
    template?.description[language] ?? "",
  );
  const [instructions, setInstructions] = useState(
    template?.instructions[language] ?? "",
  );
  const [script, setScript] = useState(template?.script ?? initialScript ?? "");
  const [saving, setSaving] = useState(false);
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    setSaving(true);
    const input: ScriptTemplateInput = {
      ...(template ? { id: template.id } : {}),
      name: {
        ...(template?.name ?? { en: name, "zh-CN": name }),
        [language]: name,
      },
      description: {
        ...(template?.description ?? { en: description, "zh-CN": description }),
        [language]: description,
      },
      instructions: {
        ...(template?.instructions ?? {
          en: instructions,
          "zh-CN": instructions,
        }),
        [language]: instructions,
      },
      script: script || null,
    };
    try {
      const saved = await window.siteRunner.templates.save(input);
      await onSaved(saved);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form
        data-testid="template-dialog"
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-editor-title"
        onSubmit={(event) => void save(event)}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{t("nav.templates")}</span>
            <h2 id="template-editor-title">
              {template ? t("templates.edit") : t("templates.add")}
            </h2>
          </div>
          <button
            type="button"
            className="close"
            disabled={saving}
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="form-grid">
          <p className="span-2 template-language-hint">
            {t("templates.languageHint")}
          </p>
          <label className="span-2">
            {t("editor.name")}
            <input
              data-testid="template-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="span-2">
            {t("templates.summary")}
            <input
              data-testid="template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="span-2">
            {t("templates.instructions")}
            <textarea
              data-testid="template-instructions"
              rows={2}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          <label className="span-2">
            {t("editor.script")}
            <textarea
              data-testid="template-script"
              className="template-script-input"
              spellCheck={false}
              rows={12}
              value={script}
              onChange={(event) => setScript(event.target.value)}
            />
            <small>{t("templates.scriptHint")}</small>
          </label>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            data-testid="save-template"
            className="primary"
            disabled={saving}
          >
            {saving ? t("editor.saving") : t("templates.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
