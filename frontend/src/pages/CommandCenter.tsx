import { ArrowUp, Clock, Download, FileCode, FileSpreadsheet, FileText, GitBranch, History, Layers, Paperclip, Plus, Square, TriangleAlert, Workflow, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import { useSearchParams } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import { api, streamChat } from '../api/client'
import { PipelineGraph } from '../components/PipelineGraph'
import { TraceTimeline } from '../components/TraceTimeline'
import { AgentIcon } from '../lib/agents'
import { PLAYBOOKS, type Playbook } from '../lib/playbooks'
import type { Theme } from '../lib/theme'
import { Badge, Button, Card, CardHeader, EmptyState, Kbd, PageHeader, Spinner, cn, fadeUp, ms, stagger, timeAgo, usePoll } from '../lib/ui'
import type { Agent, TraceEvent } from '../types'

const MAX_ATTACHMENT = 200_000

function fileIcon(name: string) {
  if (/\.(csv|xlsx?)$/i.test(name)) return <FileSpreadsheet size={14} />
  if (/\.(py|js|ts|java|sql|go|rb|php|cs|cpp|c|html|ya?ml|json)$/i.test(name)) return <FileCode size={14} />
  return <FileText size={14} />
}

export default function CommandCenter({ onFinished, agents, theme }: { onFinished?: () => void; agents: Agent[] | null; theme: Theme }) {
  const [query, setQuery] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const [lastQuery, setLastQuery] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [params, setParams] = useSearchParams()
  const { data: recent, refresh: refreshRecent } = usePoll(() => api.logs(6), 15000)

  const done = events.find((e) => e.type === 'done') as Extract<TraceEvent, { type: 'done' }> | undefined
  const plan = events.find((e) => e.type === 'plan') as Extract<TraceEvent, { type: 'plan' }> | undefined
  const results = events.filter((e) => e.type === 'step_result') as Extract<TraceEvent, { type: 'step_result' }>[]
  const fallbacks = events.filter((e) => e.type === 'fallback').length
  const replans = events.filter((e) => e.type === 'replan').length
  const engaged = [...new Set(results.filter((r) => r.ok && r.agent).map((r) => r.agent!))]
  const hasRun = events.length > 0 || running

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [running])

  // Playbooks launched from the command palette arrive as ?playbook=<id>
  useEffect(() => {
    const id = params.get('playbook')
    if (!id) return
    const pb = PLAYBOOKS.find((p) => p.id === id)
    if (pb) loadPlaybook(pb)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function loadPlaybook(pb: Playbook) {
    setQuery(pb.query)
    setError(null)
    if (pb.sample) {
      try { setAttachment({ name: pb.sample, text: await api.sample(pb.sample) }) } catch (e) { setError(String(e)) }
    } else setAttachment(null)
    inputRef.current?.focus()
  }

  async function run() {
    const q = query.trim()
    if (!q || running) return
    setEvents([])
    setError(null)
    setRunning(true)
    setLastQuery(q)
    setStartedAt(Date.now())
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamChat({ query: q, attachment_text: attachment?.text, attachment_name: attachment?.name },
        (ev) => setEvents((prev) => [...prev, ev]), ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      setNow(Date.now())
      onFinished?.()
      refreshRecent()
    }
  }

  function reset() {
    setEvents([]); setQuery(''); setAttachment(null); setError(null); setStartedAt(null)
    inputRef.current?.focus()
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    const text = await f.text()
    if (text.length > MAX_ATTACHMENT) {
      setError(`${f.name} is ${Math.round(text.length / 1000)} KB. The limit is ${MAX_ATTACHMENT / 1000} KB of text.`)
      return
    }
    setAttachment({ name: f.name, text })
  }

  const healthy = agents?.filter((a) => a.status === 'active').length
  const elapsed = done ? done.total_latency_ms : startedAt ? now - startedAt : 0

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Operate" title="Command Center"
        description="Describe the work in plain language. The planner decomposes it, the router assigns the best available agent to every step, and failures are rerouted automatically."
        actions={hasRun && !running ? <Button onClick={reset}><Plus size={15} /> New request</Button> : undefined} />

      {/* ---------- composer ---------- */}
      <Card className="relative overflow-hidden">
        {running && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-accent-soft"><div className="progress-bar h-full w-2/5 bg-accent" /></div>}
        <textarea ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run() }}
          placeholder="e.g. Clean this sales export, find the top products and write a report for leadership"
          rows={3} disabled={running}
          className="block w-full resize-none bg-transparent px-5 pb-2 pt-4 text-[15px] leading-relaxed text-ink outline-none placeholder:text-faint disabled:opacity-70" />
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/60 px-3 py-2.5">
          <input ref={fileRef} type="file" className="hidden"
            accept=".csv,.txt,.md,.json,.py,.js,.ts,.java,.sql,.go,.rb,.php,.cs,.cpp,.c,.html,.yaml,.yml"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={running}><Paperclip size={14} /> Attach file</Button>
          <AnimatePresence>
            {attachment && (
              <motion.span initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2 pr-1 text-xs text-ink-2 shadow-card-sm">
                <span className="text-accent">{fileIcon(attachment.name)}</span>
                <span className="font-medium">{attachment.name}</span>
                <span className="text-muted">{(attachment.text.length / 1024).toFixed(1)} KB</span>
                <button onClick={() => setAttachment(null)} disabled={running} className="rounded p-0.5 text-muted hover:bg-surface-3 hover:text-ink"><X size={12} /></button>
              </motion.span>
            )}
          </AnimatePresence>
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted sm:flex">
            {healthy != null && <>{healthy} of {agents!.length} agents operational ·</>}
            <Kbd>Ctrl</Kbd><Kbd>↵</Kbd>
          </span>
          {running
            ? <Button variant="secondary" onClick={() => abortRef.current?.abort()}><Square size={13} /> Stop</Button>
            : <Button variant="primary" onClick={run} disabled={!query.trim()}><ArrowUp size={15} /> Run request</Button>}
        </div>
      </Card>

      {error && <Card className="border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">{error}</Card>}

      <AnimatePresence mode="wait">
        {!hasRun ? (
          <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-6 xl:grid-cols-[1fr_340px]">
            {/* ---------- playbooks ---------- */}
            <div>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-ink">Playbooks</h2>
                  <p className="text-xs text-muted">Common requests across departments. Sample files are attached automatically.</p>
                </div>
              </div>
              <motion.div variants={stagger(0.04)} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2">
                {PLAYBOOKS.map((pb) => (
                  <motion.button key={pb.id} variants={fadeUp} whileHover={{ y: -2 }} onClick={() => loadPlaybook(pb)}
                    className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left shadow-card-sm transition-colors hover:border-accent/40 hover:shadow-card">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors group-hover:border-accent/30 group-hover:bg-accent-soft group-hover:text-accent">
                        <pb.icon size={17} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink">{pb.title}</div>
                        <div className="text-[11.5px] text-muted">{pb.department}</div>
                      </div>
                    </div>
                    <p className="mt-2.5 text-xs leading-relaxed text-ink-2">{pb.description}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Badge tone="accent">{pb.showcases}</Badge>
                      {pb.sample && <span className="flex items-center gap-1 text-[11px] text-muted">{fileIcon(pb.sample)}{pb.sample}</span>}
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            </div>
            {/* ---------- recent activity ---------- */}
            <div>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
                <p className="text-xs text-muted">Latest requests across the organization</p>
              </div>
              <Card>
                {!recent?.length ? (
                  <EmptyState icon={<History size={18} />} title="No requests yet">Run a playbook to see routing decisions here.</EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {recent.map((r) => (
                      <li key={r.request_id} className="px-4 py-3">
                        <div className="flex items-start gap-2">
                          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', r.success ? 'bg-ok' : 'bg-warn')} />
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-[12.5px] text-ink">{r.query}</div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {r.agents.filter(Boolean).map((a, i) => <AgentIcon key={i} name={a!} size="sm" />)}
                              <span className="ml-auto text-[11px] text-muted">{ms(r.total_latency_ms)} · {r.created_at ? timeAgo(r.created_at) : ''}</span>
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div key="run" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* ---------- run summary ---------- */}
            <Card className="grid grid-cols-2 divide-line sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
              <Metric label="Status">
                {running ? <span className="flex items-center gap-2 text-accent"><Spinner /> Running</span>
                  : done ? <span className={done.success ? 'text-ok' : 'text-warn'}>{done.success ? 'Completed' : 'Partial'}</span>
                  : <span className="text-bad">Stopped</span>}
              </Metric>
              <Metric label="Elapsed" icon={<Clock size={13} />}><span className="tabular">{ms(elapsed)}</span></Metric>
              <Metric label="Steps" icon={<Layers size={13} />}><span className="tabular">{results.filter((r) => r.ok).length}<span className="text-muted">/{plan?.steps.length ?? '–'}</span></span></Metric>
              <Metric label="Agents engaged" icon={<Workflow size={13} />}>
                <span className="flex items-center gap-1">{engaged.length ? engaged.map((a) => <AgentIcon key={a} name={a} size="sm" />) : <span className="text-muted">–</span>}</span>
              </Metric>
              <Metric label="Reroutes" icon={<TriangleAlert size={13} />}>
                <span className="flex items-center gap-2 tabular"><span className={fallbacks ? 'text-warn' : ''}>{fallbacks}</span>
                  {replans > 0 && <Badge tone="replan"><GitBranch size={11} />{replans} replan</Badge>}</span>
              </Metric>
              <Metric label="Router overhead" icon={<Zap size={13} />}><span className="tabular">{done ? ms(done.router_overhead_ms) : plan?.planner_ms != null ? ms(plan.planner_ms) : '–'}</span></Metric>
            </Card>

            <Card>
              <CardHeader icon={<Workflow size={15} />} title="Execution pipeline" subtitle={lastQuery}
                right={<div className="hidden gap-3 text-[11px] text-muted md:flex">
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-serious-soft ring-1 ring-serious/40" />skipped</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-warn-soft ring-1 ring-warn/40" />rerouted</span>
                  <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-replan-soft ring-1 ring-replan/40" />replanned</span>
                </div>} />
              <div className="p-2">
                {plan ? <PipelineGraph events={events} running={running} theme={theme} />
                  : <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted"><Spinner /> Planner is analyzing the request…</div>}
              </div>
            </Card>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
              <Card>
                <CardHeader icon={<History size={15} />} title="Decision trace" subtitle="Every planning, routing, fallback and replanning decision, as it happened" />
                <div className="p-5"><TraceTimeline events={events} /></div>
              </Card>
              <div className="xl:sticky xl:top-20">
                <Card className={cn(done && (done.success ? 'border-ok/30' : 'border-warn/40'))}>
                  <CardHeader icon={<FileText size={15} />} title={done ? (done.success ? 'Final answer' : 'Partial answer') : 'Final answer'}
                    subtitle={done ? `${ms(done.total_latency_ms)} end to end · ${ms(done.router_overhead_ms)} orchestration overhead` : 'Appears when every step has finished'}
                    right={done?.artifact_id && (
                      <a href={api.artifactDownloadUrl(done.artifact_id)}
                        className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-xs font-medium text-white shadow-card-sm hover:bg-accent-hover">
                        <Download size={13} /> Download report
                      </a>
                    )} />
                  {done ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="prose prose-sm max-w-none px-5 py-4 text-ink-2 dark:prose-invert prose-headings:text-ink prose-strong:text-ink prose-table:text-xs prose-h1:text-lg prose-h2:text-base">
                      <Markdown remarkPlugins={[remarkGfm]}>{done.final_output || '_No output_'}</Markdown>
                    </motion.div>
                  ) : (
                    <div className="space-y-2.5 px-5 py-5">
                      {[90, 75, 82, 60].map((w, i) => <div key={i} className="skeleton h-3 rounded" style={{ width: `${w}%` }} />)}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Metric({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{icon}{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-ink">{children}</div>
    </div>
  )
}
