import type { Agent, AgentStatus, Artifact, EvalDataset, EvalResult, LogEntry, Metrics, TraceEvent } from '../types'

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  agents: () => json<Agent[]>('/api/agents'),
  setStatus: (id: string, status: AgentStatus) =>
    json<Agent>(`/api/agents/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  resetAgents: () => json<Agent[]>('/api/agents/reset', { method: 'POST' }),
  metrics: () => json<Metrics>('/api/metrics'),
  logs: (limit = 50) => json<LogEntry[]>(`/api/logs?limit=${limit}`),
  runEval: (dataset: EvalDataset, limit?: number) =>
    json<EvalResult>('/api/eval/run', { method: 'POST', body: JSON.stringify({ dataset, limit }) }),
  latestEval: () => json<Partial<Record<EvalDataset, EvalResult>>>('/api/eval/latest'),
  artifact: (id: string) => json<Artifact>(`/api/artifacts/${id}`),
  artifactDownloadUrl: (id: string) => `/api/artifacts/${id}?download=true`,
  sample: async (name: string) => {
    const res = await fetch(`/api/samples/${encodeURIComponent(name)}`)
    if (!res.ok) throw new Error(`Could not load sample ${name}`)
    return res.text()
  },
  health: () => json<{ ok: boolean; storage: string; model: string; llm_key_set: boolean }>('/api/health'),
}

/**
 * POST /api/chat and call onEvent for every streamed event (one JSON object per line).
 * EventSource only supports GET, so the stream is read with fetch + a body reader.
 */
export async function streamChat(
  body: { query: string; attachment_text?: string; attachment_name?: string },
  onEvent: (ev: TraceEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) onEvent(JSON.parse(line) as TraceEvent)
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as TraceEvent)
}
