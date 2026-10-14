import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export function ScheduleNextRun({ expression }: { expression: string }) {
  const { language, t } = useI18n();
  const [preview, setPreview] = useState<{
    expression: string;
    next: string | null;
  } | null>(null);
  useEffect(() => {
    let disposed = false;
    const load = () =>
      void window.siteRunner.runs
        .schedulePreview(expression)
        .then((next) => {
          if (!disposed) setPreview({ expression, next });
        })
        .catch(() => {
          if (!disposed) setPreview({ expression, next: null });
        });
    const debounce = setTimeout(load, 250),
      timer = setInterval(load, 30000);
    return () => {
      disposed = true;
      clearTimeout(debounce);
      clearInterval(timer);
    };
  }, [expression]);
  return (
    <p className="schedule-next" role="status">
      {preview?.expression !== expression
        ? t("common.loading")
        : preview.next
          ? t("schedule.next", {
              time: new Date(preview.next).toLocaleString(language),
            })
          : t("schedule.invalid")}
    </p>
  );
}
