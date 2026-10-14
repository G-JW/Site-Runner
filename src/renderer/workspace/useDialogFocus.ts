import { useEffect, useRef, type RefObject } from "react";

// Keep keyboard navigation in the topmost dialog and return focus to its opener.
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
  busy = false,
) {
  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  }, [onClose, busy]);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    const candidates = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter((node) => node.getClientRects().length > 0);
    if (!element.contains(document.activeElement))
      (
        element.querySelector<HTMLElement>("input, select, textarea") ??
        candidates()[0]
      )?.focus();
    const keydown = (event: KeyboardEvent) => {
      const overlays = document.querySelectorAll(".modal-backdrop");
      if (!overlays[overlays.length - 1]?.contains(element)) return;
      if (event.key === "Escape" && !latest.current.busy) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = candidates(),
        first = nodes[0],
        last = nodes[nodes.length - 1];
      if (
        event.shiftKey
          ? document.activeElement === first
          : document.activeElement === last
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    element.addEventListener("keydown", keydown);
    return () => {
      element.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref]);
}
