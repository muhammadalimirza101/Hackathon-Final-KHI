import { clsx, type ClassValue } from 'clsx'
import { animate, motion, useInView, useMotionValue, useTransform, type Variants } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import type { AgentStatus } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
export const ms = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}s` : `${Math.round(v)}ms`
export const compact = (v: number) => Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

/* ---------- layout ---------- */

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cn('rounded-xl border border-line bg-surface shadow-card', className)}>{children}</div>
}

export function CardHeader({ title, subtitle, right, icon, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-5 py-3.5', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">{eyebrow}</div>}
        <h1 className="text-[26px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------- controls ---------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'
export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
        size === 'md' ? 'h-9 px-3.5 text-[13px]' : 'h-7 px-2.5 text-xs',
        variant === 'primary' && 'bg-accent text-white shadow-card-sm hover:bg-accent-hover',
        variant === 'secondary' && 'border border-line bg-surface text-ink-2 shadow-card-sm hover:border-line-strong hover:bg-surface-2 hover:text-ink',
        variant === 'ghost' && 'text-muted hover:bg-surface-3 hover:text-ink',
        variant === 'danger' && 'border border-bad/30 bg-bad-soft text-bad hover:border-bad/50',
        className,
      )}
    />
  )
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50',
        checked ? 'bg-ok' : 'bg-line-strong')}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 700, damping: 35 }}
        className={cn('h-4 w-4 rounded-full bg-white shadow', checked ? 'ml-[18px]' : 'ml-0.5')} />
    </button>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn('relative rounded-md px-3 py-1 text-xs font-medium transition-colors', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-md border border-line bg-surface shadow-card-sm" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative flex items-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] font-medium text-muted">{children}</kbd>
}

/* ---------- status ---------- */

export const STATUS_META: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  active: { label: 'Operational', cls: 'bg-ok-soft text-ok', dot: 'bg-ok' },
  degraded: { label: 'Degraded', cls: 'bg-warn-soft text-warn', dot: 'bg-warn' },
  maintenance: { label: 'Maintenance', cls: 'bg-serious-soft text-serious', dot: 'bg-serious' },
  offline: { label: 'Offline', cls: 'bg-bad-soft text-bad', dot: 'bg-bad' },
}

export function StatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  const m = STATUS_META[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', m.cls, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', m.dot, status === 'active' && 'live-dot text-ok')} />
      {m.label}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'replan'; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
      tone === 'neutral' && 'bg-surface-3 text-ink-2',
      tone === 'accent' && 'bg-accent-soft text-accent-ink',
      tone === 'ok' && 'bg-ok-soft text-ok',
      tone === 'warn' && 'bg-warn-soft text-warn',
      tone === 'bad' && 'bg-bad-soft text-bad',
      tone === 'replan' && 'bg-replan-soft text-replan',
      className)}>
      {children}
    </span>
  )
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-[11px] text-muted', className)}>{children}</span>
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">{icon}</div>
      <div className="text-sm font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-sm text-xs text-muted">{children}</div>}
    </div>
  )
}

/* ---------- motion helpers ---------- */

/** Number that counts up when it scrolls into view and animates between updates. */
export function CountUp({ value, format = (v) => String(Math.round(v)), className }: { value: number | null | undefined; format?: (v: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => format(v))
  useEffect(() => {
    if (value == null || !inView) return
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] })
    return () => c.stop()
  }, [value, inView, mv])
  if (value == null) return <span ref={ref} className={className}>—</span>
  return <motion.span ref={ref} className={className}>{text}</motion.span>
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
}
export const stagger = (delay = 0.04): Variants => ({ hidden: {}, show: { transition: { staggerChildren: delay } } })

/** Fetch on mount and every `intervalMs`; returns data, error and a manual refresh. */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current())
      setError(null)
      setUpdatedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])
  return { data, error, refresh, setData, updatedAt }
}

export const INTENT_LABEL: Record<string, string> = {
  hr_policy: 'HR policy', legal_review: 'Legal review', compliance_check: 'Compliance', finance_analysis: 'Finance analysis',
  sales_report: 'Sales analytics', data_cleaning: 'Data cleaning', report_generation: 'Report writing', meeting_notes: 'Meeting notes',
  translation: 'Translation', code_help: 'Code assistance', security_scan: 'Security scan', customer_feedback: 'Customer feedback',
  unsupported: 'Unsupported',
}
