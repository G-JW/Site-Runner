import type { HeaderRow } from "../../shared/headers";
import { useI18n } from "../i18n";
export function HeadersEditor({
  rows,
  onChange,
}: {
  rows: HeaderRow[];
  onChange(rows: HeaderRow[]): void;
}) {
  const { t } = useI18n();
  return (
    <div className="headers-editor span-2">
      <strong>{t("channel.headers")}</strong>
      {rows.map((row, index) => (
        <div className="header-field-row" key={index} data-testid="header-row">
          <input
            aria-label={t("headers.name")}
            placeholder="Authorization"
            value={row.name}
            onChange={(event) =>
              onChange(
                rows.map((item, i) =>
                  i === index ? { ...item, name: event.target.value } : item,
                ),
              )
            }
          />
          <input
            aria-label={t("headers.value")}
            placeholder="Bearer …"
            value={row.value}
            onChange={(event) =>
              onChange(
                rows.map((item, i) =>
                  i === index ? { ...item, value: event.target.value } : item,
                ),
              )
            }
          />
          <button
            type="button"
            className="text-button"
            aria-label={t("headers.remove")}
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        data-testid="add-header"
        onClick={() => onChange([...rows, { name: "", value: "" }])}
      >
        + {t("headers.add")}
      </button>
    </div>
  );
}
