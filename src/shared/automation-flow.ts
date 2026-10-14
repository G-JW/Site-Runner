// Workflows are stored as ordinary scripts so exports, templates and older execution APIs keep working.
export type FlowAction =
  "click" | "fill" | "waitFor" | "assertText" | "skipIfText" | "navigate";
export type FlowLocator = "button" | "text" | "label" | "selector";
export interface FlowStep {
  action: FlowAction;
  locator: FlowLocator;
  target: string;
  value: string;
}
export interface AutomationFlow {
  version: 1;
  steps: FlowStep[];
  message: string;
}
const marker = "// site-runner-flow:v1 ";
const literal = (value: unknown) =>
  JSON.stringify(value)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");

function locator(step: FlowStep) {
  if (step.locator === "button")
    return `page.getByRole('button', { name: ${literal(step.target)}, exact: true })`;
  if (step.locator === "text")
    return `page.getByText(${literal(step.target)}, { exact: true })`;
  if (step.locator === "label")
    return `page.getByLabel(${literal(step.target)}, { exact: true })`;
  return `page.locator(${literal(step.target)})`;
}

export function validateFlow(value: unknown): asserts value is AutomationFlow {
  const flow = value as AutomationFlow | null;
  if (
    !flow ||
    flow.version !== 1 ||
    !Array.isArray(flow.steps) ||
    flow.steps.length > 100 ||
    typeof flow.message !== "string" ||
    flow.message.length > 1000
  )
    throw new Error("Invalid visual workflow");
  for (const step of flow.steps) {
    if (
      !step ||
      ![
        "click",
        "fill",
        "waitFor",
        "assertText",
        "skipIfText",
        "navigate",
      ].includes(step.action) ||
      !["button", "text", "label", "selector"].includes(step.locator) ||
      typeof step.target !== "string" ||
      !step.target.trim() ||
      typeof step.value !== "string"
    )
      throw new Error("Each workflow step needs an action and target");
    if (
      step.action === "navigate" &&
      !["http:", "https:"].includes(new URL(step.target).protocol)
    )
      throw new Error("Workflow URLs must use HTTP or HTTPS");
  }
}

export function compileFlow(flow: AutomationFlow): string | null {
  if (flow.steps.length === 0 && !flow.message) return null;
  const lines = flow.steps.map((step) => {
    const target = locator(step);
    switch (step.action) {
      case "click":
        return `  await ${target}.click();`;
      case "fill":
        return `  await ${target}.fill(${literal(step.value)});`;
      case "waitFor":
        return `  await ${target}.waitFor({ state: 'visible' });`;
      case "assertText":
        return `  await expect(page.getByText(${literal(step.target)}, { exact: true })).toBeVisible();`;
      case "skipIfText":
        return `  if (await page.getByText(${literal(step.target)}, { exact: true }).isVisible()) return ${literal(step.value || "Already completed")};`;
      case "navigate":
        return `  await page.goto(${literal(step.target)}, { waitUntil: 'domcontentloaded' });`;
    }
  });
  if (flow.message) lines.push(`  return ${literal(flow.message)};`);
  return `${marker}${literal(flow)}\nexport default async function run({ page, expect }: AutomationContext) {\n${lines.join("\n")}\n}\n`;
}

// Only reopen an exact generated script. A hand-edited script is kept as custom code.
export function readFlow(script: string | null): AutomationFlow | null {
  if (!script?.trim()) return { version: 1, steps: [], message: "" };
  if (!script.startsWith(marker)) return null;
  try {
    const value = JSON.parse(
      script.split("\n")[0]!.slice(marker.length),
    ) as AutomationFlow;
    validateFlow(value);
    return compileFlow(value)?.trim() === script.trim() ? value : null;
  } catch {
    return null;
  }
}
