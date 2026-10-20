import { Activity, LayoutGrid, List, PowerOff, RotateCcw, Search, Wrench } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { AgentCard } from '../components/AgentCard'
import { AGENT_META, AgentIcon } from '../lib/agents'
import { Button, Card, CountUp, EmptyState, PageHeader, Segmented, Skeleton, StatusBadge, Switch, cn, compact, ms, pct, stagger, usePoll } from '../lib/ui'
import type { Agent } from '../types'

/** Maintenance and offline agents are skipped by the router. */
const inService = (a: Agent) => a.status === 'active' || a.status === 'degraded'

type Filter = 'all' | 'operational' | 'degraded' | 'unavailable'

const matches = (a: Agent, f: Filter) =>
  f === 'all' || (f === 'operational' && a.status === 'active') || (f === 'degraded' && a.status === 'degraded') ||
  (f === 'unavailable' && (a.status === 'maintenance' || a.status === 'offline'))

export default function Registry({ onChanged }: { onChanged?: () => void }) {
  const { data: agents, error, setData } = usePoll(api.agents, 8000)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState<'grid' | 'table'>('grid')

  async function toggle(a: Agent) {
    setBusy(a.agent_id)
    try {
      const updated = await api.setStatus(a.agent_id, inService(a) ? 'offline' : 'active')
      setData((prev) => prev?.map((x) => (x.agent_id === updated.agent_id ? updated : x)) ?? null)
      onChanged?.()
    } finally { setBusy(null) }
  }

  async function reset() {
    setBusy('all')
    try { setData(await api.resetAgents()); onChanged?.() } finally { setBusy(null) }
  }

  const list = (agents ?? []).filter((a) => matches(a, filter))
    .filter((a) => !q || `${a.name} ${a.description} ${a.capabilities.join(' ')} ${AGENT_META[a.name]?.domain}`.toLowerCase().includes(q.toLowerCase()))
  const count = (f: Filter) => (agents ?? []).filter((a) => matches(a, f)).length
  const modified = (agents ?? []).some((a) => a.status !== a.original_status)

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Fleet" title="Agent Registry"
        description="Every specialist agent available to the router, with its capabilities, live health and performance. Unavailable agents are skipped at routing time, so taking one out of service reroutes traffic instantly."
        actions={<Button onClick={reset} disabled={busy !== null || !modified}><RotateCcw size={14} /> Reset to original status</Button>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Registered agents" value={agents?.length} icon={<Activity size={15} />} />
        <SummaryTile label="Operational" value={count('operational')} tone="text-ok" icon={<span className="live-dot h-2 w-2 rounded-full bg-ok text-ok" />} />
        <SummaryTile label="Degraded" value={count('degraded')} tone="text-warn" icon={<Wrench size={15} />} />
        <SummaryTile label="Unavailable" value={count('unavailable')} tone="text-serious" icon={<PowerOff size={15} />} hint="maintenance or offline" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'all', label: <>All <span className="text-faint">{agents?.length ?? ''}</span></> },
          { value: 'operational', label: 'Operational' },
          { value: 'degraded', label: 'Degraded' },
          { value: 'unavailable', label: 'Unavailable' },
        ]} />
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search agents or capabilities"
            className="h-8 w-64 rounded-lg border border-line bg-surface pl-8 pr-3 text-[13px] text-ink shadow-card-sm outline-none placeholder:text-faint focus:border-accent/50 focus:ring-2 focus:ring-accent/15" />
        </div>
        <Segmented value={view} onChange={setView} options={[{ value: 'grid', label: <LayoutGrid size={14} /> }, { value: 'table', label: <List size={14} /> }]} />
      </div>

      {error && <Card className="border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</Card>}

      {!agents ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <Card><EmptyState icon={<Search size={18} />} title="No agents match">Try a different filter or search term.</EmptyState></Card>
      ) : view === 'grid' ? (
        <motion.div key={filter + q} variants={stagger(0.035)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => <AgentCard key={a.agent_id} agent={a} onToggle={toggle} busy={busy !== null} />)}
        </motion.div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-[0.05em] text-muted">
                <tr>
                  {['Agent', 'Domain', 'Status', 'Success', 'Avg latency', 'Usage 30d', 'Live calls', 'In service'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((a) => (
                  <tr key={a.agent_id} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><AgentIcon name={a.name} size="sm" /><div><div className="font-medium text-ink">{a.name}</div><div className="font-mono text-[10.5px] text-muted">{a.agent_id}</div></div></div></td>
                    <td className="px-4 py-2.5 text-ink-2">{AGENT_META[a.name]?.domain}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                    <td className="px-4 py-2.5 tabular text-ink-2">{pct(a.success_rate, 1)}</td>
                    <td className="px-4 py-2.5 tabular text-ink-2">{ms(a.avg_response_time_ms)}</td>
                    <td className="px-4 py-2.5 tabular text-ink-2">{compact(a.usage_count_30d)}</td>
                    <td className="px-4 py-2.5 tabular text-ink-2">{a.live.calls}{a.live.failures > 0 && <span className="text-bad"> ({a.live.failures} failed)</span>}</td>
                    <td className="px-4 py-2.5"><Switch checked={inService(a)} disabled={busy !== null} onChange={() => toggle(a)} label={`Toggle ${a.name}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

function SummaryTile({ label, value, icon, tone, hint }: { label: string; value: number | undefined; icon: ReactNode; tone?: string; hint?: string }) {
  return (
    <Card className="flex items-center justify-between px-4 py-3.5">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
        <div className={cn('mt-0.5 text-2xl font-semibold tabular text-ink', tone)}><CountUp value={value} /></div>
        {hint && <div className="text-[11px] text-faint">{hint}</div>}
      </div>
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-muted', tone)}>{icon}</span>
    </Card>
  )
}
