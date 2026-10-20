import { motion } from 'motion/react'
import type { ExcludedAgent, RankedAgent } from '../types'
import { AgentIcon } from '../lib/agents'
import { STATUS_META, cn } from '../lib/ui'

const PARTS = [
  { key: 'match', label: 'Capability match', weight: 0.5, color: 'bg-accent' },
  { key: 'success', label: 'Success rate', weight: 0.2, color: 'bg-ok' },
  { key: 'health', label: 'Health', weight: 0.15, color: 'bg-sky-400' },
  { key: 'speed', label: 'Speed', weight: 0.15, color: 'bg-indigo-300 dark:bg-indigo-400' },
] as const

/** Ranked candidates for one step: each stacked bar shows how the four factors add up to the score. */
export function ScoreBreakdown({ ranked, excluded, chosen }: { ranked: RankedAgent[]; excluded: ExcludedAgent[]; chosen: string | null }) {
  return (
    <div>
      <div className="space-y-2">
        {ranked.map((r, i) => (
          <div key={r.agent} className="grid grid-cols-[160px_1fr_48px] items-center gap-3">
            <span className={cn('flex min-w-0 items-center gap-2 text-xs', r.agent === chosen ? 'font-semibold text-ink' : 'text-muted')}>
              <AgentIcon name={r.agent} size="sm" className={r.agent === chosen ? '' : 'opacity-60'} />
              <span className="truncate">{r.agent}</span>
            </span>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface-3" title={PARTS.map((p) => `${p.label}: ${r.breakdown[p.key]} × ${p.weight}`).join('\n')}>
              {PARTS.map((p, j) => (
                <motion.div key={p.key} className={cn(p.color, 'border-r-2 border-surface last:border-r-0', r.agent !== chosen && 'opacity-45')}
                  initial={{ width: 0 }} animate={{ width: `${r.breakdown[p.key] * p.weight * 100}%` }}
                  transition={{ duration: 0.6, delay: 0.08 * i + 0.05 * j, ease: [0.16, 1, 0.3, 1] }} />
              ))}
            </div>
            <span className={cn('text-right font-mono text-xs tabular', r.agent === chosen ? 'font-medium text-ink' : 'text-muted')}>{r.score.toFixed(3)}</span>
          </div>
        ))}
        {excluded.map((e) => (
          <div key={e.agent} className="grid grid-cols-[160px_1fr_48px] items-center gap-3">
            <span className="flex min-w-0 items-center gap-2 text-xs text-faint">
              <AgentIcon name={e.agent} size="sm" className="opacity-40 grayscale" />
              <span className="truncate line-through">{e.agent}</span>
            </span>
            <span className={cn('w-fit rounded px-1.5 py-0.5 text-[10.5px] font-medium', STATUS_META[e.reason as keyof typeof STATUS_META]?.cls ?? 'bg-surface-3 text-muted')}>
              Excluded · {STATUS_META[e.reason as keyof typeof STATUS_META]?.label ?? e.reason}
            </span>
            <span />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[10.5px] text-muted">
        {PARTS.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span className={cn('h-2 w-2 rounded-sm', p.color)} />
            {p.label} <span className="font-mono text-faint">×{p.weight}</span>
          </span>
        ))}
      </div>
    </div>
  )
}
