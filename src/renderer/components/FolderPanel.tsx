import { useState } from "react";
import { Icon } from "../workspace/Icon";
import type { Site, SiteFolder } from "../../shared/types";
import { useI18n } from "../i18n";
import { ConfirmDialog } from "./ConfirmDialog";
import { ScheduleEditor } from "./ScheduleEditor";

export function FolderPanel({
  folders,
  sites,
  selected,
  onSelect,
  onChange,
  onError,
}: {
  folders: SiteFolder[];
  sites: Site[];
  selected: string;
  onSelect(id: string): void;
  onChange(): Promise<void>;
  onError(error: unknown): void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<SiteFolder | "new" | null>(null);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SiteFolder | null>(null);
  const [schedule, setSchedule] = useState({
    enabled: false,
    cron: "0 9 * * *",
  });
  const [busy, setBusy] = useState(false);
  async function save(event: { preventDefault(): void }) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const folder = await window.siteRunner.folders.save({
        ...(editing === "new" ? {} : { id: editing.id }),
        name,
        schedule,
      });
      await onChange();
      onSelect(folder.id);
      setEditing(null);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await window.siteRunner.folders.remove(pendingDelete.id);
      await onChange();
      onSelect("ungrouped");
      setPendingDelete(null);
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  function item(id: string, label: string, count: number) {
    return (
      <button
        data-testid={`folder-${id}`}
        className={selected === id ? "active" : ""}
        aria-pressed={selected === id}
        onClick={() => onSelect(id)}
      >
        <span className="folder-label">
          <Icon name={id === "all" ? "sites" : "folder"} size={14} />
          {label}
        </span>
        <small>{count}</small>
      </button>
    );
  }
  return (
    <>
      <aside className="panel folder-panel">
        <div className="folder-heading">
          <strong>{t("folders.title")}</strong>
          <button
            data-testid="add-folder"
            className="text-button"
            onClick={() => {
              setEditing("new");
              setName("");
              setSchedule({ enabled: false, cron: "0 9 * * *" });
            }}
          >
            {t("folders.add")}
          </button>
        </div>
        {item("all", t("folders.all"), sites.length)}
        {item(
          "ungrouped",
          t("folders.ungrouped"),
          sites.filter((site) => !site.folderId).length,
        )}
        {folders.map((folder) => (
          <div className="folder-item" key={folder.id}>
            {item(
              folder.id,
              folder.name,
              sites.filter((site) => site.folderId === folder.id).length,
            )}
            <div className="folder-item-actions">
              <button
                aria-label={`${t("folders.edit")} ${folder.name}`}
                onClick={() => {
                  setEditing(folder);
                  setName(folder.name);
                  setSchedule({ ...folder.schedule });
                }}
              >
                {t("folders.edit")}
              </button>
              <button
                aria-label={`${t("common.delete")} ${folder.name}`}
                onClick={() => setPendingDelete(folder)}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </aside>
      {editing && (
        <div className="modal-backdrop">
          <form
            data-testid="folder-dialog"
            className="small-modal"
            onSubmit={(event) => void save(event)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="folder-title"
          >
            <div className="modal-head">
              <h2 id="folder-title">
                {t(editing === "new" ? "folders.add" : "folders.edit")}
              </h2>
              <button
                type="button"
                className="close"
                disabled={busy}
                aria-label={t("common.close")}
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </div>
            <label className="single-field">
              {t("editor.name")}
              <input
                data-testid="folder-name"
                autoFocus
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="single-field">
              <ScheduleEditor
                id="folder"
                value={schedule}
                onChange={setSchedule}
              />
              <p className="folder-schedule-note">
                {t("folders.scheduleNote")}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                {t("common.cancel")}
              </button>
              <button
                data-testid="save-folder"
                className="primary"
                disabled={busy}
              >
                {t("folders.save")}
              </button>
            </div>
          </form>
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          title={t("folders.deleteQuestion", { name: pendingDelete.name })}
          description={t("folders.deleteNote")}
          busy={busy}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => void remove()}
        />
      )}
    </>
  );
}
