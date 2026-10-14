import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AppInfo,
  BrowserProfile,
  RunRecord,
  Site,
  ScriptTemplate,
  SiteFolder,
  RuntimeSnapshot,
  RunLogEntry,
} from "../shared/types";
import { ProfilesPage } from "./pages/ProfilesPage";
import { RunHistoryPage } from "./pages/RunHistoryPage";
import { SitesPage } from "./pages/SitesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useI18n } from "./i18n";
import { TemplatesPage } from "./pages/TemplatesPage";
import { OutputPanel } from "./workspace/OutputPanel";
import { SidebarContext } from "./workspace/SidebarPortal";
import { busySiteIds } from "../shared/runtime";
import { Icon } from "./workspace/Icon";
import { AutomationHelpPage } from "./pages/AutomationHelpPage";
import { CommandPalette } from "./workspace/CommandPalette";
import { navigation, type PageName } from "./workspace/navigation";

export function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<PageName>("sites");
  const [sidebarTarget, setSidebarTarget] = useState<HTMLElement | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem("site-runner.sidebar") !== "hidden",
  );
  const [outputOpen, setOutputOpen] = useState(
    () => localStorage.getItem("site-runner.output") === "open",
  );
  const [openRequest, setOpenRequest] = useState<{
    id: number;
    siteId?: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [templateRecording, setTemplateRecording] = useState(false);
  const navigate = useCallback(
    (next: PageName) => {
      const target = next === "overview" ? "sites" : next;
      if (templateRecording && target !== "templates") {
        setNotice(t("workbench.finishRecording"));
        return false;
      }
      setPage(target);
      return true;
    },
    [templateRecording, t],
  );
  const toggleSidebar = useCallback(
    () =>
      setSidebarOpen((current) => {
        localStorage.setItem(
          "site-runner.sidebar",
          current ? "hidden" : "visible",
        );
        return !current;
      }),
    [],
  );
  const toggleOutput = useCallback(
    () =>
      setOutputOpen((current) => {
        localStorage.setItem("site-runner.output", current ? "closed" : "open");
        return !current;
      }),
    [],
  );
  const openTask = useCallback(
    (siteId?: string) => {
      if (!navigate("sites")) return;
      setOpenRequest({ id: Date.now(), siteId });
    },
    [navigate],
  );
  const consumeRequest = useCallback(() => setOpenRequest(null), []);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [folders, setFolders] = useState<SiteFolder[]>([]);
  const [profiles, setProfiles] = useState<BrowserProfile[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [siteTemplate, setSiteTemplate] = useState<ScriptTemplate | null>(null);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [runtime, setRuntime] = useState<RuntimeSnapshot>({
    revision: 0,
    runs: [],
    batches: [],
  });
  const [logs, setLogs] = useState<RunLogEntry[]>([]);
  const [closing, setClosing] = useState(false);
  const [settingsRevision, setSettingsRevision] = useState(0);
  const [commandOpen, setCommandOpen] = useState(false);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || closing) return;
      if (
        event.key.toLowerCase() === "k" ||
        (event.shiftKey && event.key.toLowerCase() === "p")
      ) {
        if (document.querySelector(".modal-backdrop") && !commandOpen) return;
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (!document.querySelector('[aria-modal="true"], .modal-backdrop')) {
        if (event.key.toLowerCase() === "b") {
          event.preventDefault();
          toggleSidebar();
        }
        if (event.key.toLowerCase() === "j") {
          event.preventDefault();
          toggleOutput();
        }
      }
      if (
        event.key === "," &&
        !document.querySelector('[aria-modal="true"], .modal-backdrop')
      ) {
        event.preventDefault();
        navigate("settings");
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [closing, commandOpen, navigate, toggleSidebar, toggleOutput]);
  useEffect(() => window.siteRunner.app.onClosing(() => setClosing(true)), []);
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (main) main.scrollTop = 0;
  }, [page]);

  const refresh = useCallback(async () => {
    const [nextSites, nextProfiles, nextRuns, nextTemplates, nextFolders] =
      await Promise.all([
        window.siteRunner.sites.list(),
        window.siteRunner.profiles.list(),
        window.siteRunner.runs.list(),
        window.siteRunner.templates.list(),
        window.siteRunner.folders.list(),
      ]);
    setSites(nextSites);
    setProfiles(nextProfiles);
    setRuns(nextRuns);
    setTemplates(nextTemplates);
    setFolders(nextFolders);
  }, []);

  useEffect(() => {
    void window.siteRunner.app.info().then(setInfo);
    queueMicrotask(() => {
      void refresh().catch((error: unknown) =>
        setNotice(error instanceof Error ? error.message : String(error)),
      );
    });
  }, [refresh]);

  useEffect(() => {
    let mounted = true,
      revision = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const accept = (state: RuntimeSnapshot) => {
      if (!mounted || state.revision < revision) return false;
      revision = state.revision;
      setRuntime(state);
      return true;
    };
    const unsubscribe = window.siteRunner.runs.onState((state) => {
      if (!accept(state)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh().catch((error: unknown) => {
          if (mounted)
            setNotice(error instanceof Error ? error.message : String(error));
        });
      }, 200);
    });
    const stopLogs = window.siteRunner.runs.onLog((entry) =>
      setLogs((current) => [...current.slice(-199), entry]),
    );
    void window.siteRunner.runs
      .state()
      .then(accept)
      .catch((error: unknown) => {
        if (mounted)
          setNotice(error instanceof Error ? error.message : String(error));
      });
    return () => {
      mounted = false;
      clearTimeout(timer);
      unsubscribe();
      stopLogs();
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const busy = useMemo(() => busySiteIds(runtime), [runtime]);
  const busyProfiles = useMemo(
    () =>
      new Set(
        sites
          .filter((site) => busy.has(site.id))
          .map((site) => site.browserProfileId),
      ),
    [sites, busy],
  );
  const showError = useCallback(
    (error: unknown) =>
      setNotice(error instanceof Error ? error.message : String(error)),
    [],
  );
  const renderPage = (target: PageName) => {
    if (target === "sites")
      return (
        <SitesPage
          runs={runs}
          runtime={runtime}
          busy={busy}
          openRequest={openRequest}
          onRequestConsumed={consumeRequest}
          folders={folders}
          sites={sites}
          profiles={profiles}
          templates={templates}
          initialTemplate={siteTemplate}
          onTemplateConsumed={() => setSiteTemplate(null)}
          onChange={refresh}
          onError={showError}
        />
      );
    if (target === "templates")
      return (
        <TemplatesPage
          templates={templates}
          profiles={profiles}
          onChange={refresh}
          onError={showError}
          canCreate={profiles.length > 0}
          onRecordingChange={setTemplateRecording}
          onUse={(template) => {
            if (navigate("sites")) setSiteTemplate(template);
          }}
        />
      );
    if (target === "profiles")
      return (
        <ProfilesPage
          busyProfiles={busyProfiles}
          profiles={profiles}
          onChange={refresh}
          onError={showError}
        />
      );
    if (target === "history")
      return <RunHistoryPage runs={runs} sites={sites} onError={showError} />;
    if (target === "automation" && !info) return <p>{t("common.loading")}</p>;
    if (target === "automation")
      return (
        <AutomationHelpPage
          info={info}
          sites={sites}
          folders={folders}
          onError={showError}
        />
      );
    return (
      <SettingsPage
        key={`${target}-${settingsRevision}`}
        initialCategory={
          target === "notifications"
            ? "notifications"
            : target === "data"
              ? "data"
              : "all"
        }
        onNavigate={navigate}
        info={info}
        sites={sites}
        profiles={profiles}
        templates={templates}
        onChange={refresh}
        onError={showError}
      />
    );
  };
  const hasActiveRuns = runtime.runs.length > 0 || runtime.batches.length > 0;

  useEffect(() => {
    if (hasActiveRuns) queueMicrotask(() => setOutputOpen(true));
  }, [hasActiveRuns]);

  return (
    <SidebarContext.Provider value={{ target: sidebarTarget, page }}>
      <div
        className={`app-shell workbench ${sidebarOpen ? "" : "sidebar-hidden"}`}
      >
        <div className="titlebar" inert={closing}>
          <div className="titlebar-brand">
            <span className="brand-mark">
              <Icon name="play" size={14} />
            </span>
            <strong>Site Runner</strong>
            <span className="local-tag">LOCAL</span>
          </div>
          <button
            className="command-center"
            data-testid="open-command-palette"
            onClick={() => setCommandOpen(true)}
          >
            <Icon name="search" size={14} />
            <span>{t("workbench.search")}</span>
            <kbd>⌘ / Ctrl K</kbd>
          </button>
          <div className="titlebar-actions">
            <button
              className="icon-button"
              data-testid="toggle-sidebar"
              aria-label={t("workbench.toggleSidebar")}
              title={t("workbench.toggleSidebar")}
              aria-pressed={sidebarOpen}
              onClick={toggleSidebar}
            >
              <Icon name="panel" size={17} />
            </button>
            <button
              className="icon-button"
              data-testid="toggle-output"
              aria-label={t("workbench.showOutput")}
              title={t("workbench.showOutput")}
              aria-pressed={outputOpen}
              onClick={toggleOutput}
            >
              <Icon name="terminal" size={17} />
            </button>
          </div>
        </div>
        <aside
          className="sidebar explorer"
          inert={closing}
          aria-label={t("navigation.title")}
        >
          <nav className="feature-nav" aria-label={t("navigation.title")}>
            {navigation.map((item) => (
              <button
                key={item.id}
                className={page === item.id ? "active" : ""}
                data-testid={`nav-${item.id}`}
                aria-label={t(item.label)}
                title={!sidebarOpen ? t(item.label) : undefined}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => {
                  if (item.id === "settings")
                    setSettingsRevision((value) => value + 1);
                  navigate(item.id);
                }}
              >
                <Icon name={item.icon} size={18} />
                <span className="nav-label">{t(item.label)}</span>
                {item.id === "sites" && (
                  <span className="nav-count">{sites.length}</span>
                )}
              </button>
            ))}
          </nav>
          <div
            className="explorer-context"
            ref={setSidebarTarget}
            hidden={!sidebarOpen || page !== "sites"}
          />
          <div className="sidebar-bottom">
            <button
              className="sidebar-output"
              onClick={toggleOutput}
              aria-label={t("workbench.output")}
              title={!sidebarOpen ? t("workbench.output") : undefined}
              aria-pressed={outputOpen}
            >
              <Icon name="terminal" size={18} />
              <span className="nav-label">{t("workbench.output")}</span>
              {busy.size > 0 && <span className="status-dot working" />}
            </button>
            <div className="sidebar-foot">
              <span className="status-dot" />
              <span className="nav-label">{t("app.local")}</span>
              <span className="nav-label">v{info?.version ?? "—"}</span>
            </div>
          </div>
        </aside>
        <div className="workspace-main" inert={closing}>
          <main id="main-content">
            <section
              className="workspace-page"
              data-page="sites"
              aria-label={t("nav.sites")}
              hidden={page !== "sites"}
            >
              {renderPage("sites")}
            </section>
            {page !== "sites" && (
              <section
                className="workspace-page"
                data-page={page}
                aria-label={t(`nav.${page}`)}
                key={page}
              >
                {["templates", "profiles"].includes(page) && (
                  <button
                    className="text-button settings-back"
                    onClick={() => navigate("settings")}
                  >
                    ← {t("settings.back")}
                  </button>
                )}
                {renderPage(page)}
              </section>
            )}
          </main>
          {hasActiveRuns && !outputOpen && (
            <div className="running-strip">
              <span className="status-dot working" />
              <span>{t("workspace.busy", { count: busy.size })}</span>
              <button className="text-button" onClick={toggleOutput}>
                {t("workbench.showOutput")}
                <Icon name="arrowDown" size={12} />
              </button>
            </div>
          )}
          <OutputPanel
            logs={logs}
            sites={sites}
            runtime={runtime}
            open={outputOpen}
            onToggle={toggleOutput}
            onClear={() => setLogs([])}
            onError={showError}
          />
        </div>
        <footer className="status-bar" inert={closing}>
          <span>
            <span className={`status-dot ${busy.size ? "working" : ""}`} />
            {t(busy.size ? "workspace.busy" : "workspace.ready", {
              count: busy.size,
            })}
          </span>
          <span>
            <span>{t("overview.configured", { count: sites.length })}</span>
            <span className="status-divider" />
            <span>
              {t("overview.profiles")} {profiles.length}
            </span>
            <span className="status-divider" />
            <span>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
          </span>
        </footer>
        {commandOpen && !closing && (
          <CommandPalette
            sites={sites}
            busy={busy}
            onOpenTask={openTask}
            onNavigate={navigate}
            onToggleSidebar={toggleSidebar}
            onToggleOutput={toggleOutput}
            onClose={() => setCommandOpen(false)}
          />
        )}
        {notice && !closing && (
          <div className="toast" role="alert">
            {notice}
          </div>
        )}
        {closing && (
          <div className="modal-backdrop" data-testid="closing-overlay">
            <section
              className="small-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="closing-title"
            >
              <div className="modal-head">
                <div>
                  <h2 id="closing-title">{t("app.closing")}</h2>
                  <p role="status">{t("app.closingNote")}</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </SidebarContext.Provider>
  );
}
