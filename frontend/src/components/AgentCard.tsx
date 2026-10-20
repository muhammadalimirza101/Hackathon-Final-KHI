import { Power } from 'lucide-react'
import type { Agent } from '../types'
import { Card, StatusBadge, cn, ms, pct } from '../lib/ui'

export function AgentCard({ agent, onToggle, busy }: { agent: Agent; onToggle: (a: Agent) => void; busy: boolean }) {
  const offline = agent.status === 'offline'
  const changed = agent.status !== agent.original_status
  return (
    <Card className={cn('flex flex-col p-4 transition', offline && 'opacity-70')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] text-muted">{agent.agent_id}</div>
          <h3 className="text-base font-semibold text-white">{agent.name}</h3>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted">{agent.description}</p>
      <div className="mt-3 flex flex-wrap gap-1">
        {agent.capabilities.map((c) => (
          <span key={c} className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">{c}</span>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
        <div>
          <dt className="text-muted">Success</dt>
          <dd className="font-semibold tabular-nums text-white">{pct(agent.success_rate, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted">Avg latency</dt>
          <dd className="font-semibold tabular-nums text-white">{ms(agent.avg_response_time_ms)}</dd>
        </div>
        <div>
          <dt className="text-muted">Live calls</dt>
          <dd className="font-semibold tabular-nums text-white">
            {agent.live.calls}
            {agent.live.failures > 0 && <span className="ml-1 text-bad">({agent.live.failures}✕)</span>}
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-4">
        <button
          disabled={busy}
          onClick={() => onToggle(agent)}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50',
            offline ? 'border-ok/40 text-ok hover:bg-ok/10' : 'border-bad/40 text-bad hover:bg-bad/10',
          )}
        >
          <Power size={13} />
          {offline ? `Bring online${changed ? ` (was ${agent.original_status})` : ''}` : 'Take offline'}
        </button>
      </div>
    </Card>
  )
}
