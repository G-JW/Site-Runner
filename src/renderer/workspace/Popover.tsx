import { useEffect, useRef, type ReactNode } from "react";

/** Native disclosure with outside-click and Escape dismissal. */
export function Popover({
  label,
  title,
  children,
  className = "",
  testId,
  closeOnAction = true,
}: {
  label: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
  testId?: string;
  closeOnAction?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        event.stopPropagation();
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  return (
    <details ref={ref} className={`popover ${className}`} data-popover>
      <summary aria-label={title} title={title} data-testid={testId}>
        {label}
      </summary>
      <div
        className="popover-content"
        onClick={(event) => {
          const button = (event.target as HTMLElement).closest("button");
          if (closeOnAction && button && !button.disabled && ref.current)
            ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
