// Mirrors backend/app/schemas.py and the API contract in PROJECT_PLAN.md section 11.

export type AgentStatus = 'active' | 'degraded' | 'maintenance' | 'offline'

export interface PlanStep {
  id: string
  intent: string
  task: string
  depends_on: string[]
}

export interface Breakdown {
  match: number
  success: number
  health: number
  speed: number
}

export interface RankedAgent {
  agent: string
  score: number
  breakdown: Breakdown
}

export interface ExcludedAgent {
  agent: string
  reason: string
  match: number
}

export type TraceEvent =
  | { type: 'plan'; request_id: string; steps: PlanStep[]; planner_ms?: number }
  | { type: 'routing'; step_id: string; intent: string; chosen: string | null; ranked: RankedAgent[]; excluded: ExcludedAgent[] }
  | { type: 'attempt'; step_id: string; agent: string; attempt: number }
  | { type: 'fallback'; step_id: string; from: string; to: string | null; reason: string }
  | { type: 'replan'; step_id: string; reason: string; new_steps: PlanStep[]; error?: string }
  | { type: 'step_result'; step_id: string; agent: string | null; ok: boolean; latency_ms: number; output: string; artifact_id: string | null }
  | {
      type: 'done'; request_id: string; success: boolean; total_latency_ms: number; router_overhead_ms: number
      fallback_count: number; replan_count: number; final_output: string; artifact_id: string | null
    }
  | { type: 'error'; message: string }

export interface AgentLive {
  calls: number
  failures: number
  avg_latency_ms: number | null
  success_rate: number | null
}

export interface Agent {
  agent_id: string
  name: string
  description: string
  capabilities: string[]
  avg_response_time_ms: number
  success_rate: number
  usage_count_30d: number
  status: AgentStatus
  original_status: AgentStatus
  live: AgentLive
}

export interface PerAgentMetric {
  agent: string
  status: AgentStatus
  calls: number
  failures: number
  success_rate: number | null
  avg_latency_ms: number | null
  registry_success_rate: number
  registry_avg_response_time_ms: number
}

export interface Metrics {
  total_requests: number
  success_rate: number | null
  p50_latency_ms: number | null
  p95_latency_ms: number | null
  avg_router_overhead_ms: number | null
  fallback_rate: number | null
  replan_count: number
  replan_recovery_rate: number | null
  live_compound_completion: number | null
  routing_accuracy: number | null
  routing_accuracy_original: number | null
  compound_completion: number | null
  eval_overhead_ms: number | null
  baseline_routing_accuracy: number
  agents_healthy: number
  agents_total: number
  per_agent: PerAgentMetric[]
  intent_distribution: Record<string, number>
  storage: string
}

export interface LogStep {
  step_id: string
  intent: string
  final_agent: string | null
  chosen: string | null
  score: number | null
  attempts: number
  replanned: boolean
}

export interface LogEntry {
  request_id: string
  query: string
  created_at: string
  success: boolean
  unsupported: boolean
  total_latency_ms: number
  router_overhead_ms: number
  fallback_count: number
  replan_count: number
  intents: string[]
  agents: (string | null)[]
  steps: LogStep[]
  error?: string | null
}

export type EvalDataset = 'original' | 'realistic' | 'compound'

export interface EvalResult {
  dataset: EvalDataset
  run_id: string
  created_at: string
  n: number
  model: string
  duration_s: number
  baseline_routing_accuracy: number
  routing_accuracy?: number | null
  agent_accuracy?: number | null
  per_intent?: Record<string, { correct: number; total: number; accuracy: number }>
  mistakes?: { query: string; intent: string; predicted: string }[]
  avg_overhead_ms?: number | null
  avg_router_overhead_ms?: number | null
  avg_direct_ms?: number | null
  avg_orchestrated_ms?: number | null
  compound_completion?: number | null
  steps_completed_rate?: number | null
  sequence_match_rate?: number | null
  avg_latency_ms?: number | null
  results?: {
    query: string; expected: string[]; planned: string[] | null; sequence_match: boolean
    all_steps_ok: boolean; success: boolean; latency_ms: number; fallbacks: number | null; replans: number | null
  }[]
}

export interface Artifact {
  artifact_id: string
  title: string
  content: string
  created_at: string
}
