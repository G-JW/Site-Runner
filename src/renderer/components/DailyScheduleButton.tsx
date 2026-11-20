import { useEffect, useRef, useState } from "react";
import type { AppSettings } from "../../shared/types";
import { useI18n } from "../i18n";
import { Icon } from "../workspace/Icon";
import { validateDailyRunTime } from "../../shared/daily-schedule";

export function DailyScheduleButton({
  onError,
}: {
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLFormElement>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [catchUp, setCatchUp] = useState(true);
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    void window.siteRunner.settings
      .get()
      .then((next) => {
        if (mounted) setSettings(next);
      })
      .catch(onError);
    const unsubscribe = window.siteRunner.settings.onChanged(setSettings);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [onError]);
  useEffect(() => {
    if (!open) return;
    const returnFocus = trigger.current;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setOpen(false);
      if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        );
        const first = controls?.[0],
          last = controls?.[controls.length - 1];
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
  }, [open, saving]);
  return (
    <>
      <button
        className={`secondary daily-schedule-button ${settings?.dailyRunEnabled ? "enabled" : ""}`}
        ref={trigger}
        data-testid="daily-schedule"
        disabled={!settings}
        onClick={() => {
          if (!settings) return;
          setEnabled(settings.dailyRunEnabled);
          setCatchUp(settings.dailyCatchUpEnabled);
          setTime(settings.dailyRunTime);
          setOpen(true);
        }}
      >
        <Icon name="clock" size={15} />
        {settings?.dailyRunEnabled
          ? t("daily.everyDay", { time: settings.dailyRunTime })
          : t("daily.title")}
      </button>
      {open && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget && !saving) setOpen(false);
          }}
        >
          <form
            ref={dialog}
            className="small-modal daily-schedule-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-title"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const nextTime = (
                form.elements.namedItem("daily-run-time") as HTMLInputElement
              ).value;
              const nextEnabled = (
                form.elements.namedItem("daily-run-enabled") as HTMLInputElement
              ).checked;
              const nextCatchUp = (
                form.elements.namedItem("daily-catch-up") as HTMLInputElement
              ).checked;
              setSaving(true);
              void (async () => {
                validateDailyRunTime(nextTime);
                await window.siteRunner.settings.update({
                  dailyRunEnabled: nextEnabled,
                  dailyCatchUpEnabled: nextCatchUp,
                  dailyRunTime: nextTime,
                });
                setOpen(false);
              })()
                .catch(onError)
                .finally(() => setSaving(false));
            }}
          >
            <div className="modal-head">
              <h2 id="daily-title">{t("daily.title")}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label={t("common.close")}
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <label className="daily-enable">
              <span>{t("daily.enabled")}</span>
              <input
                name="daily-run-enabled"
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(event) => setEnabled(event.target.checked)}
              />
            </label>
            <label className="daily-time">
              <span>{t("daily.time")}</span>
              <input
                autoFocus
                name="daily-run-time"
                type="time"
                required
                value={time}
                disabled={saving}
                onInput={(event) => setTime(event.currentTarget.value)}
                onChange={(event) => setTime(event.target.value)}
              />
            </label>
            <label className="daily-enable">
              <span>{t("daily.catchUp")}</span>
              <input
                name="daily-catch-up"
                type="checkbox"
                checked={catchUp}
                disabled={saving}
                onChange={(event) => setCatchUp(event.target.checked)}
              />
            </label>
            <p className="daily-note">{t("daily.catchUpNote")}</p>
            <p className="daily-note">{t("daily.note")}</p>
            <small className="daily-zone">
              {Intl.DateTimeFormat().resolvedOptions().timeZone}
            </small>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button className="primary" disabled={saving}>
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
