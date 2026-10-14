import type { AutomationFlow, FlowStep } from "../../shared/automation-flow";
import { useI18n } from "../i18n";

export function FlowEditor({
  flow,
  onChange,
}: {
  flow: AutomationFlow;
  onChange(flow: AutomationFlow): void;
}) {
  const { t } = useI18n();
  const patch = (index: number, change: Partial<FlowStep>) =>
    onChange({
      ...flow,
      steps: flow.steps.map((step, i) =>
        i === index ? { ...step, ...change } : step,
      ),
    });
  function move(index: number, delta: number) {
    const steps = [...flow.steps];
    [steps[index], steps[index + delta]] = [
      steps[index + delta]!,
      steps[index]!,
    ];
    onChange({ ...flow, steps });
  }
  return (
    <section className="flow-editor" data-testid="flow-editor">
      <p>{t("flow.note")}</p>
      {flow.steps.length === 0 && !flow.message && (
        <div className="flow-empty">{t("flow.empty")}</div>
      )}
      {flow.steps.map((step, index) => (
        <div className="flow-step" key={index} data-testid="flow-step">
          <div className="flow-step-head">
            <span className="step-number">
              {String(index + 1).padStart(2, "0")}
            </span>
            <label>
              {t("flow.kind")}
              <select
                aria-label={t("flow.kind")}
                value={step.action}
                onChange={(event) =>
                  patch(index, {
                    action: event.target.value as FlowStep["action"],
                  })
                }
              >
                {(
                  [
                    "click",
                    "fill",
                    "waitFor",
                    "assertText",
                    "skipIfText",
                    "navigate",
                  ] as const
                ).map((action) => (
                  <option key={action} value={action}>
                    {t(`flow.${action}`)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flow-step-actions">
              <button
                type="button"
                className="text-button"
                aria-label={t("flow.up")}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="text-button"
                aria-label={t("flow.down")}
                disabled={index === flow.steps.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="text-button danger-ghost"
                aria-label={t("flow.remove")}
                onClick={() =>
                  onChange({
                    ...flow,
                    steps: flow.steps.filter((_, i) => i !== index),
                  })
                }
              >
                ×
              </button>
            </div>
          </div>
          <div className="flow-step-fields">
            {(["click", "fill", "waitFor"] as string[]).includes(
              step.action,
            ) && (
              <label>
                {t("flow.locator")}
                <select
                  value={step.locator}
                  onChange={(event) =>
                    patch(index, {
                      locator: event.target.value as FlowStep["locator"],
                    })
                  }
                >
                  {(["button", "text", "label", "selector"] as const).map(
                    (kind) => (
                      <option key={kind} value={kind}>
                        {t(`flow.${kind}`)}
                      </option>
                    ),
                  )}
                </select>
              </label>
            )}
            <label>
              {t(step.action === "navigate" ? "flow.url" : "flow.target")}
              <input
                aria-label={t(
                  step.action === "navigate" ? "flow.url" : "flow.target",
                )}
                type={step.action === "navigate" ? "url" : "text"}
                required
                value={step.target}
                onChange={(event) =>
                  patch(index, { target: event.target.value })
                }
              />
            </label>
            {step.action === "fill" && (
              <label>
                {t("flow.value")}
                <input
                  aria-label={t("flow.value")}
                  value={step.value}
                  onChange={(event) =>
                    patch(index, { value: event.target.value })
                  }
                />
              </label>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        data-testid="add-flow-step"
        disabled={flow.steps.length >= 100}
        onClick={() =>
          onChange({
            ...flow,
            steps: [
              ...flow.steps,
              { action: "click", locator: "button", target: "", value: "" },
            ],
          })
        }
      >
        + {t("flow.add")}
      </button>
      {(flow.steps.length > 0 || flow.message.length > 0) && (
        <label className="flow-message">
          {t("flow.message")}
          <input
            data-testid="flow-message"
            maxLength={1000}
            value={flow.message}
            onChange={(event) =>
              onChange({ ...flow, message: event.target.value })
            }
          />
          <small>{t("flow.messageNote")}</small>
        </label>
      )}
      <small>{t("flow.toRecorder")}</small>
    </section>
  );
}
