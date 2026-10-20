import { ChevronRight, Cloud, Moon, Search, Sun } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { Kbd, cn } from '../../lib/ui'
import type { Theme } from '../../lib/theme'
import { NAV } from './Sidebar'

export function Topbar({ theme, onToggleTheme, onOpenPalette, health }: {
  theme: Theme
  onToggleTheme: () => void
  onOpenPalette: () => void
  health: { ok: boolean; storage: string; model: string } | null
}) {
  const { pathname } = useLocation()
  const all = NAV.flatMap((g) => g.items.map((i) => ({ ...i, section: g.section })))
  const page = all.find((i) => i.to === pathname) ?? all[0]
  const online = !!health?.ok

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface/85 px-6 backdrop-blur-md max-sm:px-4">
      <nav className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[13px]">
        <span className="text-muted max-2xl:hidden">Enterprise Operations</span>
        <ChevronRight size={14} className="text-faint max-2xl:hidden" />
        <span className="text-muted">{page.section}</span>
        <ChevronRight size={14} className="text-faint" />
        <span className="truncate font-medium text-ink">{page.label}</span>
      </nav>

      <button onClick={onOpenPalette}
        className="ml-auto flex h-8 w-64 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] text-muted transition hover:border-line-strong hover:text-ink max-md:w-8 max-md:justify-center max-md:px-0">
        <Search size={14} />
        <span className="truncate max-md:hidden">Search or run a command…</span>
        <span className="ml-auto flex gap-1 max-md:hidden"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>

      <div className={cn('flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11.5px] font-medium max-lg:hidden',
        online ? 'border-ok/25 bg-ok-soft text-ok' : 'border-line bg-surface-2 text-muted')}>
        <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'live-dot bg-ok text-ok' : 'bg-faint')} />
        {online ? 'Platform online' : 'Connecting'}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] text-muted max-2xl:hidden" title="Deployment">
        <Cloud size={13} /> Production · Render
        {health && <span className="text-faint">· {health.model}</span>}
      </div>

      <button onClick={onToggleTheme} aria-label="Toggle theme"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-3 hover:text-ink">
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap border-l border-line pl-4 max-sm:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#3b6cf0] to-[#1f45c2] text-[11px] font-semibold text-white">OA</span>
        <div className="leading-tight max-lg:hidden">
          <div className="text-[12.5px] font-medium text-ink">Ops Admin</div>
          <div className="text-[11px] text-muted">Administrator</div>
        </div>
      </div>
    </header>
  )
}
