import { Download, FileText, Paperclip, Send, Square, X } from 'lucide-react'
import { useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, streamChat } from '../api/client'
import { PipelineGraph } from '../components/PipelineGraph'
import { TraceTimeline } from '../components/TraceTimeline'
import { Button, Card, CardHeader, Spinner, ms } from '../lib/ui'
import type { TraceEvent } from '../types'

const EXAMPLES = [
  'What is the leave policy for employees going for Hajj?',
  'Review this vendor contract for risky clauses.',
  'Clean this sales data, find the top products and write a report.',
  'Scan this code for hardcoded secrets and explain how to fix them.',
  'Summarize these meeting notes and translate the action items into Urdu.',
]

const MAX_ATTACHMENT = 200_000

export default function CommandCenter({ onFinished }: { onFinished?: () => void }) {
  const [query, setQuery] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null)
  const [events, setEvents] = useState<TraceEvent[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const done = events.find((e) => e.type === 'done') as Extract<TraceEvent, { type: 'done' }> | undefined

  async function run(q = query) {
    if (!q.trim() || running) return
    setEvents([])
    setError(null)
    setRunning(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      await streamChat(
        { query: q, attachment_text: attachment?.text, attachment_name: attachment?.name },
        (ev) => setEvents((prev) => [...prev, ev]),
        ctrl.signal,
      )
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
      onFinished?.()
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return
    const text = await f.text()
    if (text.length > MAX_ATTACHMENT) {
      setError(`File is too large (${Math.round(text.length / 1000)} KB). Limit is ${MAX_ATTACHMENT / 1000} KB of text.`)
      return
    }
    setAttachment({ name: f.name, text })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-white">Command Center</h1>
        <p className="mt-1 text-sm text-muted">Ask in plain language. The planner splits the request, the router picks the best healthy agent for each step, and failures are rerouted automatically.</p>
      </header>

      <Card className="p-4">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run() }}
          placeholder="e.g. Clean this sales data, find the top products and write a report"
          rows={3}
          className="w-full resize-none rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" className="hidden" accept=".csv,.txt,.md,.json,.py,.js,.ts,.java,.sql,.go,.rb,.php,.cs,.cpp,.c,.html,.yaml,.yml"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={running}>
            <Paperclip size={15} /> Attach CSV / code / text
          </Button>
          {attachment && (
            <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel-2 px-2.5 py-1.5 text-xs text-slate-200">
              <FileText size={13} /> {attachment.name} <span className="text-muted">({Math.round(attachment.text.length / 100) / 10} KB)</span>
              <button onClick={() => setAttachment(null)} className="text-muted hover:text-white"><X size={13} /></button>
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {running && <Button variant="ghost" onClick={() => abortRef.current?.abort()}><Square size={14} /> Stop</Button>}
            <Button onClick={() => run()} disabled={running || !query.trim()}>
              {running ? <Spinner /> : <Send size={15} />} {running ? 'Running…' : 'Run'}
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setQuery(ex)} disabled={running}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-muted transition hover:border-accent/60 hover:text-white">
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {error && <Card className="border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</Card>}

      {(events.length > 0 || running) && (
        <div className="grid gap-6 lg:grid-cols-[1fr]">
          {events.some((e) => e.type === 'plan') && (
            <Card>
              <CardHeader title="Pipeline" subtitle="Steps, the agent that handled each, skipped (orange), rerouted (amber) and replanned (purple)" />
              <div className="p-2"><PipelineGraph events={events} running={running} /></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Live trace" subtitle="Every planning, routing, fallback and replan decision as it happens"
              right={running ? <span className="flex items-center gap-2 text-xs text-accent"><Spinner className="h-3 w-3" /> streaming</span> : null} />
            <div className="p-5">
              <TraceTimeline events={events} />
              {running && events.length === 0 && <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-3 w-3" /> Planning…</div>}
            </div>
          </Card>

          {done && (
            <Card className={done.success ? 'border-ok/30' : 'border-warn/40'}>
              <CardHeader
                title={done.success ? 'Final answer' : 'Partial answer'}
                subtitle={`${ms(done.total_latency_ms)} total · ${ms(done.router_overhead_ms)} router overhead`}
                right={done.artifact_id && (
                  <a href={api.artifactDownloadUrl(done.artifact_id)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-cyan-300">
                    <Download size={13} /> Download report
                  </a>
                )}
              />
              <div className="prose prose-invert prose-sm max-w-none p-5 prose-table:text-xs">
                <Markdown remarkPlugins={[remarkGfm]}>{done.final_output || '_No output_'}</Markdown>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
