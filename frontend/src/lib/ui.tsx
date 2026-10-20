import { clsx, type ClassValue } from 'clsx'
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import type { AgentStatus } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const pct = (v: number | null | undefined, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`)
export const ms = (v: number | null | undefined) =>
  v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)} s` : `${Math.round(v)} ms`

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-line bg-panel', className)}>{children}</div>
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'
export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-slate-950 hover:bg-cyan-300',
        variant === 'outline' && 'border border-line bg-panel-2 text-slate-200 hover:border-slate-500',
        variant === 'ghost' && 'text-muted hover:bg-panel-2 hover:text-white',
        variant === 'danger' && 'border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20',
        className,
      )}
    />
  )
}

const STATUS_STYLE: Record<AgentStatus, string> = {
  active: 'bg-ok/10 text-ok border-ok/30',
  degraded: 'bg-warn/10 text-warn border-warn/30',
  maintenance: 'bg-orange-500/10 text-orange-300 border-orange-400/30',
  offline: 'bg-bad/10 text-bad border-bad/30',
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLE[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  )
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-md bg-panel-2 px-2 py-0.5 font-mono text-[11px] text-slate-300', className)}>{children}</span>
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />
}

/** Fetch on mount and every `intervalMs`; returns data, error and a manual refresh. */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const refresh = useCallback(async () => {
    try {
      setData(await fnRef.current())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, intervalMs)
    return () => clearInterval(id)
  }, [refresh, intervalMs])
  return { data, error, refresh, setData }
}

export const INTENT_LABEL: Record<string, string> = {
  hr_policy: 'HR policy', legal_review: 'Legal review', compliance_check: 'Compliance', finance_analysis: 'Finance',
  sales_report: 'Sales report', data_cleaning: 'Data cleaning', report_generation: 'Report', meeting_notes: 'Meeting notes',
  translation: 'Translation', code_help: 'Code help', security_scan: 'Security scan', customer_feedback: 'Customer feedback',
  unsupported: 'Unsupported',
}
