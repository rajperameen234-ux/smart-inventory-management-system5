import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AlertIcon, CloseIcon, InboxIcon, SearchIcon } from "./Icon";
import { Spinner } from "./Spinner";

/* -------------------------------------------------------------------------- */
/*  Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

export function PageStack({ children }: { children: ReactNode }) {
  return <div className="page-stack">{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>

      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

type CardProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function Card({ children, className = "", style }: CardProps) {
  return (
    <section className={`card ${className}`.trim()} style={style}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  plain = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  plain?: boolean;
}) {
  return (
    <div className={`card-header${plain ? " is-plain" : ""}`}>
      <div className="card-title">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>

      {actions ? <div className="card-actions">{actions}</div> : null}
    </div>
  );
}

export function CardBody({
  children,
  flush = false,
}: {
  children: ReactNode;
  flush?: boolean;
}) {
  return <div className={`card-body${flush ? " is-flush" : ""}`}>{children}</div>;
}

/* -------------------------------------------------------------------------- */
/*  Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft-danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  block?: boolean;
};

export function Button({
  variant = "secondary",
  size = "md",
  block = false,
  className = "",
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "default" | "danger";
};

export function IconButton({
  label,
  tone = "default",
  className = "",
  type = "button",
  children,
  ...rest
}: IconButtonProps) {
  const classes = [
    tone === "danger" ? "btn btn-sm btn-soft-danger" : "btn btn-sm btn-ghost",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Form controls                                                              */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  hint,
  required = false,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field ${className}`.trim()}>
      <span className="label">
        {label}
        {required ? <span className="req">*</span> : null}
      </span>

      {children}

      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;

  return <input className={`input ${className}`.trim()} {...rest} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", children, ...rest } = props;

  return (
    <select className={`select ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;

  return <textarea className={`textarea ${className}`.trim()} {...rest} />;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="toolbar-search">
      <span className="toolbar-search-icon">
        <SearchIcon size={15} />
      </span>

      <input
        type="search"
        className="input"
        value={value}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Badges                                                                     */
/* -------------------------------------------------------------------------- */

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "lavender"
  | "pink"
  | "sky"
  | "mint"
  | "yellow";

export function Badge({
  tone = "neutral",
  children,
  plain = false,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  plain?: boolean;
}) {
  return (
    <span
      className={`badge badge-${tone}${plain ? " badge-plain" : ""}`.trim()}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stats                                                                      */
/* -------------------------------------------------------------------------- */

export type StatTone =
  | "neutral"
  | "lavender"
  | "pink"
  | "sky"
  | "mint"
  | "yellow"
  | "peach"
  | "emerald"
  | "amber"
  | "red"
  | "blue";

export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  meta,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  meta?: ReactNode;
  loading?: boolean;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>

        {icon ? <span className={`stat-icon ${tone}`}>{icon}</span> : null}
      </div>

      <div className="stat-value">
        {loading ? <span className="skeleton skeleton-row" style={{ width: 96, height: 26 }} /> : value}
      </div>

      {meta ? <div className="stat-meta">{meta}</div> : null}
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/*  States                                                                     */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon ?? <InboxIcon size={21} />}</span>

      <h4>{title}</h4>

      {description ? <p>{description}</p> : null}

      {action}
    </div>
  );
}

export function LoadingBlock({ label = "Loading data..." }: { label?: string }) {
  return (
    <div className="loading-block">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index}>
          <td colSpan={100}>
            <div
              className="skeleton skeleton-row"
              style={{ width: `${55 + ((index * 13) % 40)}%` }}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

export function Alert({
  tone = "error",
  title,
  children,
  action,
}: {
  tone?: "error" | "success" | "info" | "warning";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={`alert alert-${tone}`} role="alert">
      <AlertIcon size={16} />

      <div className="alert-content">
        <strong>{title}</strong>
        {children}
      </div>

      {action}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Modal                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tracks how many modals are open so body scroll locking nests correctly.
 * Previously each modal captured and restored the previous `overflow` value,
 * so closing the outer modal while an inner one was still open left the page
 * permanently unable to scroll.
 */
let openModalCount = 0;

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
  labelledBy,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "sm";
  labelledBy?: string;
}) {
  const generatedId = useId();
  const headingId = labelledBy ?? generatedId;

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);

    if (openModalCount === 0) {
      document.body.style.overflow = "hidden";
    }

    openModalCount += 1;

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openModalCount = Math.max(0, openModalCount - 1);

      if (openModalCount === 0) {
        document.body.style.overflow = "";
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-card${size === "sm" ? " is-sm" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="modal-header">
          <div className="card-title">
            <h3 id={headingId}>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>

          <IconButton label="Close dialog" onClick={onClose}>
            <CloseIcon size={16} />
          </IconButton>
        </header>

        {children}

        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/*  Confirm dialog                                                             */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      size="sm"
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>

          <Button variant="soft-danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ color: "var(--text-secondary)", fontSize: 13.5, lineHeight: 1.6 }}>
          {description}
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Popover hook                                                               */
/* -------------------------------------------------------------------------- */

export function useDismissable(
  open: boolean,
  onClose: () => void
): { panelRef: React.RefObject<HTMLDivElement | null> } {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (panelRef.current?.contains(target)) return;

      // Clicks on the trigger are handled by the trigger's own toggle handler.
      if ((target as HTMLElement).closest("[data-popover-anchor]")) return;

      onClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return { panelRef };
}