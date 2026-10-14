import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "./styles.css";
import "./workspace/workbench.css";
import { AppearanceProvider } from "./workspace/Appearance";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <AppearanceProvider>
        <App />
      </AppearanceProvider>
    </I18nProvider>
  </StrictMode>,
);
