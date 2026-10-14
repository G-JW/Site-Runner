import type { RunRecord, SiteRunResult } from "../../shared/types";
import { errorAdvice, resultKind } from "../../shared/task-presentation";
import { useI18n } from "../i18n";

export function RunResultPanel({ run }: { run: RunRecord | SiteRunResult }) {
  const { t } = useI18n();
  const kind = resultKind(run);
  return (
    <div className={`run-result-panel ${kind}`} data-testid="result-panel">
      <strong>
        <i className={`result-dot ${kind}`} />
        {t(`result.${kind}`)}
      </strong>
      {kind === "failed" && (
        <p>{t(`result.advice.${errorAdvice(run.error)}`)}</p>
      )}
      {run.message && <p>{run.message}</p>}
      {run.error && (
        <details>
          <summary>{t("result.technical")}</summary>
          <pre className="run-error">{run.error}</pre>
        </details>
      )}
    </div>
  );
}
