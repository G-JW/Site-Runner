import { useEffect, useMemo, useState } from "react";
import type {
  BatchResult,
  BrowserProfile,
  RunRecord,
  Site,
  ScriptTemplate,
  SiteRule,
  SiteFolder,
  RuntimeSnapshot,
  SiteRunnerApi,
} from "../../shared/types";
import { effectiveSchedule, resultKind } from "../../shared/task-presentation";
import { PageHeader } from "../components/PageHeader";
import { SiteEditor } from "../components/SiteEditor";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { FolderPanel } from "../components/FolderPanel";
import { SiteRulesDialog } from "../components/SiteRulesDialog";
import { RunDetailDialog } from "../components/RunDetailDialog";
import { useI18n } from "../i18n";
import { SidebarPortal } from "../workspace/SidebarPortal";
import { Icon } from "../workspace/Icon";

export function SitesPage({
  runtime,
  busy,
  runs,
  openRequest,
  onRequestConsumed,
  folders,
  sites,
  profiles,
  templates,
  initialTemplate,
  onTemplateConsumed,
  onChange,
  onError,
}: {
  runtime: RuntimeSnapshot;
  busy: Set<string>;
  runs: RunRecord[];
  openRequest: { id: number; siteId?: string } | null;
  onRequestConsumed(): void;
  folders: SiteFolder[];
  sites: Site[];
  profiles: BrowserProfile[];
  templates: ScriptTemplate[];
  initialTemplate: ScriptTemplate | null;
  onTemplateConsumed(): void;
  onChange(): Promise<void>;
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const [creating, setCreating] = useState(false);
  async function createTask() {
    if (creating) return;
    setCreating(true);
    try {
      const settings = await window.siteRunner.settings.get();
      setDefaultTimeoutMs(settings.defaultTimeoutMs);
      if (!profiles.length) {
        await window.siteRunner.profiles.create("Default");
        await onChange();
      }
      setEditing("new");
    } catch (error) {
      onError(error);
    } finally {
      setCreating(false);
    }
  }
  const [editing, setEditing] = useState<Site | "new" | null>(null);
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const running = new Set([...starting, ...busy]);
  const [defaultTimeoutMs, setDefaultTimeoutMs] = useState(30_000);
  const [pendingDelete, setPendingDelete] = useState<Site | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importRules, setImportRules] = useState<SiteRule[] | null>(null);
  const [loadingImport, setLoadingImport] = useState(false);
  const [folderId, setFolderId] = useState("all");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const [scope, setScope] = useState<"view" | "selected" | "failed">("view");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<BatchResult | null>(null);
  const [nextRuns, setNextRuns] = useState<Record<string, string | null>>({});
  const [detail, setDetail] = useState<Awaited<
    ReturnType<SiteRunnerApi["runs"]["detail"]>
  > | null>(null);
  const activeFolder =
    folderId === "all" ||
    folderId === "ungrouped" ||
    folders.some((item) => item.id === folderId)
      ? folderId
      : "all";
  const today = new Date().toDateString();
  // Only the latest attempt for each task today contributes to daily totals.
  const todayResults = sites
    .map((site) => site.lastRun)
    .filter((run) => run && new Date(run.finishedAt).toDateString() === today);
  const todayKinds = ["success", "failed", "pending"] as const;
  const dailyCounts = {
    success: todayResults.filter((run) => resultKind(run) === "success").length,
    failed: todayResults.filter((run) => resultKind(run) === "failed").length,
    pending: sites.filter(
      (site) =>
        site.enabled &&
        (!site.lastRun ||
          new Date(site.lastRun.finishedAt).toDateString() !== today),
    ).length,
  };
  const visibleSites = sites
    .filter((site) => {
      const inFolder =
        activeFolder === "all" ||
        (activeFolder === "ungrouped"
          ? !site.folderId
          : site.folderId === activeFolder);
      const matchesSearch = `${site.name} ${site.url}`
        .toLowerCase()
        .includes(search.trim().toLowerCase());
      const kind = resultKind(site.lastRun);
      const matchesStatus =
        filter === "all" ||
        (filter === "enabled"
          ? site.enabled
          : filter === "disabled"
            ? !site.enabled
            : filter === "active"
              ? running.has(site.id)
              : filter === "notRun"
                ? !site.lastRun
                : filter === "pending"
                  ? site.enabled &&
                    (!site.lastRun ||
                      new Date(site.lastRun.finishedAt).toDateString() !==
                        today)
                  : filter.startsWith("today-")
                    ? site.lastRun &&
                      new Date(site.lastRun.finishedAt).toDateString() ===
                        today &&
                      kind === filter.slice(6)
                    : filter === "success"
                      ? site.lastRun?.status === "success"
                      : kind === filter);
      return inFolder && matchesSearch && matchesStatus;
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, language)
        : sort === "recent"
          ? (b.lastRun ? Date.parse(b.lastRun.finishedAt) : 0) -
            (a.lastRun ? Date.parse(a.lastRun.finishedAt) : 0)
          : 0,
    );
  const selectedIds = visibleSites
    .filter((site) => selected.has(site.id))
    .map((site) => site.id);
  const enabledIds = visibleSites
    .filter((site) => site.enabled)
    .map((site) => site.id);
  const selectedRunIds = visibleSites
    .filter((site) => site.enabled && selected.has(site.id))
    .map((site) => site.id);
  const failedIds = visibleSites
    .filter((site) => site.enabled && site.lastRun?.status === "failed")
    .map((site) => site.id);
  const runIds =
    scope === "selected"
      ? selectedRunIds
      : scope === "failed"
        ? failedIds
        : enabledIds;
  const cannotRun =
    !runIds.length ||
    batchRunning ||
    runtime.batches.length > 0 ||
    runIds.some((id) => running.has(id));
  function selectFolder(id: string) {
    setFolderId(id);
    setSelected(new Set());
  }
  async function move(target: string) {
    if (!selectedIds.length) return;
    setMoving(true);
    try {
      await window.siteRunner.folders.moveSites(selectedIds, target || null);
      await onChange();
      setSelected(new Set());
    } catch (error) {
      onError(error);
    } finally {
      setMoving(false);
    }
  }
  async function runView() {
    if (cannotRun) return;
    setBatchRunning(true);
    setBatchSummary(null);
    try {
      const result = await window.siteRunner.runs.runSites(runIds);
      setBatchSummary(result);
      await onChange();
    } catch (error) {
      onError(error);
    } finally {
      setBatchRunning(false);
    }
  }
  async function loadImport() {
    setLoadingImport(true);
    try {
      const rules = await window.siteRunner.sites.previewImport();
      if (rules) setImportRules(rules);
    } catch (error) {
      onError(error);
    } finally {
      setLoadingImport(false);
    }
  }
  const profileNames = useMemo(
    () => Object.fromEntries(profiles.map((item) => [item.id, item.name])),
    [profiles],
  );
  useEffect(() => {
    void window.siteRunner.settings
      .get()
      .then((settings) => setDefaultTimeoutMs(settings.defaultTimeoutMs))
      .catch(onError);
  }, [onError]);
  useEffect(() => {
    let disposed = false;
    const load = () =>
      void window.siteRunner.runs
        .nextSchedules()
        .then((next) => {
          if (!disposed) setNextRuns(next);
        })
        .catch(onError);
    load();
    const timer = setInterval(load, 30000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [sites, folders, runs, onError]);
  async function toggle(site: Site) {
    try {
      await window.siteRunner.sites.save({ ...site, enabled: !site.enabled });
      await onChange();
    } catch (error) {
      onError(error);
    }
  }
  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await window.siteRunner.sites.remove(pendingDelete.id);
      setPendingDelete(null);
      await onChange();
    } catch (error) {
      onError(error);
    } finally {
      setDeleting(false);
    }
  }
  async function run(site: Site) {
    setStarting((current) => new Set(current).add(site.id));
    try {
      const result = await window.siteRunner.runs.runSite(site.id);
      await onChange();
      const history = await window.siteRunner.runs.list(site.id);
      const record = history.find(
        (item) => item.startedAt === result.startedAt,
      );
      if (record) setDetail(await window.siteRunner.runs.detail(record.id));
    } catch (error) {
      onError(error);
    } finally {
      setStarting((current) => {
        const next = new Set(current);
        next.delete(site.id);
        return next;
      });
    }
  }
  const viewDetail = (site: Site) => {
    if (site.lastRun)
      void window.siteRunner.runs
        .detail(site.lastRun.id)
        .then(setDetail)
        .catch(onError);
  };
  useEffect(() => {
    if (!initialTemplate) return;
    let disposed = false;
    void window.siteRunner.settings
      .get()
      .then((settings) => {
        if (disposed) return;
        setDefaultTimeoutMs(settings.defaultTimeoutMs);
        setEditing("new");
      })
      .catch(onError);
    return () => {
      disposed = true;
    };
  }, [initialTemplate, onError]);
  useEffect(() => {
    if (!openRequest) return;
    queueMicrotask(() => {
      if (openRequest.siteId) {
        const site = sites.find((item) => item.id === openRequest.siteId);
        if (site && !busy.has(site.id)) setEditing(site);
      } else void createTask();
      onRequestConsumed();
    });
    // Each request is consumed once; current data is captured at dispatch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);
  return (
    <>
      <SidebarPortal page="sites">
        <FolderPanel
          folders={folders}
          sites={sites}
          selected={activeFolder}
          onSelect={selectFolder}
          onChange={onChange}
          onError={onError}
        />
      </SidebarPortal>
      <PageHeader
        eyebrow={t("tasks.today")}
        title={t("sites.title")}
        description={
          sites.length
            ? t("workbench.taskCounts", {
                count: sites.length,
                enabled: sites.filter((site) => site.enabled).length,
                groups: folders.length,
              })
            : t("tasks.emptyNote")
        }
        actions={
          <>
            <details className="task-file-menu">
              <summary className="secondary">{t("tasks.more")}</summary>
              <div className="task-file-options">
                <button
                  type="button"
                  data-testid="export-rules"
                  disabled={!sites.length}
                  onClick={() => setExporting(true)}
                >
                  {t("rules.export")}
                </button>
                <button
                  type="button"
                  data-testid="import-rules"
                  disabled={loadingImport || !profiles.length}
                  onClick={() => void loadImport()}
                >
                  {t("rules.import")}
                </button>
              </div>
            </details>
            <button
              data-testid="add-site"
              className="primary"
              disabled={creating}
              onClick={() => void createTask()}
            >
              <Icon name="plus" size={14} />
              {t("task.create")}
            </button>
          </>
        }
      />
      {!!sites.length && (
        <>
          <div className="task-summary" data-testid="task-summary">
            {todayKinds.map((kind) => (
              <button
                key={kind}
                className={
                  filter === (kind === "pending" ? "pending" : `today-${kind}`)
                    ? "active"
                    : ""
                }
                onClick={() => {
                  setFolderId("all");
                  setSearch("");
                  setSelected(new Set());
                  setFilter(kind === "pending" ? "pending" : `today-${kind}`);
                }}
              >
                <span>
                  {t(kind === "failed" ? "tasks.attention" : `tasks.${kind}`)}
                </span>
                <strong>{dailyCounts[kind]}</strong>
              </button>
            ))}
          </div>
          <p className="sites-view-note">{t("tasks.todayNote")}</p>
        </>
      )}
      {sites.length === 0 ? (
        <section className="panel empty-state">
          <h2>{t("tasks.emptyTitle")}</h2>
          <p>{t("tasks.emptyNote")}</p>
          <button
            className="primary"
            disabled={creating}
            onClick={() => void createTask()}
          >
            {t("task.create")}
          </button>
        </section>
      ) : (
        <div className="sites-layout">
          <div className="sites-content">
            <div className="task-toolbar">
              <div className="sites-tools">
                <input
                  data-testid="site-search"
                  aria-label={t("folders.search")}
                  placeholder={t("folders.search")}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelected(new Set());
                  }}
                />
                <select
                  data-testid="site-status-filter"
                  aria-label={t("sites.filter")}
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setSelected(new Set());
                  }}
                >
                  {(
                    [
                      "all",
                      "enabled",
                      "disabled",
                      "success",
                      "failed",
                      "notRun",
                      "active",
                    ] as const
                  ).map((value) => (
                    <option key={value} value={value}>
                      {t(`sites.filter.${value}`)}
                    </option>
                  ))}
                  <option value="pending">{t("tasks.pending")}</option>
                  {(["success", "failed"] as const).map((kind) => (
                    <option key={kind} value={`today-${kind}`}>
                      {t("tasks.today")} · {t(`result.${kind}`)}
                    </option>
                  ))}
                </select>
                <select
                  data-testid="site-sort"
                  aria-label={t("sites.sort")}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  {(["default", "name", "recent"] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(`sites.sort.${value}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="task-run-toolbar">
                <select
                  data-testid="run-scope"
                  aria-label={t("tasks.runScope")}
                  value={scope}
                  onChange={(event) =>
                    setScope(event.target.value as typeof scope)
                  }
                >
                  {(["view", "selected", "failed"] as const).map((item) => (
                    <option key={item} value={item}>
                      {t(`tasks.scope.${item}`)}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="run-tasks"
                  className="primary"
                  disabled={cannotRun}
                  onClick={() => void runView()}
                >
                  <Icon name="play" size={13} />
                  {t("tasks.runCount", { count: runIds.length })}
                </button>
              </div>
            </div>
            <p className="sites-view-note">{t("tasks.scopeNote")}</p>
            {batchSummary && (
              <p className="callout" role="status" data-testid="batch-summary">
                {batchSummary.stopped && (
                  <strong>{t("runtime.batchStopped")} · </strong>
                )}
                {t("runtime.batchResult", {
                  completed: batchSummary.total,
                  total: batchSummary.planned ?? batchSummary.total,
                  success: batchSummary.success,
                  failed: batchSummary.failed,
                })}
              </p>
            )}
            <div className="site-selection">
              <label className="checkbox">
                <input
                  data-testid="select-all-sites"
                  type="checkbox"
                  disabled={!visibleSites.length || moving}
                  checked={
                    visibleSites.length > 0 &&
                    selectedIds.length === visibleSites.length
                  }
                  onChange={(event) =>
                    setSelected(
                      event.target.checked
                        ? new Set(visibleSites.map((site) => site.id))
                        : new Set(),
                    )
                  }
                />
                {t("folders.selectAll")}
              </label>
              <span>
                {t("folders.selected", { count: selectedIds.length })}
              </span>
              <label>
                {t("folders.move")}
                <select
                  data-testid="move-sites"
                  value=""
                  disabled={
                    moving ||
                    !selectedIds.length ||
                    selectedIds.some((id) => running.has(id))
                  }
                  onChange={(event) =>
                    void move(
                      event.target.value === "ungrouped"
                        ? ""
                        : event.target.value,
                    )
                  }
                >
                  <option value="" disabled>
                    {t("folders.move")}
                  </option>
                  <option value="ungrouped">{t("folders.ungrouped")}</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="sites-view-note">
              {t("sites.viewNote", {
                visible: visibleSites.length,
                total: sites.length,
              })}
            </p>
            <section className="panel table-panel sites-table">
              <div className="table-head">
                <span>{t("sites.site")}</span>
                <span>{t("tasks.next")}</span>
                <span>{t("sites.lastRun")}</span>
                <span>{t("sites.actions")}</span>
              </div>
              {visibleSites.length === 0 ? (
                <div className="table-empty">{t("folders.empty")}</div>
              ) : (
                visibleSites.map((site) => {
                  const schedule = effectiveSchedule(site, folders);
                  const kind = resultKind(site.lastRun);
                  return (
                    <div
                      className="table-row"
                      data-testid={`site-row-${site.id}`}
                      key={site.id}
                    >
                      <div className="site-cell">
                        <input
                          type="checkbox"
                          aria-label={site.name}
                          checked={selected.has(site.id)}
                          disabled={moving}
                          onChange={(event) =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(site.id);
                              else next.delete(site.id);
                              return next;
                            })
                          }
                        />
                        <button
                          className={`toggle ${site.enabled ? "on" : ""}`}
                          disabled={running.has(site.id)}
                          aria-label={`${site.enabled ? t("tasks.disable") : t("tasks.enable")} ${site.name}`}
                          onClick={() => void toggle(site)}
                        >
                          <span />
                        </button>
                        <div>
                          <button
                            className="task-name-button"
                            disabled={running.has(site.id)}
                            onClick={() => setEditing(site)}
                          >
                            {site.name}
                          </button>
                          <small title={site.url}>{site.url}</small>
                          <small
                            className="site-folder-label"
                            title={profileNames[site.browserProfileId]}
                          >
                            {folders.find(
                              (folder) => folder.id === site.folderId,
                            )?.name ?? t("folders.ungrouped")}
                          </small>
                        </div>
                      </div>
                      <div className="task-plan-cell">
                        <span>
                          {!site.enabled
                            ? t("tasks.inactive")
                            : schedule
                              ? nextRuns[site.id]
                                ? new Date(nextRuns[site.id]!).toLocaleString(
                                    language,
                                    {
                                      month: "numeric",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : "—"
                              : t("tasks.manual")}
                        </span>
                        {schedule && (
                          <small title={schedule.cron}>
                            {schedule.source === "inherit"
                              ? t("tasks.inherit", { name: schedule.name! })
                              : schedule.cron}
                          </small>
                        )}
                      </div>
                      <div className="task-status-cell">
                        <button
                          className={`result-link ${kind}`}
                          disabled={!site.lastRun || running.has(site.id)}
                          onClick={() => viewDetail(site)}
                        >
                          <i className={`result-dot ${kind}`} />
                          {running.has(site.id)
                            ? t(
                                runtime.runs.find(
                                  (run) => run.siteId === site.id,
                                )?.phase === "running"
                                  ? "common.running"
                                  : "runtime.queued",
                              )
                            : t(`result.${kind}`)}
                        </button>
                        {site.lastRun && (
                          <small>
                            {new Date(site.lastRun.finishedAt).toLocaleString(
                              language,
                              {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </small>
                        )}
                      </div>
                      <div className="row-actions">
                        <button
                          disabled={running.has(site.id)}
                          onClick={() => void run(site)}
                        >
                          {t("sites.run")}
                        </button>
                        <button
                          disabled={running.has(site.id)}
                          onClick={() => setEditing(site)}
                        >
                          {t("common.edit")}
                        </button>
                        <details className="task-row-menu">
                          <summary aria-label={t("tasks.more")}>•••</summary>
                          <div className="task-file-options">
                            <button
                              disabled={running.has(site.id)}
                              onClick={() =>
                                void window.siteRunner.profiles
                                  .open(site.browserProfileId, site.url)
                                  .catch(onError)
                              }
                            >
                              {t("tasks.openWebsite")}
                            </button>
                            <button
                              className="danger-ghost"
                              disabled={running.has(site.id)}
                              onClick={() => setPendingDelete(site)}
                            >
                              {t("common.delete")}
                            </button>
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        </div>
      )}
      {editing && (
        <SiteEditor
          folders={folders}
          defaultFolderId={
            folders.some((item) => item.id === activeFolder)
              ? activeFolder
              : null
          }
          templates={templates}
          site={editing === "new" ? null : editing}
          profiles={profiles}
          defaultTimeoutMs={defaultTimeoutMs}
          initialScript={initialTemplate?.script ?? null}
          onClose={() => {
            setEditing(null);
            onTemplateConsumed();
          }}
          onSaved={async () => {
            await onChange();
          }}
          onError={onError}
        />
      )}
      {(exporting || importRules) && (
        <SiteRulesDialog
          sites={sites}
          profiles={profiles}
          rules={importRules}
          onClose={() => {
            setExporting(false);
            setImportRules(null);
          }}
          onChange={onChange}
          onError={onError}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("sites.deleteQuestion", { name: pendingDelete.name })}
          description={t("sites.deleteDescription")}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove()}
        />
      )}
      {detail && (
        <RunDetailDialog
          detail={detail}
          site={sites.find((site) => site.id === detail.run.siteId)}
          busy={busy.has(detail.run.siteId)}
          onClose={() => setDetail(null)}
          onEdit={() => {
            const site = sites.find((site) => site.id === detail.run.siteId);
            if (site) setEditing(site);
            setDetail(null);
          }}
          onError={onError}
        />
      )}
    </>
  );
}
