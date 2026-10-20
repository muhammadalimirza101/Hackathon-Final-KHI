import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import { AgentCard } from '../components/AgentCard'
import { Button, Card, usePoll } from '../lib/ui'
import type { Agent } from '../types'

export default function Registry({ onChanged }: { onChanged?: () => void }) {
  const { data: agents, error, setData } = usePoll(api.agents, 8000)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(a: Agent) {
    setBusy(a.agent_id)
    try {
      const updated = await api.setStatus(a.agent_id, a.status === 'offline' ? 'active' : 'offline')
      setData((prev) => prev?.map((x) => (x.agent_id === updated.agent_id ? updated : x)) ?? null)
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  async function reset() {
    setBusy('all')
    try {
      setData(await api.resetAgents())
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const healthy = agents?.filter((a) => a.status === 'active').length ?? 0
  const unavailable = agents?.filter((a) => a.status === 'maintenance' || a.status === 'offline').length ?? 0

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agent Registry</h1>
          <p className="mt-1 text-sm text-muted">
            {agents ? `${agents.length} agents · ${healthy} active · ${unavailable} unavailable (skipped by the router)` : 'Loading…'}
          </p>
        </div>
        <Button variant="outline" onClick={reset} disabled={busy !== null}>
          <RotateCcw size={15} /> Reset all to original status
        </Button>
      </header>
      {error && <Card className="border-bad/40 bg-bad/10 p-4 text-sm text-bad">{error}</Card>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {agents?.map((a) => <AgentCard key={a.agent_id} agent={a} onToggle={toggle} busy={busy !== null} />)}
      </div>
    </div>
  )
}
