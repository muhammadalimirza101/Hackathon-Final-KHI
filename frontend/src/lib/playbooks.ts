import type { LucideIcon } from 'lucide-react'
import { FileSpreadsheet, FileText, Scale, ScanSearch, ShieldCheck, Users, CalendarClock, MessagesSquare } from 'lucide-react'

/** One-click starting points. Queries go to the real pipeline; samples are real files served by /api/samples. */
export interface Playbook {
  id: string
  title: string
  department: string
  description: string
  query: string
  sample?: string
  icon: LucideIcon
  showcases: string
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'sales-report', title: 'Quarterly sales report', department: 'Sales · Data', icon: FileSpreadsheet,
    description: 'Clean a messy export, rank products and regions, and publish a report.',
    query: 'Clean this sales data, find the top products and write a report.', sample: 'demo_sales.csv',
    showcases: '3-step chain · real tools',
  },
  {
    id: 'contract', title: 'Vendor contract review', department: 'Legal', icon: Scale,
    description: 'Flag risky clauses in a service agreement.',
    query: 'Review this vendor contract for risky clauses.', sample: 'vendor_contract.txt',
    showcases: 'Automatic fallback',
  },
  {
    id: 'hajj', title: 'Leave policy question', department: 'People & HR', icon: Users,
    description: 'Answer an employee policy question directly.',
    query: 'What is the leave policy for employees going for Hajj?',
    showcases: 'Single-step routing',
  },
  {
    id: 'secrets', title: 'Secret leak scan', department: 'Security · Engineering', icon: ScanSearch,
    description: 'Scan source code for exposed keys and unsafe patterns, then explain fixes.',
    query: 'Scan this code for hardcoded secrets and then explain how to fix them.', sample: 'app_code.py',
    showcases: 'Tool use · chaining',
  },
  {
    id: 'pii', title: 'PII compliance audit', department: 'Risk & Compliance', icon: ShieldCheck,
    description: 'Detect CNICs, phone numbers and emails, then write a compliance report.',
    query: 'Check this customer list for personal data and write a compliance report.', sample: 'customer_list.csv',
    showcases: 'Detection + report',
  },
  {
    id: 'meeting', title: 'Meeting brief in Urdu', department: 'Operations · Localization', icon: CalendarClock,
    description: 'Summarize notes and translate action items while translation is in maintenance.',
    query: 'Summarize these meeting notes and translate the action items into Urdu.', sample: 'meeting_notes.txt',
    showcases: 'Fallback on step 2',
  },
  {
    id: 'feedback', title: 'Customer sentiment brief', department: 'Customer Experience', icon: MessagesSquare,
    description: 'Analyze review sentiment and write an executive summary.',
    query: 'Analyze the sentiment of these customer reviews and write an executive summary.', sample: 'customer_reviews.txt',
    showcases: 'Analysis → summary',
  },
  {
    id: 'report', title: 'Leadership status report', department: 'Communications', icon: FileText,
    description: 'Draft a concise project status report for leadership.',
    query: 'Draft a one page project status report for the leadership team on the CRM migration, currently 70% complete and two weeks behind.',
    showcases: 'Downloadable artifact',
  },
]
