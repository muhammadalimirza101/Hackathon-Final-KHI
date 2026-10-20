import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { KpiTile } from '../components/KpiTile'
import { Button, Card, CardHeader, INTENT_LABEL, Spinner, cn, ms, pct, usePoll } from '../lib/ui'
import type { EvalDataset, EvalResult } from '../types'

const DATASETS: { id: EvalDataset; title: string; desc: string }[] = [
  { id: 'realistic', title: 'Realistic single-task', desc: '32 hand-written queries across all 12 intents. Planner accuracy + latency overhead vs. direct agent calls (10 samples).' },
  { id: 'original', title: 'Original dataset', desc: '200 given queries (synthetic text). Planner intent vs. label. ~200 LLM calls, 5 at a time.' },
  { id: 'compound', title: 'Compound tasks', desc: '10 multi-step queries with attachments run through the full pipeline. Success = all steps OK and the right sequence.' },
]

function Routing({ r }: { r: EvalResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Routing accuracy" tone="accent" value={pct(r.routing_accuracy, 1)} hint={`baseline ${pct(r.baseline_routing_accuracy)}`} />
        <KpiTile label="Agent accuracy" tone="ok" value={pct(r.agent_accuracy, 1)} hint="best available agent chosen" />
        {r.avg_overhead_ms !== undefined && <KpiTile label="Overhead vs direct" value={ms(r.avg_overhead_ms)} hint={`direct ${ms(r.avg_direct_ms)} → orchestrated ${ms(r.avg_orchestrated_ms)}`} />}
        <KpiTile label="Queries" value={r.n} hint={`${r.duration_s}s · ${r.model}`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line text-muted">
            <tr><th className="px-3 py-2 font-medium">Intent</th><th className="px-3 py-2 font-medium">Correct</th><th className="px-3 py-2 font-medium">Accuracy</th></tr>
          </thead>
          <tbody>
            {Object.entries(r.per_intent ?? {}).map(([k, v]) => (
              <tr key={k} className="border-b border-line/60">
                <td className="px-3 py-2 text-slate-200">{INTENT_LABEL[k] ?? k}</td>
                <td className="px-3 py-2 tabular-nums">{v.correct}/{v.total}</td>
                <td className={cn('px-3 py-2 tabular-nums', v.accuracy >= 0.9 ? 'text-ok' : v.accuracy >= 0.7 ? 'text-warn' : 'text-bad')}>{pct(v.accuracy, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!r.mistakes?.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Misclassified ({r.mistakes.length})</summary>
          <ul className="mt-2 space-y-1">
            {r.mistakes.map((x, i) => (
              <li key={i} className="text-slate-300">“{x.query}” — expected <b>{x.intent}</b>, got <b className="text-warn">{x.predicted}</b></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function Compound({ r }: { r: EvalResult }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiTile label="Compound completion" tone="ok" value={pct(r.compound_completion)} hint="all steps OK + right sequence" />
        <KpiTile label="All steps succeeded" value={pct(r.steps_completed_rate)} />
        <KpiTile label="Sequence match" value={pct(r.sequence_match_rate)} />
        <KpiTile label="Avg latency" value={ms(r.avg_latency_ms)} hint={`${r.duration_s}s total`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line text-muted">
            <tr><th className="px-3 py-2 font-medium">Query</th><th className="px-3 py-2 font-medium">Expected</th><th className="px-3 py-2 font-medium">Planned</th><th className="px-3 py-2 font-medium">Latency</th><th className="px-3 py-2 font-medium">Result</th></tr>
          </thead>
          <tbody>
            {r.results?.map((x, i) => (
              <tr key={i} className="border-b border-line/60 align-top">
                <td className="max-w-xs px-3 py-2 text-slate-200">{x.query}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{x.expected.join(' › ')}</td>
                <td className={cn('px-3 py-2 font-mono text-[11px]', !x.sequence_match && 'text-warn')}>{x.planned?.join(' › ') ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums">{ms(x.latency_ms)}</td>
                <td className="px-3 py-2"><span className={x.success ? 'text-ok' : 'text-bad'}>{x.success ? 'pass' : 'fail'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Evaluation</h1>
        <p className="mt-1 text-sm text-muted">Measures the three PS-05 criteria: routing accuracy, compound task completion and latency overhead. Every run uses real LLM calls (credits are limited, so run sparingly).</p>
      </header>
      {error && <Card className="border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</Card>}
      {DATASETS.map((d) => {
        const r = latest?.[d.id]
        return (
          <Card key={d.id}>
            <CardHeader title={d.title} subtitle={d.desc}
              right={
                <Button variant="outline" onClick={() => run(d.id)} disabled={running !== null}>
                  {running === d.id ? <Spinner /> : <FlaskConical size={15} />} {running === d.id ? 'Running…' : 'Run'}
                </Button>
              } />
            <div className="p-4">
              {r ? (
                <>
                  <div className="mb-3 text-xs text-muted">Last run {new Date(r.created_at).toLocaleString()}</div>
                  {d.id === 'compound' ? <Compound r={r} /> : <Routing r={r} />}
                </>
              ) : (
                <div className="text-sm text-muted">{running === d.id ? 'Running… this can take 1–3 minutes.' : 'Not run yet.'}</div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
