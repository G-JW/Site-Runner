import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationHistory } from "../components/NotificationHistory";
import type {
  AppSettings,
  NotificationChannel,
  NotificationChannelInput,
  ProviderType,
} from "../../shared/types";
import { PageHeader } from "../components/PageHeader";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useI18n } from "../i18n";
import { Icon } from "../workspace/Icon";
import { HeadersEditor } from "../components/HeadersEditor";
import { buildHeaders, type HeaderRow } from "../../shared/headers";
import { useDialogFocus } from "../workspace/useDialogFocus";

export function NotificationsPage({
  onSettings,
  onError,
  embedded = false,
  settingsOverride,
}: {
  onSettings(): void;
  onError(error: unknown): void;
  embedded?: boolean;
  settingsOverride?: AppSettings;
}) {
  const { t } = useI18n();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editing, setEditing] = useState<NotificationChannel | "new" | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] =
    useState<NotificationChannel | null>(null);
  const [feedback, setFeedback] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [loadedSettings, setSettings] = useState<AppSettings | null>(null);
  const [testing, setTesting] = useState<Set<string>>(new Set());
  const [historyRevision, setHistoryRevision] = useState(0);
  const load = useCallback(async () => {
    const [nextChannels, nextSettings] = await Promise.all([
      window.siteRunner.notifications.list(),
      window.siteRunner.settings.get(),
    ]);
    setChannels(nextChannels);
    setSettings(nextSettings);
  }, []);
  const settings = settingsOverride ?? loadedSettings;
  const normal = channels.filter(
    (channel) => channel.enabled && channel.eventPolicy !== "alert",
  );
  const alert = channels.filter(
    (channel) => channel.enabled && channel.eventPolicy !== "normal",
  );
  useEffect(() => {
    queueMicrotask(() => void load().catch(onError));
  }, [load, onError]);
  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await window.siteRunner.notifications.remove(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (error) {
      onError(error);
    } finally {
      setDeleting(false);
    }
  }
  async function test(channel: NotificationChannel) {
    if (testing.has(channel.id)) return;
    setFeedback("");
    setTesting((current) => new Set(current).add(channel.id));
    try {
      await window.siteRunner.notifications.test(channel.id);
      setFeedback(t("notifications.sent"));
    } catch (error) {
      onError(error);
    } finally {
      setTesting((current) => {
        const next = new Set(current);
        next.delete(channel.id);
        return next;
      });
      setHistoryRevision((current) => current + 1);
    }
  }
  return (
    <>
      {embedded ? (
        <div className="panel-heading">
          <h2>{t("notifications.title")}</h2>
          <button className="primary" onClick={() => setEditing("new")}>
            {t("notifications.add")}
          </button>
        </div>
      ) : (
        <PageHeader
          eyebrow={t("notifications.eyebrow")}
          title={t("notifications.title")}
          description={t("notifications.description")}
          actions={
            <button className="primary" onClick={() => setEditing("new")}>
              {t("notifications.add")}
            </button>
          }
        />
      )}
      <section className="card-grid">
        {channels.length === 0 ? (
          <div className="panel empty-state compact">
            <div className="empty-icon">
              <Icon name="notifications" size={28} />
            </div>
            <h2>{t("notifications.emptyTitle")}</h2>
            <p>{t("notifications.emptyDescription")}</p>
          </div>
        ) : (
          channels.map((channel) => (
            <article
              data-testid={`notification-channel-${channel.id}`}
              className="panel profile-card"
              key={channel.id}
            >
              <span className="profile-glyph">
                <Icon name="notifications" />
              </span>
              <div>
                <h2>{channel.name}</h2>
                <p>
                  {channel.providerType.toUpperCase()} ·{" "}
                  {t("notifications.events", {
                    policy: t(`channel.${channel.eventPolicy}`),
                  })}{" "}
                  ·{" "}
                  {channel.enabled ? t("common.enabled") : t("common.disabled")}
                </p>
              </div>
              <div className="card-actions">
                <div>
                  <button
                    data-testid={`test-channel-${channel.id}`}
                    className="text-button"
                    disabled={testing.has(channel.id)}
                    onClick={() => void test(channel)}
                  >
                    {t(
                      testing.has(channel.id)
                        ? "notifications.testing"
                        : "common.test",
                    )}
                  </button>
                  <button
                    className="text-button"
                    disabled={testing.has(channel.id)}
                    onClick={() => setEditing(channel)}
                  >
                    {t("common.edit")}
                  </button>
                </div>
                <button
                  className="danger-ghost"
                  disabled={testing.has(channel.id)}
                  onClick={() => setPendingDelete(channel)}
                >
                  {t("common.delete")}
                </button>
              </div>
            </article>
          ))
        )}
      </section>
      {settings && (
        <section
          className="panel notification-setup"
          data-testid="notification-setup"
        >
          <div className="panel-heading">
            <h2>{t("notifications.setup")}</h2>
            <div>
              <button
                data-testid="refresh-notifications"
                className="text-button"
                onClick={() => void load().catch(onError)}
              >
                {t("notifications.refresh")}
              </button>
              {!embedded && (
                <button
                  data-testid="notification-settings"
                  className="text-button"
                  onClick={onSettings}
                >
                  {t("nav.settings")}
                </button>
              )}
            </div>
          </div>
          <div className="notification-setup-body">
            <div className="notification-switches">
              <span data-testid="notification-global-state">
                {t("notifications.global")} ·{" "}
                {t(
                  settings.notificationEnabled
                    ? "common.enabled"
                    : "common.disabled",
                )}
              </span>
              <span data-testid="notification-schedule-state">
                {t("notifications.scheduled")} ·{" "}
                {t(
                  settings.notifyScheduledRuns
                    ? "common.enabled"
                    : "common.disabled",
                )}
              </span>
            </div>
            {!settings.notificationEnabled && (
              <p
                className="notification-warning"
                data-testid="notification-global-warning"
              >
                {t("notifications.globalOff")}
              </p>
            )}
            {!settings.notifyScheduledRuns && (
              <p className="notification-warning">
                {t("notifications.scheduleOff")}
              </p>
            )}
            <div className="notification-routes">
              <div data-testid="notification-normal-route">
                <strong>
                  {t("notifications.normalRoute", { count: normal.length })}
                </strong>
                <p>
                  {normal.length
                    ? normal.map((channel) => channel.name).join(" · ")
                    : t("notifications.noNormal")}
                </p>
              </div>
              <div data-testid="notification-alert-route">
                <strong>
                  {t("notifications.alertRoute", { count: alert.length })}
                </strong>
                <p>
                  {alert.length
                    ? alert.map((channel) => channel.name).join(" · ")
                    : t("notifications.noAlert")}
                </p>
              </div>
            </div>
            <p className="notification-setup-note">
              {t("notifications.setupNote")}
            </p>
          </div>
        </section>
      )}
      <NotificationHistory revision={historyRevision} onError={onError} />
      {feedback && (
        <div className="success-callout" role="status">
          {feedback}
          <button
            aria-label={t("common.close")}
            onClick={() => setFeedback("")}
          >
            ×
          </button>
        </div>
      )}

      {editing && (
        <ChannelEditor
          channel={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          onError={onError}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("notifications.deleteQuestion", {
            name: pendingDelete.name,
          })}
          description={t("notifications.deleteDescription")}
          busy={deleting}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}

function ChannelEditor({
  channel,
  onClose,
  onSaved,
  onError,
}: {
  channel: NotificationChannel | null;
  onClose(): void;
  onSaved(): Promise<void>;
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const initialType: ProviderType = channel?.providerType ?? "ntfy";
  const [form, setForm] = useState<NotificationChannelInput>(
    channel
      ? { ...channel }
      : {
          name: "",
          providerType: initialType,
          enabled: true,
          eventPolicy: "all",
          config:
            initialType === "ntfy"
              ? { serverUrl: "https://ntfy.sh", topic: "", token: "" }
              : { url: "", method: "POST", headers: {} },
        },
  );
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLFormElement>(null);
  useDialogFocus(dialog, onClose, saving);
  const [headers, setHeaders] = useState<HeaderRow[]>(() =>
    Object.entries((form.config.headers ?? {}) as Record<string, string>).map(
      ([name, value]) => ({ name, value: String(value) }),
    ),
  );
  function changeProvider(providerType: ProviderType) {
    setForm({
      ...form,
      providerType,
      config:
        providerType === "ntfy"
          ? { serverUrl: "https://ntfy.sh", topic: "", token: "" }
          : { url: "", method: "POST", headers: {} },
    });
    setHeaders([]);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const config =
        form.providerType === "webhook"
          ? { ...form.config, headers: buildHeaders(headers) }
          : form.config;
      await window.siteRunner.notifications.save({ ...form, config });
      await onSaved();
    } catch (error) {
      onError(
        error instanceof Error &&
          (error.message === "headers.invalid" ||
            error.message === "headers.duplicate")
          ? new Error(t(error.message))
          : error,
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-editor-title"
        data-testid="channel-dialog"
        className="channel-modal"
        onSubmit={(event) => void save(event)}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{t("channel.eyebrow")}</span>
            <h2 id="channel-editor-title">
              {channel ? t("channel.edit") : t("channel.add")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            disabled={saving}
            className="close"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="form-grid">
          <label>
            {t("channel.name")}
            <input
              value={form.name}
              required
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </label>
          <label>
            {t("channel.provider")}
            <select
              value={form.providerType}
              onChange={(event) =>
                changeProvider(event.target.value as ProviderType)
              }
            >
              <option value="ntfy">NTFY</option>
              <option value="webhook">{t("channel.webhook")}</option>
            </select>
          </label>
          <label>
            {t("channel.policy")}
            <select
              value={form.eventPolicy}
              onChange={(event) =>
                setForm({
                  ...form,
                  eventPolicy: event.target
                    .value as NotificationChannelInput["eventPolicy"],
                })
              }
            >
              <option value="all">{t("channel.all")}</option>
              <option value="normal">{t("channel.normal")}</option>
              <option value="alert">{t("channel.alert")}</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) =>
                setForm({ ...form, enabled: event.target.checked })
              }
            />{" "}
            {t("common.enabled")}
          </label>
          {form.providerType === "ntfy" ? (
            <>
              <label>
                {t("channel.server")}
                <input
                  required
                  value={String(form.config.serverUrl ?? "")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      config: { ...form.config, serverUrl: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                {t("channel.topic")}
                <input
                  required
                  value={String(form.config.topic ?? "")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      config: { ...form.config, topic: event.target.value },
                    })
                  }
                />
              </label>
              <label className="span-2">
                {t("channel.token")}
                <input
                  type="password"
                  value={String(form.config.token ?? "")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      config: { ...form.config, token: event.target.value },
                    })
                  }
                />
              </label>
            </>
          ) : (
            <>
              <label className="span-2">
                {t("channel.url")}
                <input
                  required
                  value={String(form.config.url ?? "")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      config: { ...form.config, url: event.target.value },
                    })
                  }
                />
              </label>
              <label>
                {t("channel.method")}
                <select
                  value={String(form.config.method ?? "POST")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      config: { ...form.config, method: event.target.value },
                    })
                  }
                >
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                </select>
              </label>
              <HeadersEditor rows={headers} onChange={setHeaders} />
            </>
          )}
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={saving}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            data-testid="save-channel"
            className="primary"
            disabled={saving}
          >
            {t(saving ? "editor.saving" : "channel.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
