import { motion } from 'motion/react'
import type { Agent } from '../types'
import { AGENT_META, AgentIcon } from '../lib/agents'
import { StatusBadge, Switch, cn, compact, fadeUp, ms, pct } from '../lib/ui'

export function AgentCard({ agent, onToggle, busy }: { agent: Agent; onToggle: (a: Agent) => void; busy: boolean }) {
  const unavailable = agent.status === 'offline' || agent.status === 'maintenance'
  const changed = agent.status !== agent.original_status
  return (
    <motion.div layout variants={fadeUp}
      className={cn('group flex flex-col rounded-xl border border-line bg-surface shadow-card-sm transition-shadow hover:shadow-card', unavailable && 'bg-surface-2')}>
      <div className="flex items-start gap-3 p-4 pb-3">
        <AgentIcon name={agent.name} size="lg" className={unavailable ? 'opacity-50 grayscale' : ''} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-ink">{agent.name}</h3>
          </div>
          <div className="text-[11.5px] text-muted">{AGENT_META[agent.name]?.domain} · <span className="font-mono">{agent.agent_id}</span></div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p className="line-clamp-2 px-4 text-xs leading-relaxed text-ink-2">{agent.description}</p>
      <div className="mb-4 mt-3 flex flex-wrap gap-1 px-4">
        {agent.capabilities.map((c) => (
          <span key={c} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{c}</span>
        ))}
      </div>

      <div className="mt-auto grid grid-cols-3 border-y border-line">
        <Stat label="Success rate">
          {pct(agent.success_rate, 1)}
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
            <motion.div className="h-full rounded-full bg-ok" initial={{ width: 0 }} animate={{ width: `${agent.success_rate * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </Stat>
        <Stat label="Avg latency" className="border-x border-line">{ms(agent.avg_response_time_ms)}</Stat>
        <Stat label="Usage (30d)">{compact(agent.usage_count_30d)}</Stat>
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <div className="text-[11px] text-muted">
          {agent.live.calls > 0
            ? <>Live: <span className="font-medium text-ink-2">{agent.live.calls}</span> calls{agent.live.failures > 0 && <span className="text-bad"> · {agent.live.failures} failed</span>}{agent.live.avg_latency_ms != null && <> · {ms(agent.live.avg_latency_ms)}</>}</>
            : 'No live traffic yet'}
          {changed && <span className="ml-1 text-warn">· was {agent.original_status}</span>}
        </div>
        <label className="flex items-center gap-2 text-[11px] font-medium text-muted">
          In service
          <Switch checked={!unavailable} disabled={busy} onChange={() => onToggle(agent)} label={`Toggle ${agent.name}`} />
        </label>
      </div>
    </motion.div>
  )
}

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('px-4 py-2.5', className)}>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-muted">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold tabular text-ink">{children}</div>
    </div>
  )
}
