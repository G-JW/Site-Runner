import { useEffect, useState } from "react";
import type { UpdateState } from "../../shared/updates";
import { useI18n } from "../i18n";
import { Icon } from "../workspace/Icon";

export function UpdatesPanel({ onError }: { onError(error: unknown): void }) {
  const { t } = useI18n();
  const [state, setState] = useState<UpdateState | null>(null);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    let mounted = true,
      eventSeen = false;
    const unsubscribe = window.siteRunner.updates.onState((next) => {
      eventSeen = true;
      if (mounted) setState(next);
    });
    void window.siteRunner.updates
      .state()
      .then((next) => {
        if (mounted && !eventSeen) setState(next);
      })
      .catch(onError);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [onError]);
  const busy =
    requesting ||
    !state ||
    ["checking", "downloading", "installing", "unsupported"].includes(
      state.phase,
    );
  const installing =
    state?.phase === "ready" ||
    (state?.phase === "error" &&
      Boolean(state.version) &&
      ["busy", "permission", "install"].includes(state.error ?? ""));
  const downloading =
    state?.phase === "available" ||
    (state?.phase === "error" &&
      Boolean(state.version) &&
      ["download", "prepare"].includes(state.error ?? ""));
  async function act() {
    setRequesting(true);
    try {
      let next =
        await window.siteRunner.updates[
          installing ? "install" : downloading ? "download" : "check"
        ]();
      setState(next);
      if (downloading && next.phase === "ready") {
        next = await window.siteRunner.updates.install();
        setState(next);
      }
    } catch (error) {
      onError(error);
    } finally {
      setRequesting(false);
    }
  }
  return (
    <section
      className="panel settings-panel updates-panel"
      data-testid="updates-panel"
    >
      <div className="updates-heading">
        <div>
          <h2>{t("updates.title")}</h2>
          <p className="section-description">
            {t("updates.version", { version: state?.currentVersion ?? "—" })}
          </p>
        </div>
        <button
          className={installing || downloading ? "primary" : "secondary"}
          data-testid="check-update"
          disabled={busy}
          onClick={() => void act()}
        >
          <Icon name="arrowDown" size={15} />
          {t(
            installing
              ? "updates.install"
              : downloading
                ? "updates.download"
                : "updates.check",
          )}
        </button>
      </div>
      {state && (
        <p
          className="section-description"
          role="status"
          data-testid="update-status"
        >
          {t(
            state.phase === "downloading" && (state.progress ?? 0) >= 100
              ? "updates.verifying"
              : `updates.${state.phase}`,
            {
              version: state.version ?? "",
              progress: Math.floor(state.progress ?? 0),
            },
          )}
        </p>
      )}
      {state?.phase === "error" && (
        <p className="guide-invalid">
          {t(`updates.error.${state.error ?? "network"}`)}
        </p>
      )}
      {state?.phase === "downloading" && (
        <progress
          aria-label={t("updates.downloading", {
            progress: Math.floor(state.progress ?? 0),
          })}
          max={100}
          value={state.progress ?? 0}
        />
      )}
      {state?.size && (
        <p className="section-description">
          {t("updates.size", { size: (state.size / 1024 / 1024).toFixed(1) })}
        </p>
      )}
      <p className="section-description">{t("updates.note")}</p>
      {state?.notes && (
        <details>
          <summary>{t("updates.notes")}</summary>
          <pre className="update-notes">{state.notes}</pre>
        </details>
      )}
    </section>
  );
}
