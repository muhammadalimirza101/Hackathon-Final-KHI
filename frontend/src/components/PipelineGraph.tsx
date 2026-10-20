import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { BrainCircuit, CircleCheck, CircleDashed, CircleX, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import type { TraceEvent } from '../types'
import { AgentIcon } from '../lib/agents'
import type { Theme } from '../lib/theme'
import { INTENT_LABEL, cn, ms } from '../lib/ui'

type StepStatus = 'pending' | 'running' | 'ok' | 'failed'

interface StepInfo {
  id: string
  intent: string
  status: StepStatus
  tried: { agent: string; ok: boolean | null; reason?: string }[]
  skipped: { agent: string; reason: string }[]
  replanned: boolean
  latency?: number
}

type StepData = { info: StepInfo }
type EndData = { label: string; sub?: string; kind: 'planner' | 'result'; state: 'idle' | 'active' | 'ok' | 'warn' }

/** Collapse the event stream into one status record per plan step (replacement steps "s1.r1" fold into "s1"). */
function deriveSteps(events: TraceEvent[]) {
  const steps = new Map<string, StepInfo>()
  const deps = new Map<string, string[]>()
  const base = (id: string) => id.split('.')[0]
  for (const ev of events) {
    if (ev.type === 'plan') {
      for (const s of ev.steps) {
        steps.set(s.id, { id: s.id, intent: s.intent, status: 'pending', tried: [], skipped: [], replanned: false })
        deps.set(s.id, s.depends_on)
      }
      continue
    }
    if (!('step_id' in ev)) continue
    const st = steps.get(base(ev.step_id))
    if (!st) continue
    switch (ev.type) {
      case 'routing':
        st.status = 'running'
        for (const e of ev.excluded) if (!st.skipped.some((x) => x.agent === e.agent)) st.skipped.push({ agent: e.agent, reason: e.reason })
        break
      case 'attempt':
        st.tried.push({ agent: ev.agent, ok: null })
        break
      case 'fallback': {
        const t = [...st.tried].reverse().find((x) => x.agent === ev.from && x.ok === null)
        if (t) Object.assign(t, { ok: false, reason: ev.reason })
        break
      }
      case 'replan':
        st.replanned = true
        break
      case 'step_result':
        st.status = ev.ok ? 'ok' : 'failed'
        st.latency = ev.latency_ms
        if (ev.ok) {
          const t = [...st.tried].reverse().find((x) => x.agent === ev.agent)
          if (t) t.ok = true
        }
        break
    }
  }
  return { steps: [...steps.values()], deps }
}

const RING: Record<StepStatus, string> = {
  pending: 'border-line',
  running: 'border-accent ring-4 ring-accent/10',
  ok: 'border-ok/50',
  failed: 'border-bad/50',
}

function StatusIcon({ s }: { s: StepStatus }) {
  if (s === 'running') return <Loader2 size={13} className="animate-spin text-accent" />
  if (s === 'ok') return <CircleCheck size={13} className="text-ok" />
  if (s === 'failed') return <CircleX size={13} className="text-bad" />
  return <CircleDashed size={13} className="text-faint" />
}

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const s = data.info
  const final = s.tried.find((t) => t.ok === true)?.agent ?? s.tried[s.tried.length - 1]?.agent
  return (
    <div className={cn('w-[228px] rounded-xl border bg-surface shadow-card transition-all duration-300', RING[s.status])}>
      <Handle type="target" position={Position.Left} />
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[10.5px] text-muted">{s.id}</span>
        <span className="flex items-center gap-1 text-[10.5px] text-muted"><StatusIcon s={s.status} />{s.latency != null ? ms(s.latency) : s.status === 'running' ? 'running' : 'queued'}</span>
      </div>
      <div className="px-3 py-2">
        <div className="text-[12.5px] font-semibold text-ink">{INTENT_LABEL[s.intent] ?? s.intent}</div>
        <div className="mt-1.5 flex items-center gap-2">
          {final ? <AgentIcon name={final} size="sm" /> : <span className="h-6 w-6 rounded-md bg-surface-3" />}
          <span className="truncate text-xs text-ink-2">{final ?? 'awaiting routing'}</span>
        </div>
        {(s.skipped.length > 0 || s.tried.some((t) => t.ok === false) || s.replanned) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {s.skipped.map((x) => <span key={x.agent} className="rounded bg-serious-soft px-1.5 py-0.5 text-[10px] text-serious line-through">{x.agent}</span>)}
            {s.tried.filter((t) => t.ok === false).map((x, i) => <span key={i} className="rounded bg-warn-soft px-1.5 py-0.5 text-[10px] text-warn">↷ {x.agent}</span>)}
            {s.replanned && <span className="rounded bg-replan-soft px-1.5 py-0.5 text-[10px] text-replan">replanned</span>}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

function EndNode({ data }: NodeProps<Node<EndData>>) {
  const tone = data.state === 'ok' ? 'border-ok/50 text-ok' : data.state === 'warn' ? 'border-warn/50 text-warn' : data.state === 'active' ? 'border-accent/60 text-accent' : 'border-line text-muted'
  return (
    <div className={cn('flex items-center gap-2 rounded-xl border bg-surface px-3.5 py-2.5 shadow-card', tone)}>
      <Handle type="target" position={Position.Left} />
      {data.kind === 'planner' ? <BrainCircuit size={16} /> : data.state === 'ok' ? <CircleCheck size={16} /> : <CircleDashed size={16} />}
      <div>
        <div className="text-xs font-semibold text-ink">{data.label}</div>
        {data.sub && <div className="text-[10.5px] text-muted">{data.sub}</div>}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { step: StepNode, end: EndNode }

export function PipelineGraph({ events, running, theme }: { events: TraceEvent[]; running: boolean; theme: Theme }) {
  const { nodes, edges, height } = useMemo(() => {
    const { steps, deps } = deriveSteps(events)
    const done = events.find((e) => e.type === 'done') as Extract<TraceEvent, { type: 'done' }> | undefined
    const plan = events.find((e) => e.type === 'plan') as Extract<TraceEvent, { type: 'plan' }> | undefined

    const depth = new Map<string, number>()
    const getDepth = (id: string, seen = new Set<string>()): number => {
      if (depth.has(id)) return depth.get(id)!
      if (seen.has(id)) return 0
      seen.add(id)
      const d = Math.max(0, ...(deps.get(id) ?? []).map((p) => getDepth(p, seen) + 1))
      depth.set(id, d)
      return d
    }
    steps.forEach((s) => getDepth(s.id))
    const perCol = new Map<number, number>()
    steps.forEach((s) => perCol.set(depth.get(s.id)!, (perCol.get(depth.get(s.id)!) ?? 0) + 1))
    const maxRows = Math.max(1, ...perCol.values())
    const COL = 262, ROW = 140
    const maxDepth = Math.max(0, ...depth.values())
    const rows = new Map<number, number>()
    const centerY = ((maxRows - 1) * ROW) / 2

    const nodes: Node[] = [{
      id: 'planner', type: 'end', position: { x: 0, y: centerY + 30 },
      data: { kind: 'planner', label: 'Planner', sub: plan?.planner_ms != null ? `${ms(plan.planner_ms)} · ${steps.length} step${steps.length === 1 ? '' : 's'}` : 'analyzing…', state: plan ? 'ok' : 'active' },
    }]
    for (const s of steps) {
      const d = depth.get(s.id) ?? 0
      const r = rows.get(d) ?? 0
      rows.set(d, r + 1)
      const colRows = perCol.get(d) ?? 1
      const offset = ((maxRows - colRows) * ROW) / 2
      nodes.push({ id: s.id, type: 'step', position: { x: 170 + d * COL, y: offset + r * ROW }, data: { info: s } })
    }
    nodes.push({
      id: 'result', type: 'end', position: { x: 170 + (maxDepth + 1) * COL, y: centerY + 30 },
      data: { kind: 'result', label: done ? (done.success ? 'Answer delivered' : 'Partial answer') : 'Answer', sub: done ? ms(done.total_latency_ms) : 'pending', state: !done ? 'idle' : done.success ? 'ok' : 'warn' },
    })

    const stroke = theme === 'dark' ? '#2e3749' : '#d0d5dd'
    const live = theme === 'dark' ? '#5b84f6' : '#2554d9'
    const okC = theme === 'dark' ? '#34c08b' : '#0f9f6e'
    const st = (id: string) => steps.find((s) => s.id === id)?.status
    const edgeFor = (id: string, source: string, target: string): Edge => {
      const s = st(target) ?? st(source)
      const active = running && s === 'running'
      const doneEdge = st(source) === 'ok' || source === 'planner' && !!plan
      return { id, source, target, animated: active, style: { stroke: active ? live : doneEdge && st(target) === 'ok' ? okC : stroke, strokeWidth: 2 } }
    }
    const edges: Edge[] = []
    const dependedOn = new Set([...deps.values()].flat())
    for (const s of steps) {
      const ds = deps.get(s.id) ?? []
      if (ds.length === 0) edges.push(edgeFor(`planner-${s.id}`, 'planner', s.id))
      for (const p of ds) edges.push(edgeFor(`${p}-${s.id}`, p, s.id))
      if (!dependedOn.has(s.id)) {
        const e = edgeFor(`${s.id}-result`, s.id, 'result')
        if (done) e.style = { ...e.style, stroke: done.success ? okC : stroke }
        edges.push(e)
      }
    }
    return { nodes, edges, height: Math.max(200, maxRows * ROW + 30) }
  }, [events, running, theme])

  if (!events.some((e) => e.type === 'plan')) return null
  return (
    <div style={{ height }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12, maxZoom: 1 }} proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} zoomOnPinch={false} panOnDrag={false} preventScrolling={false}
        colorMode={theme}>
        <Background color={theme === 'dark' ? '#1a2030' : '#e6e9ef'} gap={18} size={1} />
      </ReactFlow>
    </div>
  )
}
