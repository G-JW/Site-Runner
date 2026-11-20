import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserRuntimeStatus, BrowserSource } from "../../shared/types";
import { useI18n } from "../i18n";
import { Icon } from "../workspace/Icon";

function useBrowserStatus(onError: (error: unknown) => void) {
  const [state, setState] = useState<BrowserRuntimeStatus | null>(null);
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void window.siteRunner.browser
        .status()
        .then((next) => {
          if (mounted) setState(next);
        })
        .catch(onError);
    };
    load();
    const stop = window.siteRunner.browser.onState((next) => {
      if (mounted) setState(next);
    });
    const stopSettings = window.siteRunner.settings.onChanged(load);
    return () => {
      mounted = false;
      stop();
      stopSettings();
    };
  }, [onError]);
  return state;
}

export function BrowserSettingsPanel({
  onError,
}: {
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const state = useBrowserStatus(onError);
  const [changing, setChanging] = useState(false);
  if (!state) return <p>{t("common.loading")}</p>;
  const downloading = state.phase === "downloading";
  return (
    <div className="browser-settings" data-testid="browser-settings">
      <div className="browser-source-row">
        <label htmlFor="browser-source">{t("browser.source")}</label>
        <select
          id="browser-source"
          data-testid="browser-source"
          value={state.source}
          disabled={changing || downloading}
          onChange={(event) => {
            setChanging(true);
            void window.siteRunner.settings
              .update({ browserSource: event.target.value as BrowserSource })
              .catch(onError)
              .finally(() => setChanging(false));
          }}
        >
          <option value="managed">{t("browser.managed")}</option>
          <option value="chrome" disabled={!state.installed.chrome}>
            {t("browser.chrome")}
            {!state.installed.chrome ? ` · ${t("browser.notInstalled")}` : ""}
          </option>
          <option value="msedge" disabled={!state.installed.msedge}>
            {t("browser.edge")}
            {!state.installed.msedge ? ` · ${t("browser.notInstalled")}` : ""}
          </option>
        </select>
      </div>
      <p
        className={`browser-state ${state.ready ? "ready" : ""}`}
        role="status"
      >
        {t(
          downloading
            ? "browser.downloading"
            : state.ready
              ? "browser.ready"
              : "browser.notReady",
        )}
      </p>
      {(!state.installed.managed || state.phase === "error") && (
        <div className="browser-download-actions">
          <button
            className="secondary"
            disabled={downloading || changing}
            onClick={() => {
              void window.siteRunner.browser.install().catch(onError);
            }}
          >
            {t(state.phase === "error" ? "browser.retry" : "browser.download")}
          </button>
          {downloading && (
            <button
              className="text-button"
              onClick={() =>
                void window.siteRunner.browser.cancel().catch(onError)
              }
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      )}
      {downloading && <progress aria-label={t("browser.downloading")} />}
      {state.message && (
        <pre
          className={
            state.phase === "error" ? "browser-error" : "browser-progress"
          }
        >
          {state.message}
        </pre>
      )}
      <p className="browser-note">
        {t(
          state.source === "managed"
            ? "browser.managedNote"
            : "browser.localNote",
        )}
      </p>
    </div>
  );
}

export function BrowserSetupNotice({
  onError,
  onReadyChange,
}: {
  onError(error: unknown): void;
  onReadyChange(ready: boolean): void;
}) {
  const { t } = useI18n();
  const state = useBrowserStatus(onError);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const modal = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state) onReadyChange(state.ready);
  }, [state, onReadyChange]);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const returnFocus = trigger.current;
    const controls = () => [
      ...(modal.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled),select:not(:disabled)",
      ) ?? []),
    ];
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const items = controls(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      returnFocus?.focus();
    };
  }, [open, close]);
  return (
    <>
      {state && !state.ready && (
        <div className="browser-setup-notice" role="status">
          <Icon name="alert" size={16} />
          <span>
            {t(
              state.phase === "downloading"
                ? "browser.downloading"
                : "browser.setupNote",
            )}
          </span>
          <button
            ref={trigger}
            className="text-button"
            data-testid="configure-browser"
            onClick={() => setOpen(true)}
          >
            {t("browser.configure")}
          </button>
        </div>
      )}
      {open && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            ref={modal}
            className="small-modal browser-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="browser-title"
          >
            <div className="modal-head">
              <h2 id="browser-title">{t("browser.title")}</h2>
              <button
                className="icon-button"
                aria-label={t("common.close")}
                onClick={close}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <BrowserSettingsPanel onError={onError} />
          </section>
        </div>
      )}
    </>
  );
}
