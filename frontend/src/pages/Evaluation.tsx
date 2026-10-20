import { CircleCheck, CircleX, Database, FlaskConical, Layers, ListChecks, Play, Timer } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { KpiTile } from '../components/KpiTile'
import { Badge, Button, Card, CardHeader, INTENT_LABEL, PageHeader, Spinner, cn, ms, pct, stagger, timeAgo, usePoll } from '../lib/ui'
import type { EvalDataset, EvalResult } from '../types'

const DATASETS: { id: EvalDataset; title: string; icon: ReactNode; desc: string; criterion: string; cost: string }[] = [
  { id: 'realistic', title: 'Realistic single-task queries', icon: <ListChecks size={15} />, criterion: 'Routing accuracy · latency overhead',
    desc: '32 hand-written business requests across all 12 intents, plus 10 direct-vs-orchestrated latency comparisons.', cost: '~50 LLM calls · 3–4 min' },
  { id: 'original', title: 'Original dataset (200 queries)', icon: <Database size={15} />, criterion: 'Routing accuracy',
    desc: 'The 200 provided queries and labels. Query text is synthetic, so this mainly checks label agreement at scale.', cost: '200 LLM calls · ~1 min' },
  { id: 'compound', title: 'Compound multi-step tasks', icon: <Layers size={15} />, criterion: 'Task completion rate',
    desc: '10 multi-step requests with real attachments through the full pipeline. Pass = every step succeeds in the expected order.', cost: '~25 LLM calls · ~2 min' },
]

function Routing({ r }: { r: EvalResult }) {
  const per = Object.entries(r.per_intent ?? {})
  return (
    <div className="space-y-5">
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Routing accuracy" value={r.routing_accuracy} format={(v) => `${(v * 100).toFixed(1)}%`} tone="accent" hint={`baseline ${pct(r.baseline_routing_accuracy)}`} />
        <KpiTile label="Agent accuracy" value={r.agent_accuracy} format={(v) => `${(v * 100).toFixed(1)}%`} tone="ok" hint="best available agent chosen" />
        {r.avg_overhead_ms != null
          ? <KpiTile label="Overhead vs direct" value={r.avg_overhead_ms} format={(v) => `+${ms(v)}`} hint={`${ms(r.avg_direct_ms)} direct → ${ms(r.avg_orchestrated_ms)} orchestrated`} />
          : <KpiTile label="Errors" value={(r.mistakes ?? []).filter((m) => m.predicted.startsWith('error')).length} hint="planner failures" />}
        <KpiTile label="Queries" value={r.n} hint={`${r.duration_s}s · ${r.model}`} />
      </motion.div>
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Accuracy by intent</div>
        <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
          {per.map(([k, v], i) => (
            <div key={k} className="grid grid-cols-[130px_1fr_70px] items-center gap-3 text-xs">
              <span className="truncate text-ink-2">{INTENT_LABEL[k] ?? k}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <motion.div className={cn('h-full rounded-full', v.accuracy >= 0.9 ? 'bg-ok' : v.accuracy >= 0.7 ? 'bg-warn' : 'bg-bad')}
                  initial={{ width: 0 }} animate={{ width: `${v.accuracy * 100}%` }} transition={{ duration: 0.7, delay: i * 0.03 }} />
              </div>
              <span className="text-right tabular text-muted"><b className="font-medium text-ink">{pct(v.accuracy)}</b> · {v.correct}/{v.total}</span>
            </div>
          ))}
        </div>
      </div>
      {!!r.mistakes?.length && (
        <details className="group rounded-lg border border-line bg-surface-2 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-ink-2">Misclassified queries ({r.mistakes.length})</summary>
          <ul className="divide-y divide-line border-t border-line">
            {r.mistakes.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 text-ink-2">{x.query}</span>
                <Badge>{INTENT_LABEL[x.intent] ?? x.intent}</Badge><span className="text-faint">→</span><Badge tone="warn">{INTENT_LABEL[x.predicted] ?? x.predicted}</Badge>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Compound({ r }: { r: EvalResult }) {
  return (
    <div className="space-y-5">
      <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Completion rate" value={r.compound_completion} format={(v) => `${(v * 100).toFixed(0)}%`} tone="ok" hint="all steps OK, right order" />
        <KpiTile label="Steps succeeded" value={r.steps_completed_rate} format={(v) => `${(v * 100).toFixed(0)}%`} />
        <KpiTile label="Plan sequence match" value={r.sequence_match_rate} format={(v) => `${(v * 100).toFixed(0)}%`} />
        <KpiTile label="Avg latency" value={r.avg_latency_ms} format={ms} hint={`${r.duration_s}s total`} />
      </motion.div>
      <div className="overflow-hidden rounded-lg border border-line">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-surface-2 text-[10.5px] uppercase tracking-[0.05em] text-muted">
            <tr>{['Request', 'Expected plan', 'Actual plan', 'Latency', 'Result'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.results?.map((x, i) => (
              <tr key={i} className="align-top">
                <td className="max-w-xs px-3 py-2.5 text-ink">{x.query}</td>
                <td className="px-3 py-2.5"><Seq items={x.expected} /></td>
                <td className="px-3 py-2.5">{x.planned ? <Seq items={x.planned} warn={!x.sequence_match} /> : <span className="text-bad">no plan</span>}</td>
                <td className="px-3 py-2.5 tabular text-ink-2">{ms(x.latency_ms)}</td>
                <td className="px-3 py-2.5">{x.success ? <span className="flex items-center gap-1 font-medium text-ok"><CircleCheck size={13} />Pass</span> : <span className="flex items-center gap-1 font-medium text-bad"><CircleX size={13} />Fail</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Seq({ items, warn }: { items: string[]; warn?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-faint">›</span>}
          <span className={cn('rounded px-1.5 py-0.5 text-[10.5px]', warn ? 'bg-warn-soft text-warn' : 'bg-surface-3 text-ink-2')}>{INTENT_LABEL[s] ?? s}</span>
        </span>
      ))}
    </div>
  )
}

export default function Evaluation() {
  const { data: latest, setData } = usePoll(api.latestEval, 30000)
  const [running, setRunning] = useState<EvalDataset | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(ds: EvalDataset) {
    setRunning(ds)
    setError(null)
    try {
      const r = await api.runEval(ds)
      setData((prev) => ({ ...(prev ?? {}), [ds]: r }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setRunning(null) }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Insights" title="Evaluation"
        description="Benchmarks for the three PS-05 criteria: routing accuracy, compound task completion and latency overhead. Every run makes real model calls and is stored in Firestore." />
      {error && <Card className="border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</Card>}
      {DATASETS.map((d) => {
        const r = latest?.[d.id]
        const isRunning = running === d.id
        return (
          <Card key={d.id} className="overflow-hidden">
            {isRunning && <div className="h-0.5 overflow-hidden bg-accent-soft"><div className="progress-bar h-full w-2/5 bg-accent" /></div>}
            <CardHeader icon={d.icon} title={<span className="flex items-center gap-2">{d.title}<Badge tone="accent">{d.criterion}</Badge></span>}
              subtitle={<>{d.desc} <span className="text-faint">· {d.cost}</span></>}
              right={<Button variant={r ? 'secondary' : 'primary'} onClick={() => run(d.id)} disabled={running !== null}>
                {isRunning ? <Spinner /> : <Play size={14} />} {isRunning ? 'Running…' : r ? 'Re-run' : 'Run benchmark'}</Button>} />
            <div className="p-5">
              {r ? (
                <>
                  <div className="mb-4 flex items-center gap-2 text-[11px] text-muted"><Timer size={12} />Last run {timeAgo(r.created_at)} · run <span className="font-mono">{r.run_id}</span></div>
                  {d.id === 'compound' ? <Compound r={r} /> : <Routing r={r} />}
                </>
              ) : (
                <div className="flex items-center gap-3 text-sm text-muted">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2"><FlaskConical size={16} /></span>
                  {isRunning ? 'Benchmark running. Results appear here when it finishes.' : 'No results yet for this benchmark.'}
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
