import { useEffect, useId, useRef, useState } from "react";
import {
  DEMO_ROLES,
  ROLE_LABELS,
  type DemoRole,
} from "./demoRoleMatrix";

type RoleMenuProps = {
  role: DemoRole;
  onChange: (next: DemoRole) => void;
  /** Visible prefix before the role name. */
  label?: string;
  /** Larger trigger for the Sign-In gate. */
  size?: "compact" | "comfortable";
  /** `ghost` = header control; `field` = bordered form control. */
  variant?: "ghost" | "field";
  className?: string;
};

/**
 * Shared sleek role picker (demo RBAC stub). Used on the Sign-In gate and the
 * app header — not Catalyst Auth.
 */
export function RoleMenu({
  role,
  onChange,
  label = "Signed in as",
  size = "compact",
  variant = "ghost",
  className = "",
}: RoleMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const comfortable = size === "comfortable";

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const triggerPad = comfortable ? "px-3.5 py-2.5 text-[14px]" : "px-2.5 py-1.5 text-[12.5px]";
  const menuMin = comfortable ? "min-w-[14rem]" : "min-w-[11.5rem]";
  const itemPad = comfortable ? "px-3.5 py-2.5 text-[14px]" : "px-3 py-2 text-[12.5px]";

  const closedClass =
    variant === "field"
      ? `inline-flex w-full items-center justify-between gap-2 rounded-md border border-[var(--line)] bg-[var(--surface)] ${triggerPad} font-[family-name:var(--font-mono)] text-[var(--ink-muted)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`
      : `inline-flex w-full items-center justify-between gap-2 rounded-md ${triggerPad} font-[family-name:var(--font-mono)] text-[var(--ink-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`;

  const openClass = `inline-flex w-full items-center justify-between gap-2 rounded-md bg-[var(--accent-soft)] ${triggerPad} font-[family-name:var(--font-mono)] font-medium text-[var(--accent-ink)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]`;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label} ${ROLE_LABELS[role]}`}
        onClick={() => setOpen((v) => !v)}
        className={open ? openClass : closedClass}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-[var(--ink-faint)]">{label}</span>
          <span className="truncate text-[var(--accent-ink)]">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown open={open} />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className={`absolute left-0 right-0 z-20 mt-1.5 ${menuMin} overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)] py-1 shadow-[var(--shadow)]`}
        >
          {DEMO_ROLES.map((r) => {
            const selected = r === role;
            return (
              <li key={r} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r);
                    setOpen(false);
                  }}
                  className={
                    selected
                      ? `flex w-full items-center justify-between gap-3 ${itemPad} text-left font-[family-name:var(--font-mono)] font-medium text-[var(--accent-ink)] bg-[var(--accent-soft)]`
                      : `flex w-full items-center justify-between gap-3 ${itemPad} text-left font-[family-name:var(--font-mono)] text-[var(--ink-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]`
                  }
                >
                  {ROLE_LABELS[r]}
                  {selected && (
                    <span aria-hidden="true" className="text-[var(--accent)]">
                      ✓
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`h-3 w-3 shrink-0 text-[var(--ink-faint)] transition-transform duration-150 ${open ? "rotate-180" : ""}`}
    >
      <path
        d="M2.5 4.25 6 7.75l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
