import { useRef, useState } from "react";
import type { Site } from "../../shared/types";
import { allNavigation, type PageName } from "./navigation";
import { useI18n } from "../i18n";
import { Icon, type IconName } from "./Icon";
import { useDialogFocus } from "./useDialogFocus";

export function CommandPalette({
  sites,
  busy,
  onNavigate,
  onOpenTask,
  onToggleSidebar,
  onToggleOutput,
  onClose,
}: {
  sites: Site[];
  busy: Set<string>;
  onNavigate(page: PageName): void;
  onOpenTask(id?: string): void;
  onToggleSidebar(): void;
  onToggleOutput(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  useDialogFocus(dialog, onClose);
  const commands: {
    id: string;
    label: string;
    detail: string;
    keywords: string;
    icon: IconName;
    disabled?: boolean;
    execute(): void;
  }[] = [
    ...allNavigation
      .filter((item) => item.id !== "overview")
      .map((item) => ({
        id: item.id,
        label: t(item.label),
        detail: t("workbench.page"),
        keywords: item.id,
        icon: item.icon,
        execute: () => onNavigate(item.id),
      })),
    {
      id: "new-task",
      label: t("task.create"),
      detail: t("workbench.command"),
      keywords: "new create task",
      icon: "plus",
      execute: () => onOpenTask(),
    },
    {
      id: "sidebar",
      label: t("workbench.toggleSidebar"),
      detail: t("workbench.command"),
      keywords: "sidebar",
      icon: "panel",
      execute: onToggleSidebar,
    },
    {
      id: "output",
      label: t("workbench.showOutput"),
      detail: t("workbench.command"),
      keywords: "output logs",
      icon: "terminal",
      execute: onToggleOutput,
    },
    ...sites.map((site) => ({
      id: `task-${site.id}`,
      label: site.name,
      detail: site.url,
      keywords: `${site.name} ${site.url}`,
      icon: "sites" as const,
      disabled: busy.has(site.id),
      execute: () => onOpenTask(site.id),
    })),
  ];
  const results = commands.filter((command) =>
    `${command.label} ${command.keywords}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  const active = Math.min(selected, Math.max(0, results.length - 1));
  function execute(index: number) {
    const command = results[index];
    if (!command || command.disabled) return;
    onClose();
    command.execute();
  }
  return (
    <div
      className="modal-backdrop command-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("workspace.search")}
        ref={dialog}
      >
        <div className="command-input">
          <Icon name="search" />
          <input
            autoFocus
            placeholder={t("workbench.search")}
            aria-label={t("workspace.search")}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-activedescendant={
              results[active] ? `command-${results[active].id}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next =
                  (active +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    Math.max(1, results.length)) %
                  Math.max(1, results.length);
                setSelected(next);
                document
                  .getElementById(`command-${results[next]?.id}`)
                  ?.scrollIntoView({ block: "nearest" });
              }
              if (event.key === "Enter") {
                event.preventDefault();
                execute(active);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div
          id="command-results"
          role="listbox"
          aria-label={t("workspace.search")}
        >
          {results.map((command, index) => (
            <button
              id={`command-${command.id}`}
              role="option"
              aria-selected={active === index}
              aria-disabled={command.disabled}
              className={active === index ? "selected" : ""}
              key={command.id}
              onMouseEnter={() => setSelected(index)}
              onClick={() => execute(index)}
            >
              <Icon name={command.icon} />
              <span className="command-label">
                <strong>{command.label}</strong>
                <small>{command.detail}</small>
              </span>
              {command.disabled ? (
                <small>{t("common.running")}</small>
              ) : (
                <Icon name="arrow" size={14} />
              )}
            </button>
          ))}
        </div>
        {!results.length && (
          <p className="command-empty">{t("workspace.emptySearch")}</p>
        )}
        <div className="command-footer">
          {t("workbench.commandHelp")}
          <span>{results.length}</span>
        </div>
      </div>
    </div>
  );
}
