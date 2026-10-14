import { useRef } from "react";
import type { Site, SiteRunnerApi } from "../../shared/types";
import { useI18n } from "../i18n";
import { RunResultPanel } from "./RunResultPanel";
import { useDialogFocus } from "../workspace/useDialogFocus";

export function RunDetailDialog({
  detail,
  site,
  busy = false,
  onClose,
  onEdit,
  onError,
}: {
  detail: Awaited<ReturnType<SiteRunnerApi["runs"]["detail"]>>;
  site?: Site;
  busy?: boolean;
  onClose(): void;
  onEdit?(): void;
  onError(error: unknown): void;
}) {
  const { language, t } = useI18n();
  const ref = useRef<HTMLElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        data-testid="run-detail-dialog"
        className="editor-modal run-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-detail-title"
      >
        <div className="modal-head">
          <h2 id="run-detail-title">{detail.run.siteName}</h2>
          <button
            className="close"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="rules-content">
          <p className="section-description">
            {new Date(detail.run.startedAt).toLocaleString(language)} →{" "}
            {new Date(detail.run.finishedAt).toLocaleString(language)}
          </p>
          <RunResultPanel run={detail.run} />
          <details className="advanced-disclosure">
            <summary>{t("result.technical")}</summary>
            <p className="data-path">{detail.run.lastUrl}</p>
            <h3>{t("sites.runLog")}</h3>
            <pre className="run-error">
              {detail.logs.length
                ? detail.logs
                    .map(
                      (entry) =>
                        `${new Date(entry.timestamp).toLocaleTimeString(language)} [${entry.level}] ${entry.message}`,
                    )
                    .join("\n")
                : t("history.noLogs")}
            </pre>
          </details>
        </div>
        <div className="modal-actions">
          {site && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                void window.siteRunner.profiles
                  .open(site.browserProfileId, site.url)
                  .catch(onError)
              }
            >
              {t("tasks.openWebsite")}
            </button>
          )}
          {site && onEdit && (
            <button className="secondary" disabled={busy} onClick={onEdit}>
              {t("tasks.details")}
            </button>
          )}
          {detail.run.screenshotPath && (
            <button
              className="secondary"
              onClick={() =>
                void window.siteRunner.runs
                  .openScreenshot(detail.run.id)
                  .catch(onError)
              }
            >
              {t("history.openScreenshot")}
            </button>
          )}
          <button className="primary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </section>
    </div>
  );
}
