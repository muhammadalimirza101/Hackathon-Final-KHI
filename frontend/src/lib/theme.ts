import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'meta-router-theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}

/** Light by default (reads best on projectors); the choice is remembered per browser. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(KEY, theme) } catch { /* ignore */ }
  }, [theme])
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) }
}

/** Resolved token colors for libraries that need literal values (Recharts). */
export function chartColors(theme: Theme) {
  return theme === 'dark'
    ? { accent: '#5b84f6', ok: '#34c08b', warn: '#e0a643', bad: '#f06b6b', replan: '#a68af5', grid: '#1a2030', axis: '#8b95a8', surface: '#0f131c', line: '#222a3a', ink: '#e8ecf3' }
    : { accent: '#2554d9', ok: '#0f9f6e', warn: '#b7791f', bad: '#d23f3f', replan: '#7047d6', grid: '#eceef2', axis: '#667085', surface: '#ffffff', line: '#e3e6ec', ink: '#0e1726' }
}
