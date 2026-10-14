import type { RuntimeSnapshot, Site } from "../../shared/types";
import { useI18n } from "../i18n";

export function ActiveTasksPanel({
  state,
  sites,
  onError,
}: {
  state: RuntimeSnapshot;
  sites: Site[];
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  if (!state.runs.length && !state.batches.length) return null;
  const standalone = state.runs.filter(
    (run) =>
      !state.batches.some(
        (batch) =>
          batch.phase === "running" &&
          batch.siteIds.slice(batch.completed).includes(run.siteId),
      ),
  );
  return (
    <section
      className="panel active-tasks"
      data-testid="active-tasks"
      aria-label={t("runtime.title")}
    >
      <strong>{t("runtime.title")}</strong>
      {state.batches.map((batch) => (
        <div key={batch.id} className="active-batch" data-testid="active-batch">
          <div>
            <span>
              {t(
                batch.trigger === "schedule"
                  ? "runtime.scheduledBatch"
                  : "runtime.batch",
              )}
            </span>
            <span>
              {t("runtime.progress", {
                completed: batch.completed,
                total: batch.total,
                success: batch.success,
                failed: batch.failed,
              })}
            </span>
          </div>
          {batch.phase === "running" && (
            <button
              className="secondary"
              data-testid={`stop-batch-${batch.id}`}
              disabled={batch.stopRequested}
              title={t("runtime.stopNote")}
              onClick={() =>
                void window.siteRunner.runs.stopBatch(batch.id).catch(onError)
              }
            >
              {t(batch.stopRequested ? "runtime.stopping" : "runtime.stop")}
            </button>
          )}
          <progress
            value={batch.completed}
            max={Math.max(batch.total, 1)}
            aria-label={t("runtime.title")}
          />
          <small>
            {batch.phase === "notifying"
              ? t("runtime.notifying")
              : batch.currentSiteId
                ? `${sites.find((site) => site.id === batch.currentSiteId)?.name ?? t("common.unknown")} · ${t(state.runs.find((run) => run.siteId === batch.currentSiteId)?.phase === "queued" ? "runtime.queued" : "common.running")}`
                : t("runtime.waiting")}
          </small>
        </div>
      ))}
      {standalone.map((run) => (
        <div key={run.siteId} className="active-single">
          <span>{run.siteName}</span>
          <span>
            {t(run.phase === "queued" ? "runtime.queued" : "common.running")}
          </span>
        </div>
      ))}
    </section>
  );
}
