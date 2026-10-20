import { AlertTriangle, CheckCircle2, GitBranch, ListTree, Play, RefreshCw, Route, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TraceEvent } from '../types'
import { INTENT_LABEL, Pill, cn, ms } from '../lib/ui'
import { ScoreBreakdown } from './ScoreBreakdown'

function Row({ icon, tone, title, children }: { icon: ReactNode; tone: string; title: ReactNode; children?: ReactNode }) {
  return (
    <li className="animate-in relative pl-9">
      <span className={cn('absolute left-0 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border', tone)}>{icon}</span>
      <div className="text-sm text-slate-200">{title}</div>
      {children && <div className="mt-2">{children}</div>}
    </li>
  )
}

function Output({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 400
  return (
    <div className="rounded-lg border border-line bg-bg/60 p-3">
      <div className={cn('prose prose-invert prose-sm max-w-none prose-pre:bg-panel-2', !open && long && 'max-h-40 overflow-hidden')}>
        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
      </div>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-accent hover:underline">
          {open ? 'Show less' : 'Show full output'}
        </button>
      )}
    </div>
  )
}

const iconCls = 'h-3.5 w-3.5'

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  if (!events.length) return null
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-line">
      {events.map((ev, i) => {
        switch (ev.type) {
          case 'plan':
            return (
              <Row key={i} icon={<ListTree className={iconCls} />} tone="border-accent/50 bg-accent/10 text-accent"
                title={<><b>Plan</b> · {ev.steps.length} step{ev.steps.length > 1 ? 's' : ''}{ev.planner_ms != null && <span className="text-muted"> · planner {ms(ev.planner_ms)}</span>}</>}>
                <div className="space-y-1.5">
                  {ev.steps.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <Pill>{s.id}</Pill>
                      <span className="font-medium text-white">{INTENT_LABEL[s.intent] ?? s.intent}</span>
                      <span className="text-muted">{s.task}</span>
                      {s.depends_on.length > 0 && <span className="text-muted">← uses {s.depends_on.join(', ')}</span>}
                    </div>
                  ))}
                </div>
              </Row>
            )
          case 'routing':
            return (
              <Row key={i} icon={<Route className={iconCls} />} tone="border-sky-400/50 bg-sky-400/10 text-sky-300"
                title={<><Pill>{ev.step_id}</Pill> Routed <b>{INTENT_LABEL[ev.intent] ?? ev.intent}</b> → <b className="text-accent">{ev.chosen ?? 'no available agent'}</b></>}>
                <div className="rounded-lg border border-line bg-bg/60 p-3">
                  <ScoreBreakdown ranked={ev.ranked} excluded={ev.excluded} chosen={ev.chosen} />
                </div>
              </Row>
            )
          case 'attempt':
            return (
              <Row key={i} icon={<Play className={iconCls} />} tone="border-line bg-panel-2 text-slate-300"
                title={<><Pill>{ev.step_id}</Pill> Calling <b>{ev.agent}</b>{ev.attempt > 1 && <span className="text-muted"> (attempt {ev.attempt})</span>}</>} />
            )
          case 'fallback':
            return (
              <Row key={i} icon={<AlertTriangle className={iconCls} />} tone="border-warn/50 bg-warn/10 text-warn"
                title={<span className="text-warn"><Pill>{ev.step_id}</Pill> Fallback: <b>{ev.from}</b> → <b>{ev.to ?? 'none left'}</b></span>}>
                <div className="text-xs text-warn/80">Reason: {ev.reason}</div>
              </Row>
            )
          case 'replan':
            return (
              <Row key={i} icon={<GitBranch className={iconCls} />} tone="border-replan/50 bg-replan/10 text-replan"
                title={<span className="text-replan"><Pill>{ev.step_id}</Pill> <b>Replanning</b> — {ev.reason}</span>}>
                <div className="space-y-1 text-xs">
                  {ev.new_steps.length === 0 && <div className="text-replan/80">No alternative plan{ev.error ? `: ${ev.error}` : ''}</div>}
                  {ev.new_steps.map((s) => (
                    <div key={s.id} className="flex flex-wrap gap-2 text-replan/90">
                      <Pill>{s.id}</Pill> <b>{INTENT_LABEL[s.intent] ?? s.intent}</b> <span className="text-muted">{s.task}</span>
                    </div>
                  ))}
                </div>
              </Row>
            )
          case 'step_result':
            return (
              <Row key={i}
                icon={ev.ok ? <CheckCircle2 className={iconCls} /> : <XCircle className={iconCls} />}
                tone={ev.ok ? 'border-ok/50 bg-ok/10 text-ok' : 'border-bad/50 bg-bad/10 text-bad'}
                title={<><Pill>{ev.step_id}</Pill> {ev.ok ? <>Completed by <b>{ev.agent}</b></> : <span className="text-bad">Step failed</span>} <span className="text-muted">· {ms(ev.latency_ms)}</span></>}>
                <Output text={ev.output} />
              </Row>
            )
          case 'done':
            return (
              <Row key={i} icon={<CheckCircle2 className={iconCls} />} tone={ev.success ? 'border-ok/50 bg-ok/10 text-ok' : 'border-warn/50 bg-warn/10 text-warn'}
                title={<><b>{ev.success ? 'Done' : 'Done with partial result'}</b> <span className="text-muted">· total {ms(ev.total_latency_ms)} · router overhead {ms(ev.router_overhead_ms)} · {ev.fallback_count} fallback(s) · {ev.replan_count} replan(s)</span></>} />
            )
          case 'error':
            return (
              <Row key={i} icon={<RefreshCw className={iconCls} />} tone="border-bad/50 bg-bad/10 text-bad" title={<span className="text-bad">Error: {ev.message}</span>} />
            )
        }
      })}
    </ol>
  )
}
