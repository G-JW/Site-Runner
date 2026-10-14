import { useEffect, useRef, useState } from "react";
import type { RunLogEntry, RuntimeSnapshot, Site } from "../../shared/types";
import { ActiveTasksPanel } from "../components/ActiveTasksPanel";
import { useI18n } from "../i18n";
import { Icon } from "./Icon";

export function OutputPanel({
  logs,
  sites,
  runtime,
  open,
  onToggle,
  onClear,
  onError,
}: {
  logs: RunLogEntry[];
  sites: Site[];
  runtime: RuntimeSnapshot;
  open: boolean;
  onToggle(): void;
  onClear(): void;
  onError(error: unknown): void;
}) {
  const { t, language } = useI18n();
  const [siteId, setSiteId] = useState("");
  const [follow, setFollow] = useState(true);
  const scroll = useRef<HTMLDivElement>(null);
  const visible = siteId
    ? logs.filter((entry) => entry.siteId === siteId)
    : logs;
  useEffect(() => {
    if (open && follow && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [logs, siteId, follow, open]);
  return (
    <section
      className={`output-panel ${open ? "expanded" : ""}`}
      aria-label={t("workbench.output")}
      data-testid="output-panel"
    >
      <div className="output-toolbar">
        <button
          className="output-heading"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="workspace-output"
        >
          <Icon name="terminal" size={15} />
          {t("workbench.output")}
          <span className="count-pill">{logs.length}</span>
        </button>
        <span className="output-state">
          <span
            className={`status-dot ${runtime.runs.length || runtime.batches.length ? "working" : ""}`}
          />
          {t(
            runtime.runs.length || runtime.batches.length
              ? "workspace.busy"
              : "workspace.ready",
            { count: runtime.runs.length },
          )}
        </span>
        {open && (
          <>
            <select
              data-testid="log-site-filter"
              aria-label={t("history.filter")}
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <option value="">{t("history.allSites")}</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <button
              className={`icon-button ${follow ? "active" : ""}`}
              aria-label={t("workbench.follow")}
              title={t("workbench.follow")}
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
            >
              <Icon name="arrowDown" size={15} />
            </button>
            <button
              className="text-button"
              onClick={onClear}
              disabled={!logs.length}
            >
              {t("sites.clear")}
            </button>
          </>
        )}
        <button
          className="icon-button"
          onClick={onToggle}
          aria-label={t(open ? "workbench.hideOutput" : "workbench.showOutput")}
          title={t(open ? "workbench.hideOutput" : "workbench.showOutput")}
        >
          <Icon name={open ? "chevronDown" : "chevronUp"} size={15} />
        </button>
      </div>
      <div id="workspace-output" hidden={!open}>
        <ActiveTasksPanel state={runtime} sites={sites} onError={onError} />
        <div className="log-lines" ref={scroll} data-testid="output-lines">
          {!visible.length && (
            <div className="output-empty">
              <Icon name="terminal" size={24} />
              <span>{t("workbench.outputEmpty")}</span>
              <small>{t("workbench.outputNote")}</small>
            </div>
          )}
          {visible.map((entry, index) => (
            <div className={entry.level} key={`${entry.timestamp}-${index}`}>
              <time>
                {new Date(entry.timestamp).toLocaleTimeString(language)}
              </time>
              <span>{entry.level}</span>
              <p>
                <strong>
                  {sites.find((site) => site.id === entry.siteId)?.name ??
                    entry.siteId}{" "}
                  ·{" "}
                </strong>
                {entry.message}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
