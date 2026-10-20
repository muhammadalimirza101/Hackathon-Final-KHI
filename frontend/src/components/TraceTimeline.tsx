import { ArrowRight, CircleAlert, CircleCheck, CircleX, GitBranch, ListTree, Play, Route, TriangleAlert } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TraceEvent } from '../types'
import { AgentIcon } from '../lib/agents'
import { Badge, INTENT_LABEL, Mono, cn, ms } from '../lib/ui'
import { ScoreBreakdown } from './ScoreBreakdown'

type Tone = 'accent' | 'info' | 'neutral' | 'warn' | 'replan' | 'ok' | 'bad'
const TONE: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent border-accent/20',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  neutral: 'bg-surface-2 text-muted border-line',
  warn: 'bg-warn-soft text-warn border-warn/25',
  replan: 'bg-replan-soft text-replan border-replan/25',
  ok: 'bg-ok-soft text-ok border-ok/25',
  bad: 'bg-bad-soft text-bad border-bad/25',
}

function Row({ icon, tone, title, meta, children }: { icon: ReactNode; tone: Tone; title: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <motion.li initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="relative pl-10">
      <span className={cn('absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-lg border', TONE[tone])}>{icon}</span>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
        {title}
        {meta && <span className="ml-auto text-[11px] text-muted">{meta}</span>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </motion.li>
  )
}

function StepTag({ id }: { id: string }) {
  return <span className="rounded border border-line bg-surface-2 px-1.5 font-mono text-[10.5px] text-muted">{id}</span>
}

export function OutputBlock({ text, collapsedHeight = 168 }: { text: string; collapsedHeight?: number }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 500
  return (
    <div className="relative rounded-lg border border-line bg-surface-2">
      <div className={cn('prose prose-sm max-w-none px-4 py-3 text-ink-2 dark:prose-invert prose-headings:text-ink prose-strong:text-ink prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5',
        !open && long && 'overflow-hidden')} style={!open && long ? { maxHeight: collapsedHeight } : undefined}>
        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
      </div>
      {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-8 h-12 bg-gradient-to-t from-surface-2 to-transparent" />}
      {long && (
        <button onClick={() => setOpen(!open)} className="w-full border-t border-line py-1.5 text-[11.5px] font-medium text-accent hover:bg-surface-3">
          {open ? 'Collapse' : 'Show full output'}
        </button>
      )}
    </div>
  )
}

const ic = 14

export function TraceTimeline({ events }: { events: TraceEvent[] }) {
  if (!events.length) return null
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-3 before:left-[13.5px] before:top-3 before:w-px before:bg-line">
      {events.map((ev, i) => {
        switch (ev.type) {
          case 'plan':
            return (
              <Row key={i} icon={<ListTree size={ic} />} tone="accent"
                title={<><b className="font-semibold text-ink">Plan created</b><span className="text-muted">· {ev.steps.length} step{ev.steps.length > 1 ? 's' : ''}</span></>}
                meta={ev.planner_ms != null && <>Planner · {ms(ev.planner_ms)}</>}>
                <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {ev.steps.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 bg-surface px-3 py-2 text-xs">
                      <StepTag id={s.id} />
                      <Badge tone="accent">{INTENT_LABEL[s.intent] ?? s.intent}</Badge>
                      <span className="min-w-0 flex-1 text-ink-2">{s.task}</span>
                      {s.depends_on.length > 0 && <Mono>uses {s.depends_on.join(', ')}</Mono>}
                    </div>
                  ))}
                </div>
              </Row>
            )
          case 'routing':
            return (
              <Row key={i} icon={<Route size={ic} />} tone="info"
                title={<><StepTag id={ev.step_id} /><span>Routed <b className="font-medium text-ink">{INTENT_LABEL[ev.intent] ?? ev.intent}</b></span>
                  <ArrowRight size={13} className="text-faint" />
                  {ev.chosen ? <span className="flex items-center gap-1.5 font-semibold text-ink"><AgentIcon name={ev.chosen} size="sm" />{ev.chosen}</span> : <span className="text-bad">no available agent</span>}</>}
                meta="router · <5ms">
                <div className="rounded-lg border border-line bg-surface px-4 py-3">
                  <ScoreBreakdown ranked={ev.ranked} excluded={ev.excluded} chosen={ev.chosen} />
                </div>
              </Row>
            )
          case 'attempt':
            return (
              <Row key={i} icon={<Play size={ic} />} tone="neutral"
                title={<><StepTag id={ev.step_id} /><span>Dispatched to <b className="font-medium text-ink">{ev.agent}</b></span>{ev.attempt > 1 && <Badge tone="warn">attempt {ev.attempt}</Badge>}</>} />
            )
          case 'fallback':
            return (
              <Row key={i} icon={<TriangleAlert size={ic} />} tone="warn"
                title={<><StepTag id={ev.step_id} /><b className="font-semibold text-warn">Fallback</b>
                  <span className="text-ink-2">{ev.from}</span><ArrowRight size={13} className="text-warn" /><span className="font-medium text-ink">{ev.to ?? 'no agent left'}</span></>}>
                <div className="rounded-md border border-warn/20 bg-warn-soft px-3 py-1.5 text-xs text-warn">Reason: {ev.reason}</div>
              </Row>
            )
          case 'replan':
            return (
              <Row key={i} icon={<GitBranch size={ic} />} tone="replan"
                title={<><StepTag id={ev.step_id} /><b className="font-semibold text-replan">Replanning</b><span className="text-muted">{ev.reason}</span></>}>
                <div className="space-y-1 rounded-md border border-replan/20 bg-replan-soft px-3 py-2 text-xs">
                  {ev.new_steps.length === 0 && <div className="text-replan">No alternative plan{ev.error ? `: ${ev.error}` : ''}</div>}
                  {ev.new_steps.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 text-replan">
                      <StepTag id={s.id} /><b>{INTENT_LABEL[s.intent] ?? s.intent}</b><span className="text-ink-2">{s.task}</span>
                    </div>
                  ))}
                </div>
              </Row>
            )
          case 'step_result':
            return (
              <Row key={i} icon={ev.ok ? <CircleCheck size={ic} /> : <CircleX size={ic} />} tone={ev.ok ? 'ok' : 'bad'}
                title={<><StepTag id={ev.step_id} />{ev.ok ? <span>Completed by <b className="font-medium text-ink">{ev.agent}</b></span> : <b className="font-semibold text-bad">Step failed</b>}</>}
                meta={ms(ev.latency_ms)}>
                <OutputBlock text={ev.output} />
              </Row>
            )
          case 'done':
            return (
              <Row key={i} icon={<CircleCheck size={ic} />} tone={ev.success ? 'ok' : 'warn'}
                title={<b className={cn('font-semibold', ev.success ? 'text-ok' : 'text-warn')}>{ev.success ? 'Request completed' : 'Completed with partial result'}</b>}
                meta={<>{ms(ev.total_latency_ms)} total · {ms(ev.router_overhead_ms)} overhead</>} />
            )
          case 'error':
            return <Row key={i} icon={<CircleAlert size={ic} />} tone="bad" title={<span className="text-bad">Error: {ev.message}</span>} />
        }
      })}
    </ol>
  )
}
