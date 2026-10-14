import { useState } from "react";
import {
  readSchedule,
  writeSchedule,
  type ScheduleDraft,
  type ScheduleFrequency,
} from "../../shared/schedule";
import type { SiteSchedule } from "../../shared/types";
import { useI18n } from "../i18n";

import { ScheduleNextRun } from "./ScheduleNextRun";

export function ScheduleEditor({
  value,
  onChange,
  id = "site",
  showEnabled = true,
}: {
  value: SiteSchedule;
  onChange(value: SiteSchedule): void;
  id?: string;
  showEnabled?: boolean;
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState(
    () => readSchedule(value.cron).frequency === "custom",
  );
  const draft = {
    ...readSchedule(value.cron),
    ...(custom ? { frequency: "custom" as const } : {}),
  };
  function update(patch: Partial<ScheduleDraft>) {
    const next = { ...draft, ...patch };
    onChange({ ...value, cron: writeSchedule(next) });
  }
  return (
    <div className="schedule-editor" data-testid={`${id}-schedule-editor`}>
      {showEnabled && (
        <label className="checkbox">
          <input
            data-testid={`${id}-schedule`}
            type="checkbox"
            checked={value.enabled}
            onChange={(event) =>
              onChange({ ...value, enabled: event.target.checked })
            }
          />
          {t("editor.schedule")}
        </label>
      )}
      <div className="schedule-fields">
        <label>
          {t("schedule.frequency")}
          <select
            data-testid={`${id}-frequency`}
            disabled={!value.enabled}
            value={draft.frequency}
            onChange={(event) => {
              const frequency = event.target.value as ScheduleFrequency;
              setCustom(frequency === "custom");
              if (frequency !== "custom") update({ frequency });
            }}
          >
            {(
              [
                "daily",
                "weekdays",
                "weekly",
                "hourly",
                "interval",
                "custom",
              ] as const
            ).map((frequency) => (
              <option key={frequency} value={frequency}>
                {t(`schedule.${frequency}`)}
              </option>
            ))}
          </select>
        </label>
        {(["daily", "weekdays", "weekly"] as string[]).includes(
          draft.frequency,
        ) && (
          <label>
            {t("schedule.time")}
            <input
              data-testid={`${id}-schedule-time`}
              type="time"
              required
              disabled={!value.enabled}
              value={draft.time}
              onChange={(event) => {
                if (event.target.value) update({ time: event.target.value });
              }}
            />
          </label>
        )}
        {draft.frequency === "weekly" && (
          <label>
            {t("schedule.day")}
            <select
              data-testid={`${id}-schedule-day`}
              value={draft.day}
              disabled={!value.enabled}
              onChange={(event) => update({ day: Number(event.target.value) })}
            >
              {([1, 2, 3, 4, 5, 6, 0] as const).map((day) => (
                <option key={day} value={day}>
                  {t(`schedule.day.${day}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        {draft.frequency === "hourly" && (
          <label>
            {t("schedule.minute")}
            <input
              type="number"
              min={0}
              max={59}
              disabled={!value.enabled}
              value={draft.minute}
              onChange={(event) => {
                const minute = Number(event.target.value);
                if (Number.isInteger(minute) && minute >= 0 && minute < 60)
                  update({ minute });
              }}
            />
          </label>
        )}
        {draft.frequency === "interval" && (
          <label>
            {t("schedule.minutes")}
            <select
              disabled={!value.enabled}
              value={draft.interval}
              onChange={(event) =>
                update({ interval: Number(event.target.value) })
              }
            >
              {Array.from(new Set([1, 5, 10, 15, 20, 30, draft.interval]))
                .sort((a, b) => a - b)
                .map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {draft.frequency === "custom" ? (
        <label>
          {t("editor.cron")}
          <input
            data-testid={`${id}-cron`}
            className="mono"
            value={value.cron}
            disabled={!value.enabled}
            required
            onChange={(event) =>
              onChange({ ...value, cron: event.target.value })
            }
          />
        </label>
      ) : (
        <div className="schedule-preview">
          <span>{t("schedule.preview")}</span>
          <code>{value.cron.trim()}</code>
          <button
            type="button"
            className="text-button"
            onClick={() => setCustom(true)}
          >
            {t("schedule.custom")}
          </button>
        </div>
      )}
      {value.enabled && <ScheduleNextRun expression={value.cron} />}
      <small>
        {t("schedule.note")}
        {draft.frequency === "interval" && ` ${t("schedule.intervalNote")}`}
      </small>
    </div>
  );
}
