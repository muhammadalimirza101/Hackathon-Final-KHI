import { Bot, FlaskConical, LayoutDashboard, Network, Terminal } from 'lucide-react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api/client'
import { cn, usePoll } from './lib/ui'
import CommandCenter from './pages/CommandCenter'
import Dashboard from './pages/Dashboard'
import Evaluation from './pages/Evaluation'
import Registry from './pages/Registry'

const NAV = [
  { to: '/', label: 'Command Center', icon: Terminal },
  { to: '/registry', label: 'Agent Registry', icon: Bot },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/evaluation', label: 'Evaluation', icon: FlaskConical },
]

export default function App() {
  const { data: agents, refresh } = usePoll(api.agents, 10000)
  const { pathname } = useLocation()
  const healthy = agents?.filter((a) => a.status === 'active').length
  const allOk = healthy != null && agents != null && healthy === agents.length

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel/60 max-md:w-16">
        <div className="flex items-center gap-2.5 px-4 py-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent"><Network size={18} /></div>
          <div className="max-md:hidden">
            <div className="text-sm font-semibold text-white">Meta-Router</div>
            <div className="text-[11px] text-muted">Agent Orchestrator</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                isActive ? 'bg-accent/10 text-accent' : 'text-muted hover:bg-panel-2 hover:text-white')}>
              <Icon size={17} /> <span className="max-md:hidden">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="m-3 rounded-lg border border-line bg-panel-2 p-3 max-md:hidden">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('h-2 w-2 rounded-full', healthy == null ? 'bg-muted' : allOk ? 'bg-ok' : 'bg-warn')} />
            <span className="text-slate-200">{healthy == null ? 'Connecting…' : `${healthy}/${agents!.length} agents healthy`}</span>
          </div>
          <div className="mt-1 text-[11px] text-muted">PS-05 · atomcamp Hackathon</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto px-6 py-8 max-sm:px-4">
        {/* Command Center stays mounted so a trace survives a trip to the Registry (offline-toggle demo). */}
        <div className={pathname === '/' ? '' : 'hidden'}><CommandCenter onFinished={refresh} /></div>
        <Routes>
          <Route path="/" element={null} />
          <Route path="/registry" element={<Registry onChanged={refresh} />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/evaluation" element={<Evaluation />} />
        </Routes>
      </main>
    </div>
  )
}
