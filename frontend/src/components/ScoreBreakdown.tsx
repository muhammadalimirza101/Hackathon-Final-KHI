import type { ExcludedAgent, RankedAgent } from '../types'
import { cn } from '../lib/ui'

const PARTS = [
  { key: 'match', label: 'match', weight: 0.5, color: 'bg-accent' },
  { key: 'success', label: 'success', weight: 0.2, color: 'bg-ok' },
  { key: 'health', label: 'health', weight: 0.15, color: 'bg-sky-400' },
  { key: 'speed', label: 'speed', weight: 0.15, color: 'bg-indigo-400' },
] as const

/** Ranked candidates for one step: a stacked bar shows how each factor contributes to the score. */
export function ScoreBreakdown({ ranked, excluded, chosen }: { ranked: RankedAgent[]; excluded: ExcludedAgent[]; chosen: string | null }) {
  return (
    <div className="space-y-2">
      {ranked.map((r) => (
        <div key={r.agent} className="grid grid-cols-[130px_1fr_44px] items-center gap-3 text-xs">
          <span className={cn('truncate', r.agent === chosen ? 'font-semibold text-white' : 'text-muted')}>
            {r.agent === chosen && '▸ '}
            {r.agent}
          </span>
          <div className="group relative flex h-2.5 overflow-hidden rounded-full bg-panel-2">
            {PARTS.map((p) => (
              <div
                key={p.key}
                className={cn(p.color, r.agent !== chosen && 'opacity-50')}
                style={{ width: `${r.breakdown[p.key] * p.weight * 100}%` }}
                title={`${p.label}: ${r.breakdown[p.key]} × ${p.weight}`}
              />
            ))}
          </div>
          <span className="text-right font-mono tabular-nums text-slate-300">{r.score.toFixed(2)}</span>
        </div>
      ))}
      {excluded.map((e) => (
        <div key={e.agent} className="grid grid-cols-[130px_1fr_44px] items-center gap-3 text-xs">
          <span className="truncate text-muted line-through">{e.agent}</span>
          <span className="text-orange-300">excluded: {e.reason}</span>
          <span />
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted">
        {PARTS.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1">
            <span className={cn('h-2 w-2 rounded-sm', p.color)} />
            {p.label} ×{p.weight}
          </span>
        ))}
      </div>
    </div>
  )
}
