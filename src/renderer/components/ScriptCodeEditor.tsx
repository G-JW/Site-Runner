import Editor, {
  loader,
  type BeforeMount,
  type OnMount,
} from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { typescriptDefaults } from "monaco-editor/languages/features/typescript/register.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import TypeScriptWorker from "monaco-editor/language/typescript/ts.worker.js?worker";

loader.config({ monaco });
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    if (label === "typescript" || label === "javascript")
      return new TypeScriptWorker();
    return new EditorWorker();
  },
};

const configure: BeforeMount = () => {
  typescriptDefaults.addExtraLib(
    `
    interface AutomationLogger { info(message: string): void; warn(message: string): void; error(message: string): void; }
    interface Locator { click(options?: { timeout?: number }): Promise<void>; isVisible(): Promise<boolean>; fill(value: string): Promise<void>; waitFor(options: { state: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<void>; getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator; or(other: Locator): Locator; first(): Locator; }
    interface BrowserContext { newPage(): Promise<Page>; pages(): Page[]; }
    interface Page { url(): string; goto(url: string, options?: { waitUntil?: string }): Promise<unknown>; context(): BrowserContext; waitForEvent(event: 'popup'): Promise<Page>; getByRole(role: string, options?: { name?: string; exact?: boolean }): Locator; getByText(text: string, options?: { exact?: boolean }): Locator; getByLabel(text: string, options?: { exact?: boolean }): Locator; locator(selector: string): Locator; waitForTimeout(ms: number): Promise<void>; }
    interface AutomationContext { page: Page; log: AutomationLogger; config: Record<string, unknown>; expect: (value: unknown) => any; }
  `,
    "ts:site-runner/automation.d.ts",
  );
};

export default function ScriptCodeEditor({
  value,
  theme,
  onMount,
  onChange,
}: {
  value: string;
  theme: "vs-dark" | "light";
  onMount: OnMount;
  onChange(value: string | undefined): void;
}) {
  return (
    <Editor
      height="clamp(180px, 32vh, 320px)"
      language="typescript"
      theme={theme}
      value={value}
      beforeMount={configure}
      onMount={onMount}
      onChange={onChange}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbersMinChars: 3,
        padding: { top: 14 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
      }}
    />
  );
}
