export type PageName =
  | "overview"
  | "sites"
  | "templates"
  | "profiles"
  | "history"
  | "notifications"
  | "data"
  | "automation"
  | "settings";

export const allNavigation = [
  { id: "overview", label: "nav.overview", icon: "overview" },
  { id: "sites", label: "nav.sites", icon: "sites" },
  { id: "history", label: "nav.history", icon: "history" },
  { id: "templates", label: "nav.templates", icon: "templates" },
  { id: "profiles", label: "nav.profiles", icon: "profiles" },
  { id: "notifications", label: "nav.notifications", icon: "notifications" },
  { id: "data", label: "nav.data", icon: "folder" },
  { id: "settings", label: "nav.settings", icon: "settings" },
  { id: "automation", label: "nav.automation", icon: "terminal" },
] as const;

export const navigation = allNavigation.filter(
  (item) => item.id !== "overview",
);
