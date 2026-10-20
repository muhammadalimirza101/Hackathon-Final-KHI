import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api/client'
import { CommandPalette } from './components/shell/CommandPalette'
import { Sidebar } from './components/shell/Sidebar'
import { Topbar } from './components/shell/Topbar'
import { useTheme } from './lib/theme'
import { usePoll } from './lib/ui'
import CommandCenter from './pages/CommandCenter'
import Dashboard from './pages/Dashboard'
import Evaluation from './pages/Evaluation'
import Registry from './pages/Registry'

const page = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
}

export default function App() {
  const { theme, toggle } = useTheme()
  const { data: agents, refresh } = usePoll(api.agents, 10000)
  const { data: health } = usePoll(api.health, 30000)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const resetAgents = useCallback(async () => { await api.resetAgents(); refresh() }, [refresh])

  return (
    <div className="flex h-full">
      <Sidebar agents={agents} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar theme={theme} onToggleTheme={toggle} onOpenPalette={() => setPaletteOpen(true)} health={health} />
        <main className="canvas-dots flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-8 py-8 max-sm:px-4">
            {/* Command Center stays mounted so a run survives a trip to the Registry (offline-toggle demo). */}
            <div className={pathname === '/' ? '' : 'hidden'}><CommandCenter onFinished={refresh} agents={agents} theme={theme} /></div>
            <AnimatePresence mode="wait">
              <motion.div key={pathname} {...page}>
                <Routes location={pathname}>
                  <Route path="/" element={null} />
                  <Route path="/registry" element={<Registry onChanged={refresh} />} />
                  <Route path="/dashboard" element={<Dashboard theme={theme} />} />
                  <Route path="/evaluation" element={<Evaluation />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onToggleTheme={toggle} onResetAgents={resetAgents} />
    </div>
  )
}
