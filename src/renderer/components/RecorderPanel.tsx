import { useEffect, useRef, useState } from "react";
import type { BrowserProfile, RecordingStatus } from "../../shared/types";
import { useI18n } from "../i18n";

export function RecorderPanel({
  profiles,
  context,
  onActiveChange,
  onRecorded,
  onError,
}: {
  profiles: BrowserProfile[];
  context?: { url: string; profileId: string };
  onActiveChange?(active: boolean): void;
  onRecorded(script: string): void;
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState("https://");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [status, setStatus] = useState<RecordingStatus>({
    state: "idle",
    error: null,
  });
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const owner = useRef(false);
  const [owned, setOwned] = useState(false);
  const callback = useRef(onActiveChange);
  useEffect(() => {
    callback.current = onActiveChange;
  }, [onActiveChange]);
  useEffect(() => {
    let disposed = false;
    const update = () =>
      void window.siteRunner.recorder
        .status()
        .then((next) => {
          if (!disposed) {
            setStatus(next);
            callback.current?.(
              operation.current ||
                (owner.current &&
                  (next.state === "recording" || next.state === "ready")),
            );
          }
        })
        .catch((error: unknown) => {
          if (!disposed) onError(error);
        });
    update();
    const timer = setInterval(update, 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [onError]);
  async function act(action: "start" | "finish" | "cancel") {
    setBusy(true);
    operation.current = true;
    callback.current?.(true);
    try {
      if (action === "start") {
        await window.siteRunner.recorder.start(
          context ?? { url, profileId: profileId || profiles[0]?.id || "" },
        );
        owner.current = true;
        setOwned(true);
      } else if (action === "finish") {
        const script = await window.siteRunner.recorder.finish();
        owner.current = false;
        setOwned(false);
        callback.current?.(false);
        onRecorded(script);
      } else {
        await window.siteRunner.recorder.cancel();
        owner.current = false;
        setOwned(false);
      }
      const next = await window.siteRunner.recorder.status();
      setStatus(next);
      callback.current?.(
        operation.current ||
          (owner.current &&
            (next.state === "recording" || next.state === "ready")),
      );
    } catch (error) {
      onError(error);
      callback.current?.(owner.current);
    } finally {
      operation.current = false;
      callback.current?.(owner.current);
      setBusy(false);
    }
  }
  const active = status.state === "recording" || status.state === "ready";
  return (
    <section className="panel recorder-panel">
      <h3>{t("recorder.title")}</h3>
      <p>{t(context ? "recorder.contextNote" : "recorder.description")}</p>
      {!context && (
        <>
          <p className="recorder-note">{t("recorder.note")}</p>
          <div className="recorder-inputs">
            <label>
              {t("editor.url")}
              <input
                data-testid="recording-url"
                value={url}
                disabled={active || busy}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label>
              {t("editor.profile")}
              <select
                data-testid="recording-profile"
                value={profileId || profiles[0]?.id || ""}
                disabled={active || busy}
                onChange={(event) => setProfileId(event.target.value)}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      <div className="template-actions">
        <button
          type="button"
          data-testid="start-recording"
          className="primary"
          disabled={busy || active || profiles.length === 0}
          onClick={() => void act("start")}
        >
          {t("recorder.start")}
        </button>
        <button
          type="button"
          data-testid="finish-recording"
          className="secondary"
          disabled={busy || !active || !(owned || !context)}
          onClick={() => void act("finish")}
        >
          {t(context ? 'task.recordFinish' : 'recorder.finish')}
        </button>
        <button
          type="button"
          data-testid="cancel-recording"
          className="text-button"
          disabled={busy || !active || !(owned || !context)}
          onClick={() => void act("cancel")}
        >
          {t("recorder.cancel")}
        </button>
        <span data-testid="recording-status">
          {t(`recorder.${status.state}`)}
        </span>
      </div>
      {active && !owned && context && (
        <p role="status">{t("recorder.other")}</p>
      )}
      {status.error && <p role="alert">{status.error}</p>}
    </section>
  );
}
