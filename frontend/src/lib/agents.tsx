import {
  CalendarClock, Code2, FileText, Landmark, Languages, MessagesSquare, Scale, ScanSearch, ShieldCheck, Table2, TrendingUp, Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from './ui'

/** Presentation metadata per agent: icon and owning business function. */
export const AGENT_META: Record<string, { icon: LucideIcon; domain: string; tint: string }> = {
  FinanceBot: { icon: Landmark, domain: 'Finance', tint: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
  HRAssist: { icon: Users, domain: 'People & HR', tint: 'text-sky-600 bg-sky-500/10 dark:text-sky-400' },
  LegalReview: { icon: Scale, domain: 'Legal', tint: 'text-amber-700 bg-amber-500/10 dark:text-amber-400' },
  CodeHelper: { icon: Code2, domain: 'Engineering', tint: 'text-indigo-600 bg-indigo-500/10 dark:text-indigo-400' },
  DataCleaner: { icon: Table2, domain: 'Data Platform', tint: 'text-cyan-700 bg-cyan-500/10 dark:text-cyan-400' },
  SalesInsight: { icon: TrendingUp, domain: 'Sales', tint: 'text-blue-600 bg-blue-500/10 dark:text-blue-400' },
  ComplianceChecker: { icon: ShieldCheck, domain: 'Risk & Compliance', tint: 'text-teal-700 bg-teal-500/10 dark:text-teal-400' },
  ReportWriter: { icon: FileText, domain: 'Communications', tint: 'text-slate-700 bg-slate-500/10 dark:text-slate-300' },
  MeetingSummarizer: { icon: CalendarClock, domain: 'Operations', tint: 'text-violet-600 bg-violet-500/10 dark:text-violet-400' },
  TranslationAgent: { icon: Languages, domain: 'Localization', tint: 'text-fuchsia-600 bg-fuchsia-500/10 dark:text-fuchsia-400' },
  SecurityScanner: { icon: ScanSearch, domain: 'Security', tint: 'text-rose-600 bg-rose-500/10 dark:text-rose-400' },
  CustomerFeedback: { icon: MessagesSquare, domain: 'Customer Experience', tint: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
}

export function AgentIcon({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const m = AGENT_META[name]
  const Icon = m?.icon ?? FileText
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : size === 'lg' ? 'h-10 w-10 rounded-xl' : 'h-8 w-8 rounded-lg'
  const ic = size === 'sm' ? 13 : size === 'lg' ? 19 : 16
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', box, m?.tint ?? 'bg-surface-3 text-muted', className)}>
      <Icon size={ic} strokeWidth={2} />
    </span>
  )
}
