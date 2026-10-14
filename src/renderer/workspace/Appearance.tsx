import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AppSettings } from "../../shared/types";

type Appearance = Pick<AppSettings, "theme" | "density">;
const Context = createContext<{
  resolvedTheme: "light" | "dark";
  apply(value: Appearance): void;
} | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, apply] = useState<Appearance>({
    theme: "system",
    density: "comfortable",
  });
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    let mounted = true;
    void window.siteRunner.settings
      .get()
      .then((settings) => {
        if (mounted) apply(settings);
      })
      .catch(() => undefined);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => {
      mounted = false;
      media.removeEventListener("change", change);
    };
  }, []);
  const resolvedTheme =
    appearance.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : appearance.theme;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.density = appearance.density;
  }, [resolvedTheme, appearance.density]);
  return (
    <Context.Provider value={{ resolvedTheme, apply }}>
      {children}
    </Context.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppearance() {
  const value = useContext(Context);
  if (!value) throw new Error("AppearanceProvider is missing");
  return value;
}
