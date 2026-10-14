import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  AppInfo,
  AppSettings,
  Site,
  BrowserProfile,
  ScriptTemplate,
  SiteRule,
  ScriptTemplateInput,
} from "../../shared/types";
import { PageHeader } from "../components/PageHeader";
import type { PageName } from "../workspace/navigation";
import { ConfigurationPanel } from "../components/ConfigurationPanel";
import { NotificationsPage } from "./NotificationsPage";
import { SiteRulesDialog } from "../components/SiteRulesDialog";
import { TemplateFilesDialog } from "../components/TemplateFilesDialog";
import { CleanupPanel } from "../components/CleanupPanel";
import { useI18n } from "../i18n";
import { useAppearance } from "../workspace/Appearance";
import { Icon } from "../workspace/Icon";
import { UpdatesPanel } from "../components/UpdatesPanel";

type Category = "all" | "appearance" | "execution" | "notifications" | "data";
function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="toggle-label">
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span />
    </label>
  );
}
export function SettingsPage({
  info,
  sites,
  profiles,
  templates,
  initialCategory = "all",
  onNavigate,
  onChange,
  onError,
}: {
  info: AppInfo | null;
  sites: Site[];
  profiles: BrowserProfile[];
  templates: ScriptTemplate[];
  initialCategory?: Category;
  onNavigate(page: PageName): void;
  onChange(): Promise<void>;
  onError(error: unknown): void;
}) {
  const { setLanguage, t } = useI18n();
  const { apply } = useAppearance();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [timeout, setTimeoutDraft] = useState("30000");
  const [category, setCategory] = useState<Category>(initialCategory);
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "saveError">(
    "saved",
  );
  const [rulesExport, setRulesExport] = useState(false);
  const [rules, setRules] = useState<SiteRule[] | null>(null);
  const [templateExport, setTemplateExport] = useState(false);
  const [templateInputs, setTemplateInputs] = useState<
    ScriptTemplateInput[] | null
  >(null);
  const [fileBusy, setFileBusy] = useState(false);
  async function importFile(kind: "rules" | "templates") {
    setFileBusy(true);
    try {
      if (kind === "rules")
        setRules(await window.siteRunner.sites.previewImport());
      else setTemplateInputs(await window.siteRunner.templates.previewImport());
    } catch (error) {
      onError(error);
    } finally {
      setFileBusy(false);
    }
  }
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  useEffect(() => {
    let mounted = true;
    void window.siteRunner.settings
      .get()
      .then((next) => {
        if (mounted) {
          setSettings(next);
          setTimeoutDraft(String(next.defaultTimeoutMs));
        }
      })
      .catch(onError);
    return () => {
      mounted = false;
    };
  }, [onError]);
  async function update(patch: Partial<AppSettings>) {
    pending.current++;
    setSaveState("saving");
    const work = queue.current.then(async () => {
      const next = await window.siteRunner.settings.update(patch);
      setSettings(next);
      apply(next);
      if (patch.language) setLanguage(next.language);
    });
    queue.current = work.catch(() => undefined);
    try {
      await work;
      pending.current--;
      if (!pending.current) setSaveState("saved");
    } catch (error) {
      pending.current--;
      setSaveState("saveError");
      onError(error);
    }
  }
  const search = query.trim().toLowerCase();
  const matches = (...values: string[]) =>
    !search || values.join(" ").toLowerCase().includes(search);
  const show = (group: Category) =>
    category === "all"
      ? group === "appearance" || group === "execution"
      : category === group;
  const rows: Array<{
    category: Category;
    title: string;
    description: string;
    control: ReactNode;
  }> = settings
    ? [
        {
          category: "appearance",
          title: t("settings.theme"),
          description: t("settings.themeDescription"),
          control: (
            <select
              aria-label={t("settings.theme")}
              data-testid="theme-select"
              value={settings.theme}
              onChange={(event) =>
                void update({
                  theme: event.target.value as AppSettings["theme"],
                })
              }
            >
              {(["system", "light", "dark"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`settings.theme.${value}`)}
                </option>
              ))}
            </select>
          ),
        },
        {
          category: "appearance",
          title: t("settings.density"),
          description: t("settings.densityDescription"),
          control: (
            <select
              aria-label={t("settings.density")}
              data-testid="density-select"
              value={settings.density}
              onChange={(event) =>
                void update({
                  density: event.target.value as AppSettings["density"],
                })
              }
            >
              {(["comfortable", "compact"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`settings.density.${value}`)}
                </option>
              ))}
            </select>
          ),
        },
        {
          category: "appearance",
          title: t("settings.language"),
          description: t("settings.languageDescription"),
          control: (
            <select
              aria-label={t("settings.language")}
              data-testid="language-select"
              value={settings.language}
              onChange={(event) =>
                void update({
                  language: event.target.value as AppSettings["language"],
                })
              }
            >
              <option value="en">{t("settings.english")}</option>
              <option value="zh-CN">{t("settings.chinese")}</option>
            </select>
          ),
        },
        {
          category: "execution",
          title: t("settings.timeout"),
          description: t("settings.timeoutDescription"),
          control: (
            <form
              className="setting-input-group"
              onSubmit={(event) => {
                event.preventDefault();
                void update({ defaultTimeoutMs: Number(timeout) });
              }}
            >
              <input
                data-testid="default-timeout"
                aria-label={t("settings.timeout")}
                required
                type="number"
                min="1000"
                max="300000"
                value={timeout}
                onChange={(event) => setTimeoutDraft(event.target.value)}
              />
              <button
                className="secondary"
                disabled={Number(timeout) === settings.defaultTimeoutMs}
              >
                {t("common.save")}
              </button>
            </form>
          ),
        },
        {
          category: "execution",
          title: t("settings.headless"),
          description: t("settings.headlessDescription"),
          control: (
            <Switch
              label={t("settings.headless")}
              checked={settings.browserHeadless}
              onChange={(checked) => void update({ browserHeadless: checked })}
            />
          ),
        },
        {
          category: "notifications",
          title: t("settings.batchNotifications"),
          description: t("settings.batchNotificationsDescription"),
          control: (
            <Switch
              label={t("settings.batchNotifications")}
              checked={settings.notificationEnabled}
              onChange={(checked) =>
                void update({ notificationEnabled: checked })
              }
            />
          ),
        },
        {
          category: "notifications",
          title: t("settings.scheduledNotifications"),
          description: t("settings.scheduledNotificationsDescription"),
          control: (
            <Switch
              label={t("settings.scheduledNotifications")}
              checked={settings.notifyScheduledRuns}
              onChange={(checked) =>
                void update({ notifyScheduledRuns: checked })
              }
            />
          ),
        },
      ]
    : [];
  const cleanupVisible =
    settings &&
    show("data") &&
    matches(
      t("cleanup.title"),
      t("cleanup.note"),
      t("cleanup.historyDays"),
      t("cleanup.backupDays"),
    );
  const backupVisible =
    show("data") && matches(t("backup.title"), t("backup.note"));
  const dataVisible =
    show("data") && matches(t("settings.localData"), info?.userDataPath ?? "");
  const updateVisible =
    category === "all" && matches(t("updates.title"), t("updates.note"));

  const visible = rows.filter(
    (row) =>
      show(row.category) &&
      matches(
        row.title,
        row.description,
        t(
          row.category === "notifications"
            ? "nav.notifications"
            : `settings.${row.category}`,
        ),
      ),
  );
  return (
    <>
      <PageHeader
        eyebrow={t("settings.eyebrow")}
        title={t(
          initialCategory === "data"
            ? "nav.data"
            : initialCategory === "notifications"
              ? "nav.notifications"
              : "settings.title",
        )}
        actions={
          initialCategory === "all" ? (
            <button
              className="secondary"
              onClick={() => onNavigate("automation")}
            >
              <Icon name="terminal" size={16} />
              {t("nav.automation")}
            </button>
          ) : undefined
        }
        description={t(
          initialCategory === "data"
            ? "settings.backupScope"
            : initialCategory === "notifications"
              ? "notifications.description"
              : "settings.description",
        )}
      />
      <div className="settings-search">
        <Icon name="search" />
        <input
          data-testid="settings-search"
          aria-label={t("settings.search")}
          placeholder={t("settings.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {initialCategory !== "data" && (
          <span role="status">{t(`settings.${saveState}`)}</span>
        )}
      </div>
      <div className="settings-layout">
        <div className="settings-tabs" hidden={initialCategory !== "all"}>
          <nav className="settings-categories" aria-label={t("nav.settings")}>
            {(["all", "appearance", "execution"] as const).map((group) => (
              <button
                key={group}
                data-testid={`settings-category-${group}`}
                className={category === group ? "active" : ""}
                aria-current={category === group ? "page" : undefined}
                onClick={() => setCategory(group)}
              >
                {t(`settings.${group}`)}
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-content">
          {!settings ? (
            <p>{t("common.loading")}</p>
          ) : (
            <>
              {updateVisible && <UpdatesPanel onError={onError} />}
              {(["appearance", "execution", "notifications"] as const).map(
                (group) => {
                  const groupRows = visible.filter(
                    (row) => row.category === group,
                  );
                  return (
                    groupRows.length > 0 && (
                      <section className="panel settings-panel" key={group}>
                        <h2>
                          {t(
                            group === "notifications"
                              ? "nav.notifications"
                              : `settings.${group}`,
                          )}
                        </h2>
                        {groupRows.map((row) => (
                          <SettingRow
                            key={row.title}
                            title={row.title}
                            description={row.description}
                          >
                            {row.control}
                          </SettingRow>
                        ))}
                      </section>
                    )
                  );
                },
              )}
              {category === "notifications" && settings && (
                <NotificationsPage
                  embedded
                  settingsOverride={settings}
                  onSettings={() => setCategory("notifications")}
                  onError={onError}
                />
              )}
              {dataVisible && (
                <section className="panel settings-panel">
                  <h2>{t("settings.localData")}</h2>
                  <code className="data-path">
                    {info?.userDataPath ?? t("common.loading")}
                  </code>
                  <button
                    data-testid="open-data-folder"
                    className="secondary"
                    onClick={() =>
                      void window.siteRunner.app.openDataFolder().catch(onError)
                    }
                  >
                    {t("settings.openData")}
                  </button>
                </section>
              )}
              {show("data") &&
                matches(
                  t("settings.ruleFiles"),
                  t("settings.templateFiles"),
                ) && (
                  <section className="panel settings-panel">
                    <h2>{t("tasks.more")}</h2>
                    <div className="setting-row">
                      <strong>{t("settings.ruleFiles")}</strong>
                      <div className="template-actions">
                        <button
                          className="secondary"
                          disabled={!sites.length}
                          onClick={() => setRulesExport(true)}
                        >
                          {t("rules.export")}
                        </button>
                        <button
                          className="secondary"
                          disabled={fileBusy || !profiles.length}
                          onClick={() => void importFile("rules")}
                        >
                          {t("rules.import")}
                        </button>
                      </div>
                    </div>
                    <div className="setting-row">
                      <strong>{t("settings.templateFiles")}</strong>
                      <div className="template-actions">
                        <button
                          className="secondary"
                          disabled={!templates.length}
                          onClick={() => setTemplateExport(true)}
                        >
                          {t("templates.export")}
                        </button>
                        <button
                          className="secondary"
                          disabled={fileBusy}
                          onClick={() => void importFile("templates")}
                        >
                          {t("templates.import")}
                        </button>
                      </div>
                    </div>
                    <p className="section-description">
                      {t("settings.backupScope")}
                    </p>
                  </section>
                )}
              {backupVisible && (
                <ConfigurationPanel
                  onError={onError}
                  onChange={async () => {
                    await onChange();
                    const next = await window.siteRunner.settings.get();
                    setSettings(next);
                    setTimeoutDraft(String(next.defaultTimeoutMs));
                    setLanguage(next.language);
                    apply(next);
                  }}
                />
              )}
              {cleanupVisible && (
                <CleanupPanel
                  settings={settings}
                  update={update}
                  onChange={onChange}
                  onError={onError}
                />
              )}
              {!visible.length &&
                !cleanupVisible &&
                !backupVisible &&
                !dataVisible &&
                !updateVisible && (
                  <p className="table-empty">{t("settings.noResults")}</p>
                )}
            </>
          )}
        </div>
      </div>
      {(rulesExport || rules) && (
        <SiteRulesDialog
          sites={sites}
          profiles={profiles}
          rules={rules}
          onClose={() => {
            setRulesExport(false);
            setRules(null);
          }}
          onChange={onChange}
          onError={onError}
        />
      )}
      {(templateExport || templateInputs) && (
        <TemplateFilesDialog
          templates={templates}
          inputs={templateInputs}
          onClose={() => {
            setTemplateExport(false);
            setTemplateInputs(null);
          }}
          onChange={onChange}
          onError={onError}
        />
      )}
    </>
  );
}
