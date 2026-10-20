import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import type { TraceEvent } from '../types'
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
type EndData = { label: string; sub?: string; tone: 'accent' | 'ok' | 'warn' | 'muted' }

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
        st.skipped.push(...ev.excluded.map((e) => ({ agent: e.agent, reason: e.reason })))
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

const STATUS_RING: Record<StepStatus, string> = {
  pending: 'border-line',
  running: 'border-accent shadow-[0_0_0_3px_rgba(34,211,238,0.15)]',
  ok: 'border-ok/60',
  failed: 'border-bad/60',
}

function StepNode({ data }: NodeProps<Node<StepData>>) {
  const s = data.info
  return (
    <div className={cn('w-52 rounded-lg border bg-panel px-3 py-2 text-left', STATUS_RING[s.status])}>
      <Handle type="target" position={Position.Left} className="!border-none !bg-line" />
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted">
        <span>{s.id}</span>
        <span>{s.status === 'running' ? 'running…' : s.latency != null ? ms(s.latency) : s.status}</span>
      </div>
      <div className="text-xs font-semibold text-white">{INTENT_LABEL[s.intent] ?? s.intent}</div>
      <div className="mt-1 space-y-0.5 text-[11px]">
        {s.skipped.map((x) => (
          <div key={`sk-${x.agent}`} className="text-orange-300 line-through decoration-orange-300/60">{x.agent} <span className="no-underline">({x.reason})</span></div>
        ))}
        {s.tried.map((x, i) => (
          <div key={i} className={cn(x.ok === true ? 'text-ok' : x.ok === false ? 'text-warn' : 'text-accent')}>
            {x.ok === true ? '✓' : x.ok === false ? '↷' : '…'} {x.agent}
          </div>
        ))}
        {s.replanned && <div className="text-replan">⟲ replanned</div>}
      </div>
      <Handle type="source" position={Position.Right} className="!border-none !bg-line" />
    </div>
  )
}

const END_TONE = { accent: 'border-accent/60 text-accent', ok: 'border-ok/60 text-ok', warn: 'border-warn/60 text-warn', muted: 'border-line text-muted' }

function EndNode({ data }: NodeProps<Node<EndData>>) {
  return (
    <div className={cn('rounded-full border bg-panel px-4 py-2 text-center text-xs font-semibold', END_TONE[data.tone])}>
      <Handle type="target" position={Position.Left} className="!border-none !bg-line" />
      {data.label}
      {data.sub && <div className="text-[10px] font-normal text-muted">{data.sub}</div>}
      <Handle type="source" position={Position.Right} className="!border-none !bg-line" />
    </div>
  )
}

const nodeTypes = { step: StepNode, end: EndNode }

export function PipelineGraph({ events, running }: { events: TraceEvent[]; running: boolean }) {
  const { nodes, edges, height } = useMemo(() => {
    const { steps, deps } = deriveSteps(events)
    const done = events.find((e) => e.type === 'done') as Extract<TraceEvent, { type: 'done' }> | undefined
    const plan = events.find((e) => e.type === 'plan') as Extract<TraceEvent, { type: 'plan' }> | undefined

    // Column = dependency depth; row = order within that column.
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
    const rows = new Map<number, number>()
    const COL = 260, ROW = 130
    const maxDepth = Math.max(0, ...depth.values())
    const nodes: Node[] = [
      { id: 'planner', type: 'end', position: { x: 0, y: 0 }, data: { label: 'Planner', sub: plan?.planner_ms != null ? ms(plan.planner_ms) : 'thinking…', tone: plan ? 'accent' : 'muted' } },
    ]
    for (const s of steps) {
      const d = depth.get(s.id) ?? 0
      const r = rows.get(d) ?? 0
      rows.set(d, r + 1)
      nodes.push({ id: s.id, type: 'step', position: { x: 160 + d * COL, y: r * ROW - 30 }, data: { info: s } })
    }
    const endTone = !done ? 'muted' : done.success ? 'ok' : 'warn'
    nodes.push({
      id: 'result', type: 'end', position: { x: 160 + (maxDepth + 1) * COL, y: 0 },
      data: { label: done ? (done.success ? 'Answer' : 'Partial answer') : 'Answer', sub: done ? ms(done.total_latency_ms) : undefined, tone: endTone },
    })

    const anim = (id: string) => running && steps.find((s) => s.id === id)?.status !== 'ok'
    const edgeStyle = { stroke: '#3b4a66', strokeWidth: 2 }
    const edges: Edge[] = []
    const dependedOn = new Set([...deps.values()].flat())
    for (const s of steps) {
      const ds = deps.get(s.id) ?? []
      if (ds.length === 0) edges.push({ id: `planner-${s.id}`, source: 'planner', target: s.id, animated: anim(s.id), style: edgeStyle })
      for (const p of ds) edges.push({ id: `${p}-${s.id}`, source: p, target: s.id, animated: anim(s.id), style: edgeStyle, label: 'output', labelStyle: { fill: '#8b98ad', fontSize: 10 }, labelBgStyle: { fill: '#0b0f17' } })
      if (!dependedOn.has(s.id)) edges.push({ id: `${s.id}-result`, source: s.id, target: 'result', animated: running, style: edgeStyle })
    }
    const height = Math.max(220, Math.max(1, ...rows.values()) * ROW + 60)
    return { nodes, edges, height }
  }, [events, running])

  if (!events.some((e) => e.type === 'plan')) return null
  return (
    <div style={{ height }} className="rounded-lg">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }} proOptions={{ hideAttribution: true }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} zoomOnScroll={false} panOnDrag={false} preventScrolling={false} colorMode="dark">
        <Background color="#1f2a3d" gap={20} />
      </ReactFlow>
    </div>
  )
}
