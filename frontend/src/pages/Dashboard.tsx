import { Activity, AlertTriangle, Gauge, GitBranch, Layers, Target, Timer, Zap } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../api/client'
import { KpiTile } from '../components/KpiTile'
import { Card, CardHeader, INTENT_LABEL, Pill, cn, ms, pct, usePoll } from '../lib/ui'

const AXIS = { fontSize: 11, fill: '#8b98ad' }
const tooltipStyle = { background: '#111827', border: '1px solid #243047', borderRadius: 8, fontSize: 12, color: '#e5e7eb' }

function BarPanel({ title, subtitle, data, dataKey, format, color = '#22d3ee', height = 260 }: {
  title: string; subtitle?: string; data: Record<string, unknown>[]; dataKey: string
  format: (v: number) => string; color?: string; height?: number
}) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <div className="p-3" style={{ height }}>
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">No data yet. Run some queries.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }} barCategoryGap={4}>
              <CartesianGrid horizontal={false} stroke="#1f2a3d" />
              <XAxis type="number" tick={AXIS} tickFormatter={format} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={AXIS} width={120} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: '#ffffff08' }} contentStyle={tooltipStyle} formatter={(v) => [format(Number(v)), title]} />
              <Bar dataKey={dataKey} fill={color} radius={[0, 4, 4, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

export default function Dashboard() {
  const { data: m, error } = usePoll(api.metrics, 8000)
  const { data: logs } = usePoll(() => api.logs(25), 8000)

  const called = (m?.per_agent ?? []).filter((a) => a.calls > 0)
  const latency = called.map((a) => ({ name: a.agent, value: a.avg_latency_ms ?? 0 })).sort((a, b) => b.value - a.value)
  const success = called.map((a) => ({ name: a.agent, value: a.success_rate ?? 0 })).sort((a, b) => b.value - a.value)
  const intents = Object.entries(m?.intent_distribution ?? {}).map(([k, v]) => ({ name: INTENT_LABEL[k] ?? k, value: v }))
  const now = m?.routing_accuracy

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-white">Observability Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Live metrics from every request · refreshes every 8 s · storage: {m?.storage ?? '—'}</p>
        </div>
      </header>
      {error && <Card className="border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</Card>}

      <Card className="flex flex-wrap items-center gap-6 border-accent/30 bg-gradient-to-r from-accent/10 to-transparent p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Routing accuracy</div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-semibold text-slate-400 line-through decoration-bad/60">{pct(m?.baseline_routing_accuracy)}</span>
            <span className="text-muted">→</span>
            <span className="text-4xl font-bold text-accent">{now != null ? pct(now, 1) : '—'}</span>
          </div>
        </div>
        <p className="max-w-xl text-sm text-muted">
          Before: in the dataset's historical logs only 18 of 200 requests reached the right agent.
          Now: the planner's intent accuracy on our evaluation set{now == null && ' (run an evaluation to fill this in)'}.
          {m?.routing_accuracy_original != null && <> On the 200 original queries: <b className="text-white">{pct(m.routing_accuracy_original, 1)}</b>.</>}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Requests" value={m?.total_requests ?? '—'} hint={`success ${pct(m?.success_rate)}`} icon={<Activity size={14} />} />
        <KpiTile label="Compound completion" tone="ok" value={pct(m?.compound_completion ?? m?.live_compound_completion)}
          hint={m?.compound_completion != null ? 'evaluation set' : 'live multi-step requests'} icon={<Layers size={14} />} />
        <KpiTile label="p50 / p95 latency" value={<>{ms(m?.p50_latency_ms)} <span className="text-base text-muted">/ {ms(m?.p95_latency_ms)}</span></>} icon={<Timer size={14} />} />
        <KpiTile label="Router overhead" tone="accent" value={ms(m?.avg_router_overhead_ms)} hint={m?.eval_overhead_ms != null ? `vs direct call: +${ms(m.eval_overhead_ms)}` : 'planner + routing'} icon={<Zap size={14} />} />
        <KpiTile label="Fallback rate" tone="warn" value={pct(m?.fallback_rate)} hint="requests with ≥1 reroute" icon={<AlertTriangle size={14} />} />
        <KpiTile label="Replans" tone="replan" value={m?.replan_count ?? '—'} hint={`recovery ${pct(m?.replan_recovery_rate)}`} icon={<GitBranch size={14} />} />
        <KpiTile label="Healthy agents" tone="ok" value={m ? `${m.agents_healthy}/${m.agents_total}` : '—'} icon={<Gauge size={14} />} />
        <KpiTile label="Routing accuracy" tone="accent" value={pct(m?.routing_accuracy, 1)} hint="latest evaluation" icon={<Target size={14} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BarPanel title="Avg latency per agent" subtitle="Live calls" data={latency} dataKey="value" format={ms} />
        <BarPanel title="Success rate per agent" subtitle="Live calls (out-of-scope and timeouts count as failures)" data={success} dataKey="value" format={(v) => pct(v)} color="#34d399" />
        <BarPanel title="Intent distribution" subtitle="Planned steps per intent" data={intents} dataKey="value" format={(v) => String(Math.round(v))} color="#818cf8" />
      </div>

      <Card>
        <CardHeader title="Recent routing decisions" subtitle="Newest first" />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Query</th>
                <th className="px-4 py-2 font-medium">Steps → agent</th>
                <th className="px-4 py-2 font-medium">Latency</th>
                <th className="px-4 py-2 font-medium">Overhead</th>
                <th className="px-4 py-2 font-medium">Reroutes</th>
                <th className="px-4 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((l) => (
                <tr key={l.request_id} className="border-b border-line/60 align-top">
                  <td className="max-w-xs px-4 py-2.5 text-slate-200"><div className="line-clamp-2">{l.query}</div></td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1">
                      {l.unsupported && <span className="text-muted">declined (unsupported)</span>}
                      {l.steps.map((s) => (
                        <span key={s.step_id} className="whitespace-nowrap">
                          <Pill>{INTENT_LABEL[s.intent] ?? s.intent}</Pill>{' '}
                          <span className={cn(s.final_agent ? 'text-white' : 'text-bad')}>{s.final_agent ?? 'failed'}</span>
                          {s.chosen && s.final_agent && s.chosen !== s.final_agent && <span className="text-warn"> (from {s.chosen})</span>}
                          {s.replanned && <span className="text-replan"> · replanned</span>}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{ms(l.total_latency_ms)}</td>
                  <td className="px-4 py-2.5 tabular-nums">{ms(l.router_overhead_ms)}</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {l.fallback_count > 0 ? <span className="text-warn">{l.fallback_count} fallback</span> : '—'}
                    {l.replan_count > 0 && <span className="text-replan"> · {l.replan_count} replan</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={cn('rounded-full px-2 py-0.5', l.success ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>{l.success ? 'success' : l.error ? 'error' : 'partial'}</span>
                  </td>
                </tr>
              ))}
              {logs?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted">No requests yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
