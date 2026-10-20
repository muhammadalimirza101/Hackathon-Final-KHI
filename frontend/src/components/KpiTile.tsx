import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { CountUp, cn, fadeUp } from '../lib/ui'

/** Metric tile. `value` animates; `format` renders it (e.g. as % or ms). */
export function KpiTile({ label, value, format, hint, icon, tone = 'default', footer }: {
  label: string
  value: number | null | undefined
  format?: (v: number) => string
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'replan' | 'accent'
  footer?: ReactNode
}) {
  return (
    <motion.div variants={fadeUp} className="rounded-xl border border-line bg-surface p-4 shadow-card-sm">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</span>
        {icon && <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg',
          tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'replan' ? 'bg-replan-soft text-replan' : tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-muted')}>{icon}</span>}
      </div>
      <div className="mt-2 text-[26px] font-semibold leading-none tracking-tight tabular text-ink">
        <CountUp value={value} format={format} />
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
      {footer}
    </motion.div>
  )
}
