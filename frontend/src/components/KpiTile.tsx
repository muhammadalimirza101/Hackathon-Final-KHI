import type { ReactNode } from 'react'
import { Card, cn } from '../lib/ui'

export function KpiTile({ label, value, hint, tone = 'default', icon }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'ok' | 'warn' | 'replan' | 'accent'
  icon?: ReactNode
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
        {label}
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <div
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums',
          tone === 'ok' && 'text-ok',
          tone === 'warn' && 'text-warn',
          tone === 'replan' && 'text-replan',
          tone === 'accent' && 'text-accent',
          tone === 'default' && 'text-white',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  )
}
