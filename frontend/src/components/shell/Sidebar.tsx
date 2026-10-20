import { Bot, FlaskConical, Gauge, TerminalSquare } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router-dom'
import type { Agent } from '../../types'
import { cn } from '../../lib/ui'
import { LogoMark } from './Logo'

export const NAV = [
  { section: 'Operate', items: [{ to: '/', label: 'Command Center', icon: TerminalSquare, hint: 'Run requests' }] },
  { section: 'Fleet', items: [{ to: '/registry', label: 'Agent Registry', icon: Bot, hint: '12 agents' }] },
  {
    section: 'Insights', items: [
      { to: '/dashboard', label: 'Observability', icon: Gauge, hint: 'Live metrics' },
      { to: '/evaluation', label: 'Evaluation', icon: FlaskConical, hint: 'Benchmarks' },
    ],
  },
]

export function Sidebar({ agents }: { agents: Agent[] | null }) {
  const total = agents?.length ?? 0
  const operational = agents?.filter((a) => a.status === 'active').length ?? 0
  const degraded = agents?.filter((a) => a.status === 'degraded').length ?? 0
  const down = total - operational - degraded
  return (
    <aside className="flex w-[244px] shrink-0 flex-col bg-sidebar text-sidebar-ink max-lg:w-[68px]">
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-line px-4">
        <LogoMark />
        <div className="min-w-0 max-lg:hidden">
          <div className="text-[13.5px] font-semibold tracking-tight text-white">Meta-Router</div>
          <div className="text-[11px] text-sidebar-muted">Agent Operations Platform</div>
        </div>
      </div>

      <div className="mx-3 mt-3 flex items-center gap-2.5 rounded-lg border border-sidebar-line px-2.5 py-2 max-lg:hidden">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-slate-600 to-slate-800 text-[10px] font-bold text-white">OP</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-white">Enterprise Operations</span>
          <span className="block text-[10.5px] text-sidebar-muted">Production workspace</span>
        </span>
      </div>

      <nav className="mt-4 flex-1 space-y-5 px-3">
        {NAV.map((group) => (
          <div key={group.section}>
            <div className="mb-1.5 px-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted max-lg:hidden">{group.section}</div>
            <div className="space-y-0.5">
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} end title={label}
                  className={({ isActive }) => cn('group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                    isActive ? 'text-white' : 'text-sidebar-muted hover:bg-sidebar-active/70 hover:text-sidebar-ink')}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-sidebar-active ring-1 ring-white/5"
                          transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                      )}
                      {isActive && <motion.span layoutId="nav-bar" className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r bg-[#5b84f6]" />}
                      <Icon size={16} className="relative" />
                      <span className="relative max-lg:hidden">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-xl border border-sidebar-line bg-white/[0.02] p-3 max-lg:hidden">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-sidebar-ink">Fleet health</span>
          <span className="text-[11px] tabular text-sidebar-muted">{agents ? `${operational}/${total}` : '—'}</span>
        </div>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sidebar-line">
          {total > 0 && (
            <>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(operational / total) * 100}%` }} className="bg-emerald-400" />
              <motion.div initial={{ width: 0 }} animate={{ width: `${(degraded / total) * 100}%` }} className="ml-px bg-amber-400" />
              <motion.div initial={{ width: 0 }} animate={{ width: `${(down / total) * 100}%` }} className="ml-px bg-orange-500" />
            </>
          )}
        </div>
        <div className="mt-2 flex gap-3 text-[10.5px] text-sidebar-muted">
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{operational} up</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" />{degraded} degraded</span>
          <span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-orange-500" />{down} down</span>
        </div>
      </div>
      <div className="border-t border-sidebar-line px-4 py-3 text-[10.5px] text-sidebar-muted max-lg:hidden">
        Google ADK · Cloud Run · Firestore
      </div>
    </aside>
  )
}
