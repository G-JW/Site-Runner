import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PageName } from "./navigation";

// eslint-disable-next-line react-refresh/only-export-components
export const SidebarContext = createContext<{
  target: HTMLElement | null;
  page: PageName;
}>({ target: null, page: "sites" });

export function SidebarPortal({
  page,
  children,
}: {
  page: PageName;
  children: ReactNode;
}) {
  const workspace = useContext(SidebarContext);
  if (!workspace.target) return null;
  return createPortal(
    <div hidden={workspace.page !== page}>{children}</div>,
    workspace.target,
  );
}
