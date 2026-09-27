"use client";

import { Component, type ButtonHTMLAttributes, type ErrorInfo, type ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(" ");
}

export type Tone =
  | "zinc"
  | "slate"
  | "emerald"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "amber"
  | "orange"
  | "yellow"
  | "rose"
  | "red";

// Full class strings (Tailwind scans source; never build class names dynamically).
export const BADGE_TONE: Record<Tone, string> = {
  zinc: "bg-zinc-500/10 text-zinc-300 ring-zinc-500/25",
  slate: "bg-slate-500/10 text-slate-300 ring-slate-400/25",
  emerald: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25",
  teal: "bg-teal-500/10 text-teal-300 ring-teal-500/25",
  sky: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
  indigo: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30",
  violet: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  amber: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
  orange: "bg-orange-500/10 text-orange-300 ring-orange-500/25",
  yellow: "bg-yellow-500/10 text-yellow-200 ring-yellow-500/25",
  rose: "bg-rose-500/10 text-rose-300 ring-rose-500/30",
  red: "bg-red-500/15 text-red-300 ring-red-500/40",
};

export const DOT_TONE: Record<Tone, string> = {
  zinc: "bg-zinc-500",
  slate: "bg-slate-400",
  emerald: "bg-emerald-400",
  teal: "bg-teal-400",
  sky: "bg-sky-400",
  indigo: "bg-indigo-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  orange: "bg-orange-400",
  yellow: "bg-yellow-300",
  rose: "bg-rose-400",
  red: "bg-red-500",
};

export const TEXT_TONE: Record<Tone, string> = {
  zinc: "text-zinc-300",
  slate: "text-slate-300",
  emerald: "text-emerald-300",
  teal: "text-teal-300",
  sky: "text-sky-300",
  indigo: "text-indigo-300",
  violet: "text-violet-300",
  amber: "text-amber-300",
  orange: "text-orange-300",
  yellow: "text-yellow-200",
  rose: "text-rose-300",
  red: "text-red-300",
};

export const RING_TONE: Record<Tone, string> = {
  zinc: "border-zinc-600 bg-zinc-800 text-zinc-300",
  slate: "border-slate-500/50 bg-slate-500/15 text-slate-300",
  emerald: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  teal: "border-teal-500/50 bg-teal-500/15 text-teal-300",
  sky: "border-sky-500/50 bg-sky-500/15 text-sky-300",
  indigo: "border-indigo-500/50 bg-indigo-500/15 text-indigo-300",
  violet: "border-violet-500/50 bg-violet-500/15 text-violet-300",
  amber: "border-amber-500/50 bg-amber-500/15 text-amber-300",
  orange: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  yellow: "border-yellow-500/50 bg-yellow-500/15 text-yellow-200",
  rose: "border-rose-500/50 bg-rose-500/15 text-rose-300",
  red: "border-red-500/60 bg-red-500/20 text-red-300",
};

export const inputCls =
  "w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors duration-150 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-sky-500/20";

export function Badge({
  tone = "zinc",
  mono,
  className,
  title,
  children,
}: {
  tone?: Tone;
  mono?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset",
        mono && "font-mono",
        BADGE_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = "zinc", pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-1.5 w-1.5 shrink-0 rounded-full", DOT_TONE[tone], pulse && "animate-pulse", className)}
    />
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-xl border border-zinc-800 bg-zinc-900/60", className)}>{children}</section>;
}

export function PanelHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-3", className)}>
      <div className="min-w-0">
        <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400">{title}</h2>
        {subtitle && <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function SectionLabel({
  children,
  right,
  className,
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-2 flex items-center justify-between gap-2", className)}>
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{children}</h3>
      {right}
    </div>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANT: Record<Variant, string> = {
  primary: "border-transparent bg-zinc-100 text-zinc-900 hover:bg-white",
  secondary: "border-zinc-700/80 bg-zinc-800/50 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800",
  ghost: "border-transparent bg-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      type={type ?? "button"}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
        className,
      )}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="none" className={cx("h-3.5 w-3.5 animate-spin", className)}>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  check: "M3.5 8.5l3 3 6-7",
  x: "M4.5 4.5l7 7m0-7l-7 7",
  refresh: "M13 8a5 5 0 1 1-1.46-3.54M13 2.5v3h-3",
  chevron: "M6 4l4 4-4 4",
  alert: "M8 2.2l6.2 11H1.8zM8 6.5v3.2M8 11.6v.2",
  shield: "M8 1.8l5 2v4.1c0 3-2.1 5.3-5 6.3-2.9-1-5-3.3-5-6.3V3.8z",
  database: "M2.5 4c0-1.1 2.5-2 5.5-2s5.5.9 5.5 2-2.5 2-5.5 2-5.5-.9-5.5-2zm0 0v8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2",
  arrow: "M3 8h10m-4-4l4 4-4 4",
  search: "M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zm3.6-1.4L14 14",
  clock: "M8 14A6 6 0 1 0 8 2a6 6 0 0 0 0 12zM8 4.8V8l2.2 1.4",
  eye: "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  diamond: "M8 2l6 6-6 6-6-6z",
  merge: "M4 2.5v11M12 2.5v4c0 2-1.5 3.5-4 4.5",
  scale: "M8 2.5v11M4.5 13.5h7M3 5h10M3 5l-1.8 4.2a1.9 1.9 0 0 0 3.6 0zM13 5l-1.8 4.2a1.9 1.9 0 0 0 3.6 0z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("h-3.5 w-3.5", className)}
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

export function ErrorBox({
  title = "Request failed",
  message,
  action,
  className,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cx("rounded-lg border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2.5", className)}>
      <div className="flex items-start gap-2">
        <Icon name="alert" className="mt-0.5 shrink-0 text-rose-400" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-rose-200">{title}</div>
          <div className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-rose-300/90">
            {message}
          </div>
        </div>
        {action}
      </div>
    </div>
  );
}

export function Empty({
  title,
  hint,
  action,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 px-4 py-8 text-center",
        className,
      )}
    >
      <div className="text-sm text-zinc-300">{title}</div>
      {hint && <div className="max-w-sm text-xs leading-relaxed text-zinc-500">{hint}</div>}
      {action}
    </div>
  );
}

export function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cx("space-y-2", className)}>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <Dot tone="sky" pulse /> {label}
      </div>
      <div className="h-12 animate-pulse rounded-lg bg-zinc-800/40" />
      <div className="h-12 animate-pulse rounded-lg bg-zinc-800/30" />
      <div className="h-12 animate-pulse rounded-lg bg-zinc-800/20" />
    </div>
  );
}

export function Meter({ value, tone, className }: { value: number; tone: Tone; className?: string }) {
  const w = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-zinc-800", className)}>
      <div className={cx("h-full rounded-full transition-[width] duration-300", DOT_TONE[tone])} style={{ width: `${w}%` }} />
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
      <div className="text-[10.5px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={cx("mt-0.5 text-lg font-semibold tabular-nums", tone ? TEXT_TONE[tone] : "text-zinc-100")}>{value}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex select-none items-center gap-2 rounded-md text-xs text-zinc-400 transition-colors duration-150 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
    >
      <span
        className={cx(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors duration-200",
          checked ? "border-emerald-500/40 bg-emerald-500/30" : "border-zinc-700 bg-zinc-800",
        )}
      >
        <span
          className={cx(
            "inline-block h-2.5 w-2.5 rounded-full bg-zinc-200 transition-transform duration-200",
            checked ? "translate-x-3.5" : "translate-x-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Keeps one panel's render crash (e.g. an unexpected payload) from blanking the whole dashboard. */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorBox
          title={`${this.props.label} failed to render`}
          message={this.state.error.message}
          action={
            <Button size="sm" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
