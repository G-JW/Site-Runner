import type { OnMount } from "@monaco-editor/react";
import { lazy, Suspense, useRef, useState } from "react";
import type {
  BrowserProfile,
  ScriptTemplate,
  Site,
  SiteFolder,
  SiteInput,
  SiteRunResult,
} from "../../shared/types";
import { defaultVisitOptions } from "../../shared/visit-options";
import {
  compileFlow,
  readFlow,
  validateFlow,
  type AutomationFlow,
} from "../../shared/automation-flow";
import { useI18n } from "../i18n";
import { useAppearance } from "../workspace/Appearance";
import { ScheduleNextRun } from "./ScheduleNextRun";
import { ScheduleEditor } from "./ScheduleEditor";
import { FlowEditor } from "./FlowEditor";
import { ConfirmDialog } from "./ConfirmDialog";
import { RecorderPanel } from "./RecorderPanel";
import { RunResultPanel } from "./RunResultPanel";
import { Icon } from "../workspace/Icon";
import { useDialogFocus } from "../workspace/useDialogFocus";

const ScriptCodeEditor = lazy(() => import("./ScriptCodeEditor"));
const stages = ["website", "login", "actions", "trial", "plan"] as const;
type Stage = (typeof stages)[number];

export function SiteEditor({
  folders,
  defaultFolderId,
  site,
  profiles,
  templates,
  defaultTimeoutMs,
  initialScript,
  onClose,
  onSaved,
  onError,
}: {
  folders: SiteFolder[];
  defaultFolderId: string | null;
  site: Site | null;
  profiles: BrowserProfile[];
  templates: ScriptTemplate[];
  defaultTimeoutMs: number;
  initialScript: string | null;
  onClose(): void;
  onSaved(site: Site): Promise<void>;
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const { resolvedTheme } = useAppearance();
  const [form, setForm] = useState<SiteInput>(() =>
    site
      ? { ...site }
      : {
          visitOptions: { ...defaultVisitOptions },
          folderId: defaultFolderId,
          name: "",
          url: "https://",
          enabled: true,
          script: initialScript,
          browserProfileId: profiles[0]?.id ?? "",
          timeoutMs: defaultTimeoutMs,
          schedule: { enabled: false, cron: "0 9 * * *", mode: "inherit" },
        },
  );
  const [savedSignature, setSavedSignature] = useState(() =>
    JSON.stringify(form),
  );
  const [stage, setStage] = useState<Stage>("website");
  const [flow, setFlow] = useState<AutomationFlow>(
    () => readFlow(form.script) ?? { version: 1, steps: [], message: "" },
  );
  const [mode, setMode] = useState<"visual" | "code">(() =>
    readFlow(form.script) ? "visual" : "code",
  );
  const [actionView, setActionView] = useState<"edit" | "record">("edit");
  const [replaceFlow, setReplaceFlow] = useState(false);
  const [replaceVisit, setReplaceVisit] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [replacePending, setReplacePending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [opening, setOpening] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [test, setTest] = useState<SiteRunResult | null>(null);
  const [editor, setEditor] = useState<Parameters<OnMount>[0] | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const locked = saving || recording || opening;
  const visit = form.visitOptions ?? defaultVisitOptions;
  const selectedTemplate =
    templates.find((item) => item.id === selectedTemplateId) ?? templates[0];
  const folder = folders.find((item) => item.id === form.folderId);
  const planMode =
    form.schedule.mode ?? (form.schedule.enabled ? "custom" : "inherit");
  function close() {
    if (locked) return;
    if (JSON.stringify(form) !== savedSignature) setDiscard(true);
    else onClose();
  }
  useDialogFocus(
    formRef,
    close,
    locked || discard || replaceFlow || replaceVisit,
  );
  function basicsValid() {
    try {
      if (
        !form.name.trim() ||
        !["http:", "https:"].includes(new URL(form.url).protocol)
      )
        throw new Error(t("task.websiteNote"));
      return true;
    } catch (error) {
      setStage("website");
      onError(error);
      return false;
    }
  }
  function go(next: Stage) {
    if (!locked && (next === "website" || basicsValid())) {
      setStage(next);
      setFeedback("");
    }
  }
  function editFlow(next: AutomationFlow) {
    setFlow(next);
    setForm({ ...form, script: compileFlow(next) });
  }
  function changeMode(next: "visual" | "code") {
    if (next === "visual") {
      const parsed =
        compileFlow(flow)?.trim() === form.script?.trim()
          ? flow
          : readFlow(form.script);
      if (!parsed && mode !== "visual") {
        setReplaceFlow(true);
        return;
      }
      if (parsed) setFlow(parsed);
    }
    setMode(next);
    setActionView("edit");
  }
  async function save(testAfter = false) {
    if (locked || !basicsValid()) return;
    if (mode === "visual") {
      try {
        validateFlow(flow);
      } catch (error) {
        setStage("actions");
        onError(error);
        return;
      }
    }
    setSaving(true);
    setFeedback("");
    try {
      const saved = await window.siteRunner.sites.save(form);
      const next = { ...form, id: saved.id };
      setForm(next);
      setSavedSignature(JSON.stringify(next));
      await onSaved(saved);
      if (testAfter) {
        setStage("trial");
        const result = await window.siteRunner.runs.runSite(saved.id);
        setTest(result);
        await onSaved(saved);
      } else onClose();
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  }
  function applyScript(script: string | null) {
    const parsed = readFlow(script);
    setForm({ ...form, script });
    setMode(parsed ? "visual" : "code");
    if (parsed) setFlow(parsed);
    setActionView("edit");
    setShowTemplates(false);
    setReplacePending(false);
  }
  function applyTemplate() {
    if (!selectedTemplate) return;
    if (form.script?.trim() && !replacePending) {
      setReplacePending(true);
      return;
    }
    applyScript(selectedTemplate.script);
  }
  return (
    <>
      <div className="modal-backdrop task-editor-backdrop">
        <form
          ref={formRef}
          data-testid="site-dialog"
          className="editor-modal task-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="site-editor-title"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="modal-head">
            <div>
              <span className="eyebrow">
                {t(site ? "task.edit" : "task.create")}
              </span>
              <h2 id="site-editor-title">
                <Icon name="sites" size={19} />
                {form.name || t("task.create")}
                {JSON.stringify(form) !== savedSignature && (
                  <span
                    className="unsaved-mark"
                    title={t("workbench.unsaved")}
                    aria-label={t("workbench.unsaved")}
                  />
                )}
              </h2>
              <p className="editor-url">{form.url}</p>
            </div>
            <button
              type="button"
              disabled={locked}
              aria-label={t("common.close")}
              className="close"
              onClick={close}
            >
              ×
            </button>
          </div>
          <div
            className="task-stage-tabs"
            role="tablist"
            aria-orientation="vertical"
            aria-label={t("task.edit")}
          >
            {stages.map((item, index) => (
              <button
                type="button"
                role="tab"
                key={item}
                data-testid={`task-tab-${item}`}
                id={`task-tab-${item}`}
                aria-controls="task-stage-content"
                aria-selected={stage === item}
                className={stage === item ? "active" : ""}
                disabled={locked}
                tabIndex={stage === item ? 0 : -1}
                onKeyDown={(event) => {
                  if (
                    !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  const nextIndex =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? stages.length - 1
                        : (index +
                            (event.key === "ArrowDown" ? 1 : -1) +
                            stages.length) %
                          stages.length;
                  const next = stages[nextIndex]!;
                  if (locked || (next !== "website" && !basicsValid())) return;
                  go(next);
                  document.getElementById(`task-tab-${next}`)?.focus();
                }}
                onClick={() => go(item)}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{t(`task.step.${item}`)}</strong>
                  <small>{t(`workbench.step.${item}`)}</small>
                </div>
              </button>
            ))}
          </div>
          <div
            className="task-editor-body"
            id="task-stage-content"
            role="tabpanel"
            aria-labelledby={`task-tab-${stage}`}
          >
            <fieldset disabled={saving || opening}>
              {stage === "website" && (
                <>
                  <p className="section-description">{t("task.websiteNote")}</p>
                  <div className="form-grid">
                    <label>
                      {t("editor.name")}
                      <input
                        autoFocus
                        data-testid="task-name"
                        value={form.name}
                        required
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("editor.url")}
                      <input
                        data-testid="task-url"
                        value={form.url}
                        required
                        onChange={(event) =>
                          setForm({ ...form, url: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      {t("folders.title")}
                      <select
                        data-testid="site-folder"
                        value={form.folderId ?? ""}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            folderId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">{t("folders.ungrouped")}</option>
                        {folders.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(event) =>
                          setForm({ ...form, enabled: event.target.checked })
                        }
                      />
                      {t("tasks.enable")}
                    </label>
                  </div>
                  <details className="advanced-disclosure">
                    <summary>{t("task.advanced")}</summary>
                    <label>
                      {t("task.timeoutSeconds")}
                      <input
                        data-testid="task-timeout"
                        type="number"
                        min="1"
                        max="300"
                        required
                        value={form.timeoutMs / 1000}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            timeoutMs: Number(event.target.value) * 1000,
                          })
                        }
                      />
                    </label>
                  </details>
                </>
              )}
              {stage === "login" && (
                <>
                  <h3>{t("task.step.login")}</h3>
                  <p>{t("task.loginNote")}</p>
                  <button
                    type="button"
                    className="primary"
                    data-testid="task-login"
                    onClick={() => {
                      if (!basicsValid()) return;
                      setOpening(true);
                      setFeedback("");
                      void window.siteRunner.profiles
                        .open(form.browserProfileId, form.url)
                        .then(() => setFeedback(t("task.loginOpened")))
                        .catch(onError)
                        .finally(() => setOpening(false));
                    }}
                  >
                    {t("tasks.openWebsite")}
                  </button>
                  <details className="advanced-disclosure">
                    <summary>{t("editor.profile")}</summary>
                    <label>
                      {t("editor.profile")}
                      <select
                        value={form.browserProfileId}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            browserProfileId: event.target.value,
                          })
                        }
                      >
                        {profiles.map((profile) => (
                          <option value={profile.id} key={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>{t("task.loginShared")}</p>
                    <small>{t("task.loginManage")}</small>
                  </details>
                </>
              )}
              {stage === "actions" && (
                <>
                  <p>{t("task.actionsNote")}</p>
                  <div className="action-choices" inert={recording}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        form.script ? setReplaceVisit(true) : applyScript(null)
                      }
                    >
                      {t("task.visitOnly")}
                    </button>
                    <button
                      type="button"
                      className={
                        actionView === "record" ? "primary" : "secondary"
                      }
                      data-testid="task-record"
                      onClick={() => setActionView("record")}
                    >
                      {t("task.record")}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      data-testid="choose-template"
                      onClick={() => {
                        setShowTemplates(!showTemplates);
                        setReplacePending(false);
                      }}
                    >
                      {t("templates.choose")}
                    </button>
                  </div>
                  {showTemplates &&
                    actionView !== "record" &&
                    selectedTemplate && (
                      <section className="template-picker">
                        <select
                          data-testid="template-select"
                          aria-label={t("templates.choose")}
                          value={selectedTemplate.id}
                          onChange={(event) => {
                            setSelectedTemplateId(event.target.value);
                            setReplacePending(false);
                          }}
                        >
                          {templates.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name[language]}
                            </option>
                          ))}
                        </select>
                        <p>{selectedTemplate.instructions[language]}</p>
                        {replacePending && (
                          <p role="alert">{t("templates.replace")}</p>
                        )}
                        <button
                          type="button"
                          data-testid="apply-template"
                          className="secondary"
                          onClick={applyTemplate}
                        >
                          {t(
                            replacePending
                              ? "templates.confirm"
                              : "templates.apply",
                          )}
                        </button>
                      </section>
                    )}
                  {actionView === "record" ? (
                    <div className="task-recorder-container">
                      <RecorderPanel
                        profiles={profiles}
                        context={{
                          url: form.url,
                          profileId: form.browserProfileId,
                        }}
                        onActiveChange={setRecording}
                        onError={onError}
                        onRecorded={(script) => {
                          applyScript(script);
                          setFeedback(t("task.recorded"));
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <div
                        className="editor-tabs"
                        role="tablist"
                        aria-label={t("editor.script")}
                      >
                        {(["visual", "code"] as const).map((tab) => (
                          <button
                            type="button"
                            role="tab"
                            id={`flow-tab-${tab}`}
                            aria-controls="flow-content"
                            aria-selected={mode === tab}
                            className={mode === tab ? "active" : ""}
                            key={tab}
                            onClick={() => changeMode(tab)}
                          >
                            {t(`flow.${tab}`)}
                          </button>
                        ))}
                      </div>
                      <div
                        id="flow-content"
                        role="tabpanel"
                        aria-labelledby={`flow-tab-${mode}`}
                      >
                        {mode === "visual" ? (
                          <FlowEditor flow={flow} onChange={editFlow} />
                        ) : (
                          <>
                            <div className="editor-toolbar">
                              <small>{t("flow.custom")}</small>
                              <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                  void editor
                                    ?.getAction("editor.action.formatDocument")
                                    ?.run()
                                }
                              >
                                {t("editor.format")}
                              </button>
                            </div>
                            <div className="monaco-frame">
                              <Suspense fallback={<p>{t("common.loading")}</p>}>
                                <ScriptCodeEditor
                                  theme={
                                    resolvedTheme === "dark"
                                      ? "vs-dark"
                                      : "light"
                                  }
                                  value={form.script ?? ""}
                                  onMount={setEditor}
                                  onChange={(value) =>
                                    setForm({ ...form, script: value || null })
                                  }
                                />
                              </Suspense>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
              {stage === "trial" && (
                <>
                  <h3>{t("task.step.trial")}</h3>
                  <p>{t("task.trialNote")}</p>
                  <details className="advanced-disclosure">
                    <summary>{t("task.advanced")}</summary>
                    {!form.script && (
                      <label>
                        {t("visit.stay")}
                        <input
                          data-testid="visit-stay"
                          type="number"
                          min="0"
                          max="60000"
                          required
                          value={visit.stayMs}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              visitOptions: {
                                ...visit,
                                stayMs: Number(event.target.value),
                              },
                            })
                          }
                        />
                      </label>
                    )}
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={visit.detectChallenges}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            visitOptions: {
                              ...visit,
                              detectChallenges: event.target.checked,
                            },
                          })
                        }
                      />
                      {t("visit.detect")}
                    </label>
                  </details>
                  <div className="test-task">
                    <p>{t("task.testNote")}</p>
                    <button
                      type="button"
                      className="primary"
                      data-testid="test-task"
                      onClick={() => void save(true)}
                    >
                      {t("task.test")}
                    </button>
                  </div>
                </>
              )}
              {stage === "plan" && (
                <>
                  <h3>{t("task.step.plan")}</h3>
                  <label>
                    {t("task.planMode")}
                    <select
                      data-testid="task-plan-mode"
                      value={planMode}
                      onChange={(event) => {
                        const next = event.target.value as typeof planMode;
                        setForm({
                          ...form,
                          schedule: {
                            ...form.schedule,
                            enabled: next === "custom",
                            mode: next,
                          },
                        });
                      }}
                    >
                      <option value="inherit">{t("task.plan.inherit")}</option>
                      <option value="custom">{t("task.plan.custom")}</option>
                      <option value="manual">{t("task.plan.manual")}</option>
                    </select>
                  </label>
                  {planMode === "custom" && (
                    <ScheduleEditor
                      value={form.schedule}
                      showEnabled={false}
                      onChange={(schedule) =>
                        setForm({
                          ...form,
                          schedule: {
                            ...schedule,
                            enabled: true,
                            mode: "custom",
                          },
                        })
                      }
                    />
                  )}
                  {planMode === "inherit" && folder?.schedule.enabled && (
                    <ScheduleNextRun expression={folder.schedule.cron} />
                  )}
                  {planMode === "inherit" && (
                    <p>
                      {folder?.schedule.enabled
                        ? t("task.planInherited", {
                            name: folder.name,
                            cron: folder.schedule.cron,
                          })
                        : t("task.planNoGroup")}
                    </p>
                  )}
                  <p className="schedule-runtime-note">
                    {t("schedule.background")}
                  </p>
                  <small>
                    {t("schedule.timezone", {
                      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    })}
                  </small>
                </>
              )}
            </fieldset>
            {feedback && (
              <p className="success-callout" role="status">
                {feedback}
              </p>
            )}
            {recording && <p role="status">{t("task.recordingLock")}</p>}
            {test && stage === "trial" && (
              <>
                <p className="section-description">{t("task.lastTrial")}</p>
                <RunResultPanel run={test} />
              </>
            )}
          </div>
          <div className="modal-actions task-editor-footer">
            <button
              type="button"
              className="text-button"
              disabled={locked}
              onClick={close}
            >
              {t("common.cancel")}
            </button>
            <span className="footer-spacer" />
            {stage !== "website" && (
              <button
                type="button"
                className="secondary"
                disabled={locked}
                onClick={() => go(stages[stages.indexOf(stage) - 1]!)}
              >
                {t("task.previous")}
              </button>
            )}
            {stage !== "plan" && (
              <button
                type="button"
                className="secondary"
                data-testid="task-continue"
                disabled={locked}
                onClick={() => go(stages[stages.indexOf(stage) + 1]!)}
              >
                {t(stage === "trial" && !test ? "task.skipTrial" : "task.next")}
              </button>
            )}
            <button
              className="primary"
              data-testid="save-task"
              disabled={locked}
            >
              {t(saving ? "editor.saving" : "task.save")}
            </button>
          </div>
        </form>
      </div>
      {discard && (
        <ConfirmDialog
          title={t("task.unsavedTitle")}
          description={t("task.unsavedNote")}
          confirmLabel={t("task.discard")}
          onCancel={() => setDiscard(false)}
          onConfirm={onClose}
        />
      )}
      {replaceFlow && (
        <ConfirmDialog
          title={t("flow.replaceTitle")}
          description={t("flow.replaceNote")}
          confirmLabel={t("flow.replace")}
          onCancel={() => setReplaceFlow(false)}
          onConfirm={() => {
            editFlow({ version: 1, steps: [], message: "" });
            setMode("visual");
            setReplaceFlow(false);
          }}
        />
      )}
      {replaceVisit && (
        <ConfirmDialog
          title={t("flow.replaceTitle")}
          description={t("flow.replaceNote")}
          confirmLabel={t("task.visitOnly")}
          onCancel={() => setReplaceVisit(false)}
          onConfirm={() => {
            applyScript(null);
            setReplaceVisit(false);
          }}
        />
      )}
    </>
  );
}
