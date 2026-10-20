import { ArrowRight, Moon, RotateCcw, Search } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PLAYBOOKS } from '../../lib/playbooks'
import { Kbd, cn } from '../../lib/ui'
import { NAV } from './Sidebar'

interface Action { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

export function CommandPalette({ open, onClose, onToggleTheme, onResetAgents }: {
  open: boolean; onClose: () => void; onToggleTheme: () => void; onResetAgents: () => void
}) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const actions: Action[] = useMemo(() => [
    ...NAV.flatMap((g) => g.items.map((i) => ({
      id: `nav-${i.to}`, group: 'Navigate', label: i.label, hint: i.hint, icon: <i.icon size={15} />, run: () => navigate(i.to),
    }))),
    ...PLAYBOOKS.map((p) => ({
      id: `pb-${p.id}`, group: 'Run playbook', label: p.title, hint: p.department, icon: <p.icon size={15} />,
      run: () => navigate(`/?playbook=${p.id}`),
    })),
    { id: 'reset', group: 'Fleet', label: 'Reset all agents to original status', icon: <RotateCcw size={15} />, run: onResetAgents },
    { id: 'theme', group: 'Preferences', label: 'Toggle light / dark theme', icon: <Moon size={15} />, run: onToggleTheme },
  ], [navigate, onResetAgents, onToggleTheme])

  const filtered = actions.filter((a) => (a.label + ' ' + (a.hint ?? '') + ' ' + a.group).toLowerCase().includes(q.toLowerCase()))

  useEffect(() => {
    if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10) }
  }, [open])
  useEffect(() => setIdx(0), [q])

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && filtered[idx]) { filtered[idx].run(); onClose() }
    if (e.key === 'Escape') onClose()
  }

  let lastGroup = ''
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/40 px-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} onMouseDown={onClose}>
          <motion.div onMouseDown={(e) => e.stopPropagation()}
            initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search size={16} className="text-muted" />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
                placeholder="Type a command or search playbooks…"
                className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {filtered.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted">No matching commands</div>}
              {filtered.map((a, i) => {
                const header = a.group !== lastGroup
                lastGroup = a.group
                return (
                  <div key={a.id}>
                    {header && <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-faint">{a.group}</div>}
                    <button onMouseEnter={() => setIdx(i)} onClick={() => { a.run(); onClose() }}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                        i === idx ? 'bg-accent-soft text-accent-ink' : 'text-ink-2')}>
                      <span className={cn('flex h-7 w-7 items-center justify-center rounded-md border', i === idx ? 'border-accent/20 bg-surface' : 'border-line bg-surface-2')}>{a.icon}</span>
                      <span className="flex-1 font-medium">{a.label}</span>
                      {a.hint && <span className="text-xs text-muted">{a.hint}</span>}
                      {i === idx && <ArrowRight size={14} />}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-muted">
              <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
              <span className="flex items-center gap-1"><Kbd>↵</Kbd> run</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
