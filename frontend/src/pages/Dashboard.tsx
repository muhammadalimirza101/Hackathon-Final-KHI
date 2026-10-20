import { Activity, ArrowRight, CircleCheck, GitBranch, Inbox, Layers, Target, Timer, TriangleAlert, Zap } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { KpiTile } from '../components/KpiTile'
import { AgentIcon } from '../lib/agents'
import { chartColors, type Theme } from '../lib/theme'
import { Badge, Card, CardHeader, CountUp, EmptyState, INTENT_LABEL, PageHeader, StatusBadge, cn, ms, pct, stagger, timeAgo, usePoll } from '../lib/ui'

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value: number; payload: Record<string, unknown> }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null
  const q = payload[0].payload.query as string | undefined
  return (
    <div className="max-w-xs rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <div className="font-medium text-ink">{format(payload[0].value)}</div>
      <div className="text-muted">{q ?? label}</div>
    </div>
  )
}

export default function Dashboard({ theme }: { theme: Theme }) {
  const { data: m, error, updatedAt } = usePoll(api.metrics, 8000)
  const { data: logs } = usePoll(() => api.logs(60), 8000)
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick((t) => t + 1), 1000); return () => clearInterval(id) }, [])
  const c = chartColors(theme)

  const accuracy = m?.routing_accuracy
  const trend = [...(logs ?? [])].filter((l) => !l.unsupported).reverse()
    .map((l, i) => ({ i: i + 1, latency: l.total_latency_ms, overhead: l.router_overhead_ms, query: l.query }))
  const intents = Object.entries(m?.intent_distribution ?? {}).map(([k, v]) => ({ name: INTENT_LABEL[k] ?? k, value: v }))
  const agentRows = [...(m?.per_agent ?? [])].sort((a, b) => b.calls - a.calls)
  const maxCalls = Math.max(1, ...agentRows.map((a) => a.calls))

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Observability"
        description="Live routing quality, latency and resilience across every request handled by the platform."
        actions={<span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted shadow-card-sm">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-ok text-ok" />
          Live · updated {updatedAt ? `${Math.max(0, Math.round((Date.now() - updatedAt) / 1000))}s ago` : '…'} · {m?.storage === 'firestore' ? 'Firestore' : 'in-memory'}
        </span>} />
      {error && <Card className="border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</Card>}

      {/* ---------- hero: before vs now ---------- */}
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.9fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">Routing accuracy</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-5xl font-semibold tracking-tight tabular text-ink"><CountUp value={accuracy != null ? accuracy * 100 : null} format={(v) => `${v.toFixed(0)}%`} /></span>
            {accuracy != null && <Badge tone="ok">+{Math.round((accuracy - (m?.baseline_routing_accuracy ?? 0)) * 100)} pts vs baseline</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted">Share of requests sent to the right agent</p>
          <div className="mt-5 space-y-3">
            <CompareBar label="Before · historical logs" sub="18 of 200 requests" value={m?.baseline_routing_accuracy ?? null} cls="bg-bad/70" />
            <CompareBar label="Meta-Router · evaluation" sub={accuracy == null ? 'run an evaluation' : m?.routing_accuracy_original != null ? `${pct(m.routing_accuracy_original, 0)} on the 200 original queries` : 'realistic query set'} value={accuracy ?? null} cls="bg-accent" />
          </div>
        </Card>
        <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KpiTile label="Requests" value={m?.total_requests} icon={<Activity size={14} />} hint={<>success rate <b className="text-ink-2">{pct(m?.success_rate)}</b></>} />
          <KpiTile label="Compound completion" value={m?.compound_completion ?? m?.live_compound_completion} format={(v) => `${(v * 100).toFixed(0)}%`} icon={<Layers size={14} />} tone="ok"
            hint={m?.compound_completion != null ? 'multi-step evaluation set' : 'live multi-step requests'} />
          <KpiTile label="Latency p50" value={m?.p50_latency_ms} format={ms} icon={<Timer size={14} />} hint={<>p95 <b className="text-ink-2">{ms(m?.p95_latency_ms)}</b></>} />
          <KpiTile label="Router overhead" value={m?.avg_router_overhead_ms} format={ms} icon={<Zap size={14} />} tone="accent"
            hint={m?.eval_overhead_ms != null ? <>vs direct call <b className="text-ink-2">+{ms(m.eval_overhead_ms)}</b></> : 'planner + routing per request'} />
          <KpiTile label="Fallback rate" value={m?.fallback_rate} format={(v) => `${(v * 100).toFixed(0)}%`} icon={<TriangleAlert size={14} />} tone="warn" hint="requests rerouted at least once" />
          <KpiTile label="Replans" value={m?.replan_count} icon={<GitBranch size={14} />} tone="replan" hint={<>recovery rate <b className="text-ink-2">{pct(m?.replan_recovery_rate)}</b></>} />
        </motion.div>
      </div>

      {/* ---------- charts ---------- */}
      <div className="grid gap-4 xl:grid-cols-[1.9fr_1.1fr]">
        <Card>
          <CardHeader icon={<Timer size={15} />} title="End-to-end latency" subtitle="Last 60 requests, oldest to newest"
            right={<div className="flex gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 rounded bg-accent" />Total</span>
              <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 rounded bg-replan" />Orchestration overhead</span>
            </div>} />
          <div className="h-[260px] px-2 pb-2 pt-4">
            {trend.length < 2 ? <EmptyState icon={<Inbox size={18} />} title="Not enough traffic yet">Latency appears after a couple of requests.</EmptyState> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ left: 0, right: 16, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={c.accent} stopOpacity={0.22} />
                      <stop offset="1" stopColor={c.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="i" tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} minTickGap={40} />
                  <YAxis tick={{ fontSize: 11, fill: c.axis }} tickFormatter={(v) => ms(v)} axisLine={false} tickLine={false} width={48} />
                  <Tooltip content={<ChartTooltip format={ms} />} cursor={{ stroke: c.line }} />
                  <Area type="monotone" dataKey="latency" stroke={c.accent} strokeWidth={2} fill="url(#lat)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: c.surface }} />
                  <Area type="monotone" dataKey="overhead" stroke={c.replan} strokeWidth={1.5} fill={c.replan} fillOpacity={0.08} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader icon={<Target size={15} />} title="Intent mix" subtitle="Planned steps by business intent" />
          <div className="h-[260px] px-2 pb-2 pt-3">
            {intents.length === 0 ? <EmptyState icon={<Inbox size={18} />} title="No traffic yet" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={intents} layout="vertical" margin={{ left: 4, right: 20, top: 0, bottom: 0 }} barCategoryGap={5}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" interval={0} tick={{ fontSize: 11, fill: c.axis }} width={132} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip format={(v) => `${v} step${v === 1 ? '' : 's'}`} />} cursor={{ fill: c.grid, opacity: 0.5 }} />
                  <Bar dataKey="value" fill={c.accent} radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ---------- per-agent ---------- */}
      <Card className="overflow-hidden">
        <CardHeader icon={<Activity size={15} />} title="Agent performance" subtitle="Live calls through the orchestrator · out-of-scope replies and timeouts count as failures" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-[0.05em] text-muted">
              <tr>{['Agent', 'Status', 'Live calls', 'Success', 'Avg latency', 'Registry baseline'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {agentRows.map((a) => (
                <tr key={a.agent} className="hover:bg-surface-2">
                  <td className="px-4 py-2.5"><span className="flex items-center gap-2.5"><AgentIcon name={a.agent} size="sm" /><span className="font-medium text-ink">{a.agent}</span></span></td>
                  <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                        <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${(a.calls / maxCalls) * 100}%` }} transition={{ duration: 0.7 }} />
                      </div>
                      <span className="tabular text-ink-2">{a.calls}</span>
                    </div>
                  </td>
                  <td className={cn('px-4 py-2.5 tabular', a.success_rate == null ? 'text-faint' : a.success_rate >= 0.9 ? 'text-ok' : 'text-warn')}>{pct(a.success_rate)}</td>
                  <td className="px-4 py-2.5 tabular text-ink-2">{ms(a.avg_latency_ms)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted">{pct(a.registry_success_rate, 1)} · {ms(a.registry_avg_response_time_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---------- decisions ---------- */}
      <Card className="overflow-hidden">
        <CardHeader icon={<ArrowRight size={15} />} title="Routing decisions" subtitle="Most recent first" />
        {!logs?.length ? <EmptyState icon={<Inbox size={18} />} title="No requests yet">Decisions appear here as soon as requests run.</EmptyState> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-[0.05em] text-muted">
                <tr>{['Request', 'Routing', 'Latency', 'Overhead', 'Resilience', 'Outcome', 'When'].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {logs.slice(0, 15).map((l) => (
                  <tr key={l.request_id} className="align-top hover:bg-surface-2">
                    <td className="max-w-[280px] px-4 py-3"><div className="line-clamp-2 text-ink">{l.query}</div><div className="mt-0.5 font-mono text-[10.5px] text-faint">{l.request_id}</div></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {l.unsupported && <span className="text-xs text-muted">Declined · out of scope</span>}
                        {l.steps.map((s) => (
                          <span key={s.step_id} className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                            <span className="text-muted">{INTENT_LABEL[s.intent] ?? s.intent}</span>
                            <ArrowRight size={11} className="text-faint" />
                            {s.final_agent ? <><AgentIcon name={s.final_agent} size="sm" /><span className="font-medium text-ink">{s.final_agent}</span></> : <span className="text-bad">failed</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular text-ink-2">{ms(l.total_latency_ms)}</td>
                    <td className="px-4 py-3 tabular text-ink-2">{ms(l.router_overhead_ms)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {l.fallback_count > 0 && <Badge tone="warn">{l.fallback_count} fallback</Badge>}
                        {l.replan_count > 0 && <Badge tone="replan">{l.replan_count} replan</Badge>}
                        {!l.fallback_count && !l.replan_count && <span className="text-xs text-faint">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {l.success ? <span className="flex items-center gap-1 text-xs font-medium text-ok"><CircleCheck size={13} />Success</span>
                        : <span className="flex items-center gap-1 text-xs font-medium text-warn"><TriangleAlert size={13} />{l.error ? 'Error' : 'Partial'}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{l.created_at ? timeAgo(l.created_at) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function CompareBar({ label, sub, value, cls }: { label: string; sub: string; value: number | null; cls: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-ink-2">{label}</span>
        <span className="tabular font-semibold text-ink">{pct(value)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div className={cn('h-full rounded-full', cls)} initial={{ width: 0 }} animate={{ width: `${(value ?? 0) * 100}%` }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <div className="mt-1 text-[11px] text-muted">{sub}</div>
    </div>
  )
}
