import { useEffect, useState } from "react";
import type { RunRecord, Site, SiteRunnerApi } from "../../shared/types";
import { resultKind } from "../../shared/task-presentation";
import { RunDetailDialog } from "../components/RunDetailDialog";
import { PageHeader } from "../components/PageHeader";
import { useI18n } from "../i18n";

export function RunHistoryPage({
  runs,
  sites,
  onError,
}: {
  runs: RunRecord[];
  sites: Site[];
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const [siteId, setSiteId] = useState(""),
    [status, setStatus] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [offset, setOffset] = useState(0),
    [visible, setVisible] = useState<RunRecord[]>([]);
  const [detail, setDetail] = useState<Awaited<
    ReturnType<SiteRunnerApi["runs"]["detail"]>
  > | null>(null);
  useEffect(() => {
    let disposed = false;
    void window.siteRunner.runs
      .search({
        ...(siteId ? { siteId } : {}),
        ...(status ? { status: status as "success" | "failed" } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        offset,
      })
      .then((next) => {
        if (!disposed) setVisible(next);
      })
      .catch(onError);
    return () => {
      disposed = true;
    };
  }, [runs, siteId, status, from, to, offset, onError]);
  return (
    <>
      <PageHeader
        eyebrow={t("history.eyebrow")}
        title={t("history.title")}
        description={t("history.description")}
      />
      <div className="history-filters">
        <select
          aria-label={t("history.filter")}
          value={siteId}
          onChange={(event) => {
            setSiteId(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t("history.allSites")}</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        <select
          aria-label={t("history.status")}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setOffset(0);
          }}
        >
          <option value="">{t("history.allStatuses")}</option>
          <option value="success">{t("common.success")}</option>
          <option value="failed">{t("common.failed")}</option>
        </select>
        <label>
          {t("history.from")}
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label>
          {t("history.to")}
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
          />
        </label>
      </div>
      <section className="panel table-panel">
        <div className="table-head">
          <span>{t("history.status")}</span>
          <span>{t("history.site")}</span>
          <span>{t("history.trigger")}</span>
          <span>{t("history.finished")}</span>
          <span>{t("history.details")}</span>
        </div>
        {visible.length === 0 ? (
          <div className="table-empty">{t("history.empty")}</div>
        ) : (
          visible.map((run) => (
            <div className="table-row" key={run.id}>
              <span>
                <i className={`result-dot ${resultKind(run)}`} />
                {t(`result.${resultKind(run)}`)}
              </span>
              <strong>{run.siteName}</strong>
              <span>{t(`history.trigger.${run.trigger}`)}</span>
              <span>{new Date(run.finishedAt).toLocaleString(language)}</span>
              <span
                className="run-details"
                title={run.error ?? run.message ?? ""}
              >
                <button
                  className="text-button"
                  data-testid={`run-detail-${run.id}`}
                  onClick={() =>
                    void window.siteRunner.runs
                      .detail(run.id)
                      .then(setDetail)
                      .catch(onError)
                  }
                >
                  {t("history.view")}
                </button>
                {run.message ?? run.error?.split("\n")[0] ?? "—"}
              </span>
            </div>
          ))
        )}
      </section>
      <div className="template-actions">
        <button
          className="secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          {t("history.previous")}
        </button>
        <span>{t("history.page", { page: offset / 50 + 1 })}</span>
        <button
          className="secondary"
          disabled={visible.length < 50}
          onClick={() => setOffset(offset + 50)}
        >
          {t("history.next")}
        </button>
      </div>
      {detail && (
        <RunDetailDialog
          detail={detail}
          site={sites.find((site) => site.id === detail.run.siteId)}
          onClose={() => setDetail(null)}
          onError={onError}
        />
      )}
    </>
  );
}
