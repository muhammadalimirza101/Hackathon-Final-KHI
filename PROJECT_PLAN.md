# Meta-Router: Intelligent Agent Orchestrator

**atomcamp National AI Hackathon Finale · PS-05 · NIC Islamabad · Tuesday, 20 October 2026**

> One entry point for 12 specialist AI agents. The user types a request in plain language. A planner understands it, a router picks the best healthy agent for each step, an orchestrator chains the steps and reroutes on failure, and a live dashboard shows every decision.

---

## Table of contents

1. [Rules compliance checklist](#1-rules-compliance-checklist)
2. [Problem in plain words](#2-problem-in-plain-words)
3. [What the dataset tells us](#3-what-the-dataset-tells-us)
4. [Architecture](#4-architecture)
5. [Tech stack and cost](#5-tech-stack-and-cost)
6. [Repository structure](#6-repository-structure)
7. [Data files](#7-data-files)
8. [Firestore collections](#8-firestore-collections)
9. [Backend components](#9-backend-components)
10. [Replanning and out-of-scope detection](#10-replanning-and-out-of-scope-detection)
11. [API contract](#11-api-contract)
12. [Frontend](#12-frontend)
13. [Evaluation](#13-evaluation)
14. [Latency targets](#14-latency-targets)
15. [Deployment](#15-deployment)
16. [Git workflow: commit and push often](#16-git-workflow-commit-and-push-often)
17. [Working with Claude Code inside Antigravity](#17-working-with-claude-code-inside-antigravity)
18. [Timeline](#18-timeline)
19. [Demo script](#19-demo-script)
20. [Presentation and judge Q&A](#20-presentation-and-judge-qa)
21. [Submission checklist](#21-submission-checklist)

---

## 1. Rules compliance checklist

Taken directly from the Participant Guide and Event Agenda. **Missing any of the five requirements costs heavily.**

| Rule | How we meet it |
|---|---|
| Build for the assigned problem statement | PS-05, Intelligent Agent Orchestrator |
| **Agentic AI**: agents plan, use tools, take actions. A plain chatbot does not qualify | Planner agent, 12 worker agents, real tools (pandas cleaning, sales analysis, code scanning, PII detection, saving reports) |
| **Deploy on GCP** | Frontend and backend in one Cloud Run service; Firestore database |
| **Develop in Google Antigravity** | All code written in the Antigravity IDE using Claude Code inside it |
| Scalability story | Registry-driven design: a new agent is one registry entry (see section 20) |
| **Working live demo** | Live on the Cloud Run link; backup screen recording made on the day |
| All code created after the problem reveal | Fresh repo, regular commits through the day |
| Open-source frameworks allowed | Google ADK, LiteLLM, FastAPI, React, etc. |
| AI coding assistants allowed, **but both members must explain every part** | Read every file Claude Code writes. Ask it to explain anything unclear |
| **Commit to Git regularly** (judges may check history) | See section 16 |
| **API keys in environment variables, never in GitHub** | `.env` in `.gitignore`; Secret Manager on Cloud Run |
| **No faked demo**: no hardcoded outputs | Every result comes from a real LLM call or real tool. The offline toggle really changes agent state |
| Credits are limited | OpenAI "mini" model; no Vertex AI; eval runs once or twice with low concurrency |
| Submission deadline **3:45 PM** | Submit by **3:40 PM** |
| Presentation: 7 min + 3 min Q&A, strict | Script in section 20 |

**Data edits:** the two original files stay **untouched** in `data/original/`. Improved versions are saved as **new files with the same format**. We **never change intent labels.** We tell the judges openly what we enriched.

---

## 2. Problem in plain words

An organization has many specialist AI agents (finance, HR, legal, code, data cleaning, and so on). Users don't know which one to use, have to switch between them, and must copy one agent's output into another by hand.

We build a **smart receptionist** for these agents:

1. **Understand** the request (intent classification) and split it into steps if it has several parts (task decomposition).
2. **Choose** the best agent for each step from a registry (capabilities, health, performance).
3. **Reroute** to the next-best agent if the chosen one fails.
4. **Chain** steps: one agent's output becomes the next agent's input.
5. **Show** every decision, latency, and success rate on a dashboard.

**Judged on:** routing accuracy, task completion rate for compound queries, and latency overhead compared with calling the agent directly. Plus the general criteria: innovation, functionality, scalability, real-world impact, technical execution.

---

## 3. What the dataset tells us

**`ps05_agent_registry.json`** (12 agents)
- Descriptions are placeholders ("handles tasks related to X workflows") and capabilities are meaningless labels (`cap_1`, `cap_2`). **We must write real ones.**
- **4 agents are unhealthy:** LegalReview (maintenance), TranslationAgent (maintenance), FinanceBot (degraded), SecurityScanner (degraded). Fallback is needed by the data itself.

**`ps05_user_queries.csv`** (200 queries, 10 intents)
- Intents: hr_policy 33, legal_review 27, compliance_check 23, sales_report 20, meeting_notes 19, translation 19, finance_analysis 18, data_cleaning 17, report_generation 13, code_help 11.
- SecurityScanner and CustomerFeedback have no intent in the data.
- **Historical routing was only correct for 18 of 200 queries (9%).** 50 queries (25%) were rerouted. Average response time was about 4 seconds. **This is our opening line.**
- Query text is synthetic ("Sample query about hr policy topic #1"), so accuracy on it is trivially high. **We also write realistic test queries.**

---

## 4. Architecture

```
User (browser)
   │  query + optional attachment (CSV / code)
   ▼
FastAPI  /api/chat  (streams events)
   │
   ▼
Orchestrator ───────────────────────────────────────────────┐
   │ 1. Planner (LLM, structured output)                    │
   │      → steps: [{id, intent, task, depends_on}]         │
   │ 2. For each step (dependency order, parallel if free): │
   │      Router (code) ranks agents                        │
   │      → try best agent (timeout 10–12 s)                │
   │      → on failure: next agent in ranked list           │
   │      → all failed: replan once, else partial result    │
   │ 3. Pass outputs into dependent steps (chaining)        │
   ▼                                                        │
12 Worker agents (ADK LlmAgents + tools)                    │
   │                                                        │
   ▼                                                        ▼
Telemetry (background) ──► Firestore ──► /api/metrics, /api/logs ──► Dashboard
```

**Why route in code, not by letting the LLM choose (ADK `transfer_to_agent`)?** Code is fast, cheap, predictable and explainable. It guarantees fallback works and lets us show a score breakdown for every decision. The LLM is used where it is strongest: understanding the request.

**When is intent checked?**

| What | When | Why |
|---|---|---|
| Query intent | **Once per query**, by the Planner | Each query is different |
| Agent capabilities | **Once at startup** (registry + intent map) | Fixed descriptions |
| Agent health / status | **Every query, at routing time** (from in-memory cache) | Can change any moment, e.g. the offline toggle |

A fallback does **not** re-detect intent; it moves down the same ranked list. Only if *every* agent for a step fails do we replan (section 10).

---

## 5. Tech stack and cost

| Layer | Choice | Cost |
|---|---|---|
| IDE | Google Antigravity + Claude Code inside it | Free tier with quotas |
| Agent framework | **Google ADK** (Python) | Free, open source |
| LLM | **OpenAI** "mini" model via ADK `LiteLlm` | Organizer-provided key (limited) |
| API | FastAPI + Uvicorn | Free |
| Data | pandas | Free |
| Database | **Firestore** (Native mode, `(default)` database, `us-central1`) | Free tier: 50k reads / 20k writes per day |
| Hosting | **Cloud Run** (`us-central1`), one service | Free tier at our scale |
| Secrets | Secret Manager | Free at our scale |
| Frontend | Vite + React + TypeScript + Tailwind + shadcn/ui + Recharts (+ React Flow if time) | Free |

**Do NOT use Vertex AI (Gemini).** It is billed per token from our $5 GCP credit. All LLM calls go through the OpenAI key.

**Protect the $5:**
- Keep Cloud Run `min-instances=0`, except ~10 minutes before presenting.
- Cache metrics and agent statuses in memory; the dashboard polls every 5–10 s.
- Set a **$4 budget alert** in GCP Billing.
- Deploy everything to `us-central1`.

---

## 6. Repository structure

```
Hackathon-Final-KHI/
├── README.md
├── PROJECT_PLAN.md              # this file
├── FIRESTORE_SETUP.md           # laptop + Firestore console setup
├── .gitignore                   # .env, .venv, node_modules, __pycache__, dist, *.json keys
├── .env.example                 # variable NAMES only, no values
├── Dockerfile                   # multi-stage: build frontend → run FastAPI
├── data/
│   ├── original/                # the 2 given files, untouched
│   ├── ps05_agent_registry_enriched.json
│   ├── intent_map.json
│   ├── test_single.csv          # ~30 realistic single-task queries
│   ├── test_compound.csv        # ~10 multi-step queries
│   └── demo_sales.csv           # messy sample sales data for the demo
├── backend/
│   ├── requirements.txt         # google-adk, litellm, fastapi, uvicorn, google-cloud-firestore, pandas, python-dotenv
│   ├── scripts/seed_firestore.py
│   ├── app/
│   │   ├── main.py              # FastAPI routes; serves frontend build at /
│   │   ├── config.py            # env vars, model name, timeouts, limits
│   │   ├── schemas.py           # Pydantic: Plan, Step, TraceEvent, ...
│   │   ├── db.py                # Firestore client + helpers
│   │   ├── llm.py               # LiteLlm model + run_agent() helper
│   │   ├── agents/
│   │   │   ├── planner.py       # Planner (+ replan instruction)
│   │   │   ├── workers.py       # builds 12 worker LlmAgents from registry
│   │   │   └── tools.py         # real tools
│   │   ├── router.py            # scoring + ranking
│   │   ├── orchestrator.py      # steps, chaining, fallback, replan, events
│   │   └── telemetry.py         # background logging + in-memory metrics
│   └── eval/run_eval.py
└── frontend/
    ├── vite.config.ts           # dev proxy /api → localhost:8000
    └── src/
        ├── App.tsx              # sidebar layout + routes
        ├── api/client.ts        # fetch + stream reader
        ├── types.ts             # mirrors backend schemas
        ├── pages/               # CommandCenter, Registry, Dashboard, Evaluation
        └── components/          # TraceTimeline, ScoreBreakdown, PipelineGraph, AgentCard, KpiTile
```

**Why one container:** one Cloud Run service = one link, no CORS, one deploy. FastAPI serves the API under `/api` and the React build at `/`.

**Ownership (avoids Git conflicts):** Person A owns `backend/` and `data/`. Person B owns `frontend/`. Shared files (`Dockerfile`, `README.md`) are edited by one person at a time, after telling the other.

---

## 7. Data files

### 7.1 Enriched registry (`data/ps05_agent_registry_enriched.json`)
Same fields and format as the original. Only `description` and `capabilities` are rewritten. All other values (status, success_rate, response time, usage) stay exactly as given.

| Agent | Real description (summary) | Example capabilities |
|---|---|---|
| FinanceBot | Financial analysis: budgets, expenses, ratios, forecasts | `analyze_expenses`, `budget_variance`, `financial_ratios`, `forecast` |
| HRAssist | HR policies, leave, benefits, onboarding | `leave_policy`, `benefits_info`, `onboarding`, `hr_faq` |
| LegalReview | Contract review, risky clauses, legal terms | `contract_review`, `clause_risk`, `nda_check`, `legal_terms`, `liability_analysis` |
| CodeHelper | Write, explain, debug and refactor code | `explain_code`, `debug`, `refactor`, `write_function` |
| DataCleaner | Clean tabular data | `deduplicate_rows`, `fill_missing_values`, `normalize_dates` |
| SalesInsight | Sales analysis: totals, top products, trends | `sales_totals`, `top_products`, `trend_analysis` |
| ComplianceChecker | Policy/regulatory compliance, PII detection | `pii_detection`, `policy_compliance`, `regulatory_check` |
| ReportWriter | Structured reports and documents | `write_report`, `executive_summary`, `format_document`, `save_report`, `compile_findings` |
| MeetingSummarizer | Meeting notes, action items, decisions | `summarize_meeting`, `action_items`, `decisions`, `attendee_notes`, `follow_ups` |
| TranslationAgent | Translation incl. English ↔ Urdu | `translate`, `detect_language`, `localize` |
| SecurityScanner | Scan code for secrets and risky patterns | `secret_detection`, `unsafe_code_patterns`, `dependency_risk` |
| CustomerFeedback | Analyze customer feedback and sentiment | `sentiment`, `theme_extraction`, `complaint_triage`, `nps_summary`, `feedback_summary` |

"Same format" means the same fields and types: `capabilities` stays a list of strings, but the number of items may differ from the original.

### 7.2 Intent map (`data/intent_map.json`)
12 intents: the 10 from the dataset plus `security_scan` and `customer_feedback`.

| Intent | Primary (match 1.0) | Backups (match score) |
|---|---|---|
| hr_policy | HRAssist | LegalReview 0.6, ComplianceChecker 0.5 |
| legal_review | LegalReview | ComplianceChecker 0.7 |
| compliance_check | ComplianceChecker | LegalReview 0.7, SecurityScanner 0.4 |
| finance_analysis | FinanceBot | SalesInsight 0.6 |
| sales_report | SalesInsight | ReportWriter 0.6, FinanceBot 0.5 |
| data_cleaning | DataCleaner | SalesInsight 0.3 |
| report_generation | ReportWriter | MeetingSummarizer 0.5 |
| meeting_notes | MeetingSummarizer | ReportWriter 0.5 |
| translation | TranslationAgent | ReportWriter 0.4 |
| code_help | CodeHelper | SecurityScanner 0.5 |
| security_scan | SecurityScanner | CodeHelper 0.6 |
| customer_feedback | CustomerFeedback | SalesInsight 0.5 |

Because LegalReview and TranslationAgent are in maintenance, every legal and translation request triggers a **real** fallback.

### 7.3 Test sets
- `test_single.csv`: ~30 realistic single-task queries with the correct intent, e.g. "What is the leave policy for employees going for Hajj?" → `hr_policy`. Cover all 12 intents.
- `test_compound.csv`: ~10 multi-step queries with the expected intent sequence, e.g. "Clean this sales data, find the top products and write a report" → `data_cleaning > sales_report > report_generation`.
- `demo_sales.csv`: ~40 rows with duplicates, missing values, mixed date formats, extra spaces.

---

## 8. Firestore collections

Collections are created automatically on the first write. See `FIRESTORE_SETUP.md`.

```
agents/{agent_id}
  name, description, capabilities[], status ("active"|"degraded"|"maintenance"|"offline"),
  original_status, avg_response_time_ms, success_rate, usage_count_30d,
  live: { calls, failures, total_latency_ms }

requests/{request_id}
  query, created_at, success, total_latency_ms, router_overhead_ms,
  fallback_count, replan_count,
  plan: [ {id, intent, task, depends_on[]} ],
  steps: [ { step_id, intent,
             ranked: [ {agent, score, breakdown:{match, success, health, speed}} ],
             attempts: [ {agent, ok, latency_ms, error} ],
             final_agent, replanned, replan_reason, output_preview } ]

eval_runs/{run_id}
  created_at, dataset, n, routing_accuracy, per_intent{},
  compound_completion, avg_overhead_ms

artifacts/{artifact_id}
  title, content (markdown), created_at          # reports saved by ReportWriter
```

`seed_firestore.py` loads the enriched registry into `agents` (and stores `original_status` for the reset button).

---

## 9. Backend components

Build in this order. Each depends on the ones before it.

### 9.1 `config.py`
Reads `OPENAI_API_KEY`, `MODEL_NAME`, `GOOGLE_CLOUD_PROJECT`, `STEP_TIMEOUT_S` (10–12), `MAX_ATTEMPTS_PER_STEP` (3), `MAX_REPLANS_PER_QUERY` (2). Loads `.env` locally.

### 9.2 `schemas.py`
Pydantic models: `PlanStep {id, intent, task, depends_on}`, `Plan {steps}`, `ChatRequest {query, attachment_text?}`, `TraceEvent`, `AgentStatusUpdate`.

### 9.3 `db.py`
Firestore client and small helpers: get/update agents, write request, write eval run, save/get artifact.

### 9.4 `llm.py`
- One shared `LiteLlm(model="openai/<mini model>")`.
- `run_agent(agent, text) -> str`: runs any ADK agent through a Runner with an in-memory session and returns the final text. **Everything else uses this helper.**

### 9.5 `agents/tools.py`
Build the first three, then the rest if time allows.

| Tool | Agent | What it really does |
|---|---|---|
| `clean_csv(csv_text)` | DataCleaner | pandas: dedupe, trim, fill missing, normalize dates; returns cleaned CSV + change summary |
| `analyze_sales(csv_text)` | SalesInsight | totals, top products, trend |
| `save_report(title, markdown)` | ReportWriter | saves to `artifacts`; returns download link |
| `scan_code(code)` | SecurityScanner | regex for exposed keys, `eval`, SQL string concatenation |
| `detect_pii(text)` | ComplianceChecker | finds emails, phone numbers, **CNIC numbers** (`\d{5}-\d{7}-\d`) |

The attachment from the request is made available to tools (e.g. via session state), so the LLM does not have to copy large CSVs into tool arguments.

### 9.6 `agents/workers.py`
Loops over the registry and creates 12 ADK `LlmAgent`s. Each instruction is built from the agent's description and capabilities and ends with:

> If the task is outside your capabilities, reply only with: `OUT_OF_SCOPE: <reason>`

### 9.7 `agents/planner.py`
ADK `LlmAgent`, temperature 0, short instruction, Pydantic `output_schema`:

```json
{ "steps": [ { "id": "s1", "intent": "data_cleaning", "task": "...", "depends_on": [] } ] }
```

`intent` must be one of the 12 intents or `"unsupported"` (politely declined). The instruction lists the 12 intents with one-line descriptions and 2–3 examples, including one compound example. A second instruction mode is used for **replanning** (section 10).

### 9.8 `router.py`
```
score = 0.5 × match + 0.2 × success_rate + 0.15 × health + 0.15 × speed

match   from intent_map (0 if agent not listed for the intent)
health  active 1.0 · degraded 0.5 · maintenance / offline → EXCLUDED
speed   1 − (avg_response_time_ms / slowest agent's avg_response_time_ms)
```
Returns the ranked list with the breakdown. Reads statuses from an **in-memory cache** that is updated whenever the status endpoint changes an agent. Takes under 5 ms.

### 9.9 `orchestrator.py`
An async generator that yields trace events:

1. Call Planner → emit `plan`. If `unsupported` → polite answer, `done`.
2. Order steps by `depends_on`. Steps with no pending dependencies run **in parallel** (`asyncio.gather`).
3. For each step: `router.rank(intent)` → emit `routing`.
4. Step input = task + outputs of the steps it depends on (**chaining**) + attachment if relevant.
5. Try agents in ranked order: emit `attempt`; run with `asyncio.wait_for(timeout)`.
   **Failure** = exception, timeout, empty output, or `OUT_OF_SCOPE`. On failure emit `fallback` and try the next (max 3 attempts).
6. Every agent failed → **replan** (section 10).
7. Emit `step_result` per step and `done` with totals. Hand the full record to telemetry.

*Implementation choice:* a custom ADK `BaseAgent` is the "pure ADK" option. **Plan B** (recommended if it gets fiddly): a plain async Python class that calls the ADK planner and workers through `run_agent()`. Still fully ADK-based and much easier for streaming and timeouts. Do not spend more than 15 minutes deciding.

### 9.10 `telemetry.py`
- Writes the `requests` document **in the background** (never in the user's path).
- Updates each agent's `live` stats.
- Keeps metrics **in memory** (total requests, success, latency list for p50/p95, overhead, fallback and replan counts, per-agent stats, intent distribution) so `/api/metrics` does no Firestore reads.

### 9.11 `main.py`
FastAPI app: all routes in section 11, streaming response for `/api/chat`, serves `frontend/dist` at `/`. On startup: load registry from Firestore into the cache (seed if empty).

---

## 10. Replanning and out-of-scope detection

**Out of scope:** every worker may reply `OUT_OF_SCOPE: <reason>`. The orchestrator treats this as a failure and moves to the next agent. This catches wrong-intent cases and stops agents from confidently answering tasks they shouldn't.

**Replan trigger:** every agent in a step's ranked list failed, or none are available.

**Replan flow:**
1. Call the Planner once more with: the original query, the failed step, which agents failed and why, which agents are currently available, and outputs of steps already completed.
2. It returns replacement steps **for that step only** (same schema). Completed steps are kept.
3. Replacement steps go through normal routing and fallback.
4. If they also fail → mark the step failed and return a **partial result with a clear explanation**. Never crash.

**Guardrails:** max **1 replan per step**, max **2 replans per query**. Only runs on failure, so normal queries pay no extra latency.

**Build order:** get the orchestrator working end to end **without** replanning first, then add it (around 1:00–1:15, or at 1:45 if running late).

---

## 11. API contract

Both members follow this exactly.

| Method | Endpoint | Request | Response |
|---|---|---|---|
| POST | `/api/chat` | `{query, attachment_text?}` | Stream of events (one JSON object per line / SSE `data:` lines) |
| GET | `/api/agents` | | List of agents with status + static and live stats |
| PATCH | `/api/agents/{id}/status` | `{status: "active" \| "offline"}` | Updated agent |
| POST | `/api/agents/reset` | | Restores `original_status` for all agents |
| GET | `/api/metrics` | | KPIs, per-agent stats, intent distribution, baseline (9%) |
| GET | `/api/logs?limit=50` | | Recent request records |
| POST | `/api/eval/run` | `{dataset: "original" \| "realistic" \| "compound"}` | Eval results |
| GET | `/api/eval/latest` | | Latest result per dataset |
| GET | `/api/artifacts/{id}` | | Saved report (markdown) |

### Stream events from `/api/chat`
```json
{"type":"plan","request_id":"...","steps":[{"id":"s1","intent":"data_cleaning","task":"...","depends_on":[]}]}
{"type":"routing","step_id":"s1","chosen":"DataCleaner","ranked":[{"agent":"DataCleaner","score":0.91,"breakdown":{"match":1.0,"success":0.876,"health":1.0,"speed":0.89}}]}
{"type":"attempt","step_id":"s1","agent":"DataCleaner"}
{"type":"fallback","step_id":"s2","from":"LegalReview","to":"ComplianceChecker","reason":"maintenance"}
{"type":"replan","step_id":"s3","reason":"all translation agents unavailable","new_steps":[...]}
{"type":"step_result","step_id":"s1","agent":"DataCleaner","latency_ms":2310,"output":"...","artifact_id":null}
{"type":"done","request_id":"...","success":true,"total_latency_ms":8120,"router_overhead_ms":940,"final_output":"..."}
{"type":"error","message":"..."}
```

**Note for the frontend:** browser `EventSource` only supports GET. Read the POST stream with `fetch()` + `response.body.getReader()`.

---

## 12. Frontend

Dark, professional theme. Sidebar with 4 pages and a live health indicator ("10/12 agents healthy").

1. **Command Center**: query box, attach button (CSV / code), `TraceTimeline` (events appear one by one), `ScoreBreakdown` (bars for match / success / health / speed), fallbacks in **amber**, replans in **purple**, final answer, report download link.
2. **Agent Registry**: 12 `AgentCard`s with status badge, success rate, latency, live calls, **"Take offline" toggle**, and a **"Reset all"** button.
3. **Observability Dashboard**: KPI tiles (routing accuracy, compound completion, p50/p95 latency, router overhead, fallback rate, replan recovery rate), latency per agent, success per agent, recent decisions table, intent distribution, and a **"Before 9% → Now X%"** tile. Refresh every 5–10 s.
4. **Evaluation**: run buttons per dataset, per-intent accuracy table, compound completion, overhead.
5. **PipelineGraph** (React Flow): only after 2:30 if everything else works.

Use mock data that matches the API contract **only during development**. The demo must use real backend calls only.

---

## 13. Evaluation

Matches the three criteria in the problem statement.

1. **Routing accuracy**: run *only the Planner* on all 200 original queries and the ~30 realistic ones; compare predicted intent with the label. Also report **agent accuracy**: chosen agent = primary agent, or the best available backup when the primary is unavailable. One call per query, 5 at a time.
2. **Compound task completion**: run the full pipeline on the ~10 compound queries. Success = every step succeeded and the step sequence matches.
3. **Latency overhead**: for 10 queries, time a *direct* call to the correct worker vs. the full orchestrator. Overhead = difference (mostly the Planner call).

Run on the **deployed** version, once, at ~2:50. Save results to `eval_runs` and put the numbers in the slides.

---

## 14. Latency targets

Estimates with a "mini" model; measure on the day.

| Part | Typical |
|---|---|
| Planner (intent detection) | 0.5–1.5 s |
| Router | < 5 ms |
| Worker, simple answer | 1–3 s |
| Worker with a tool | 2–5 s |
| Worker writing a long report | 4–10 s |

| Scenario | First thing visible | Full answer |
|---|---|---|
| Simple query | Plan in ~1 s | ~2.5–4 s |
| Compound (3 steps) | Plan in ~1 s, then each step | ~7–13 s |
| Fallback (agent offline / maintenance) | | no extra time (skipped before calling) |
| Fallback (out of scope) | | +1–2 s |
| Fallback (timeout) | | + full timeout → keep it 10–12 s |
| Replan | | +3–6 s |

**Speed rules:** stream every event · run independent steps in parallel · short Planner prompt, temperature 0, low max tokens · statuses cached in memory · logging in background · `min-instances=1` only around the presentation.

---

## 15. Deployment

Full GCP setup is in `FIRESTORE_SETUP.md`. Summary:

- APIs: Cloud Run, Firestore, Cloud Build, Artifact Registry, Secret Manager. (**Not** Vertex AI.)
- Secret `openai-key` in Secret Manager.
- Cloud Run service account roles: **Secret Manager Secret Accessor**, **Cloud Datastore User**.
- `Dockerfile` (multi-stage):
  - Stage 1 `node:20`: `npm ci && npm run build` in `frontend/`.
  - Stage 2 `python:3.11-slim`: install `backend/requirements.txt`, copy backend, data and `frontend/dist`; run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- Deploy:
  ```bash
  gcloud run deploy meta-router --source . --region us-central1 \
    --allow-unauthenticated \
    --set-secrets OPENAI_API_KEY=openai-key:latest \
    --set-env-vars GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,MODEL_NAME=<mini model>
  ```
- **First deploy by 1:30 PM.** After that, test only on the live link.
- Before presenting: `gcloud run services update meta-router --region us-central1 --min-instances 1`. After: set back to `0`.

---

## 16. Git workflow: commit and push often

Judges may check the commit history to confirm the work was done today. Regular commits also protect us if a laptop crashes.

### Rules
1. **Commit and push at least every 20–30 minutes**, and after every working piece (a tool works, an endpoint responds, a page renders).
2. **Pull before you push**, every time:
   ```bash
   git pull --rebase origin main
   git push origin main
   ```
3. **Stay in your own folders** (A: `backend/`, `data/`; B: `frontend/`). This keeps conflicts near zero.
4. **Small, clear messages:**
   ```
   backend: add router scoring with health and speed
   frontend: command center streams trace events
   data: enriched registry descriptions and intent map
   deploy: first Cloud Run deployment
   ```
5. **Never commit secrets.** Before every commit:
   ```bash
   git status            # check no .env or key files are listed
   git diff --cached     # optional: review what is going in
   ```
6. If Claude Code makes a commit, check it didn't include `.env`.

### First commit (do this before writing any code)
`.gitignore` must contain at least:
```
.env
.venv/
venv/
__pycache__/
node_modules/
dist/
*.pyc
*-key.json
service-account*.json
```
And `.env.example` (names only):
```
OPENAI_API_KEY=
MODEL_NAME=
GOOGLE_CLOUD_PROJECT=
STEP_TIMEOUT_S=12
```

### If a push is rejected
```bash
git pull --rebase origin main
# fix any conflict in the listed files, then:
git add <file>
git rebase --continue
git push origin main
```

### Commit checkpoints (minimum)
| Time | Commit |
|---|---|
| 11:50 | repo setup, .gitignore, plan files |
| 12:20 | data files, schemas, llm helper / frontend scaffold |
| 12:45 | tools + workers + planner / registry page |
| 1:15 | router + orchestrator + /api/chat / command center |
| 1:30 | Dockerfile + first deploy |
| 2:15 | telemetry + metrics / dashboard |
| 2:50 | eval + replan / evaluation page |
| 3:15 | bug fixes + README |
| 3:35 | final commit before submission |

---

## 17. Working with Claude Code inside Antigravity

1. **Give it this file first.** Start each Claude Code session with:
   > Read PROJECT_PLAN.md. We are building this project. I am Person A (backend) / Person B (frontend). Follow the structure, API contract and rules in it exactly.
2. **One file or component per prompt**, in the build order of section 9. Small prompts give better code and are easier to understand.
3. **Ask it to explain** any part you don't understand. Both members must be able to explain every file to the judges.
4. **Run and test after every change** before moving on.
5. **Ask it to commit** after each working piece using the message style in section 16, then push yourself after `git pull --rebase`.
6. Remind it of the hard rules when relevant: no hardcoded outputs, no keys in code, OpenAI via `LiteLlm` (not Vertex AI), Firestore `(default)` database.

### Suggested prompt sequence (Person A)
1. "Create `backend/requirements.txt`, `config.py`, `schemas.py` per sections 9.1–9.2."
2. "Create `data/ps05_agent_registry_enriched.json` (same format as `data/original/ps05_agent_registry.json`, only description and capabilities rewritten per section 7.1) and `data/intent_map.json` per section 7.2."
3. "Create `db.py` and `scripts/seed_firestore.py` per sections 8 and 9.3. Then run the seed."
4. "Create `llm.py` with a shared LiteLlm model and `run_agent()` per section 9.4. Add a tiny test."
5. "Create `agents/tools.py` with `clean_csv`, `analyze_sales`, `save_report` per section 9.5."
6. "Create `agents/workers.py` per section 9.6."
7. "Create `agents/planner.py` per section 9.7."
8. "Create `router.py` per section 9.8 with unit tests for the legal fallback case."
9. "Create `orchestrator.py` per section 9.9, without replanning yet."
10. "Create `main.py` with `/api/chat` streaming and `/api/agents` per section 11."
11. "Create the Dockerfile per section 15."
12. Then: telemetry, metrics, status toggle + reset, eval script, replanning, remaining tools.

### Suggested prompt sequence (Person B)
1. "Scaffold Vite + React + TS + Tailwind + shadcn/ui in `frontend/`, dark theme, sidebar layout with 4 pages, dev proxy `/api` → `localhost:8000`."
2. "Create `types.ts` and `api/client.ts` from section 11, including a streaming reader for POST `/api/chat`."
3. "Build the Registry page per section 12."
4. "Build the Command Center with TraceTimeline and ScoreBreakdown."
5. "Build the Dashboard with KPI tiles and Recharts charts, polling every 8 s."
6. "Build the Evaluation page."
7. Only if time: PipelineGraph with React Flow.

---

## 18. Timeline

Build window 11:00–3:45. Lunch (1–2) is served during the build: eat at the laptops.

| Time | Person A (backend) | Person B (frontend) |
|---|---|---|
| 11:50–12:05 | GCP + Firestore setup (`FIRESTORE_SETUP.md`), secret, first commit | Scaffold, layout, theme |
| 12:05–12:35 | Data files, config, schemas, db, seed, `llm.py` | `types.ts`, `client.ts`, Registry page |
| 12:35–1:15 | Tools, workers, planner, router, orchestrator, `/api/chat` | Command Center + streaming trace |
| **1:15–1:45** | **Dockerfile + first Cloud Run deploy (together). From now on, test on the live link.** | |
| 1:45–2:50 | Telemetry, metrics, status toggle + reset, replanning, eval script | Dashboard, Evaluation page, PipelineGraph if time |
| 2:50–3:15 | Run eval on live link, record numbers, fix bugs. **Feature freeze.** | Polish, fix bugs |
| 3:15–3:40 | README, architecture diagram | Backup demo video, slides |
| **3:40** | **Submit** | |

**If behind schedule, cut in this order:** PipelineGraph → `scan_code` / `detect_pii` tools → Evaluation page (show eval numbers on the Dashboard instead) → parallel steps. **Never cut:** fallback, chaining, dashboard, deployment.

---

## 19. Demo script

Prepare these before 3:15 and practice once.

1. **Simple:** "What is the leave policy for employees going for Hajj?" → HRAssist. Point at the score breakdown.
2. **Automatic fallback:** "Review this vendor contract for risky clauses." LegalReview is in maintenance → ComplianceChecker.
3. **Compound with tools:** attach `demo_sales.csv`: "Clean this sales data, find the top products and write a report." DataCleaner → SalesInsight → ReportWriter → download the report.
4. **Live failure:** take SalesInsight offline in the Registry, rerun query 3, show the reroute.
5. **(Optional) Replan:** take every translation-capable agent offline, ask for a translation, show replan → graceful partial answer.
6. **Dashboard:** KPIs and "Before 9% → Now X%".

Before presenting: press **Reset all**, set `min-instances=1`, open all pages once to warm up.

---

## 20. Presentation and judge Q&A

### 7-minute script (Participant Guide split)
| Time | Content |
|---|---|
| 1 min | **Problem:** organizations run many agents; users don't know which to use. In this dataset's own logs only **9%** of requests reached the right agent and 25% needed rerouting. |
| 1 min | **Solution:** Planner → Router → Orchestrator → 12 agents. Show the architecture diagram. |
| 3 min | **Live demo** (section 19). |
| 1 min | **Tech + GCP:** Google ADK, OpenAI via LiteLLM, FastAPI, React, Firestore, Cloud Run, built in Google Antigravity. |
| 1 min | **Scalability + next steps** (below). |

### Scalability talking points
- A new agent = one registry entry + intent map line. No code changes.
- For hundreds of agents: embedding search picks the top candidates, then the router scores only those.
- A small trained classifier for simple single-intent queries (~50 ms) with the LLM Planner only for compound/unclear queries → ~90% less overhead.
- Pub/Sub for long-running async jobs; Cloud Run autoscaling.
- Learn routing weights from user satisfaction data (the dataset has a satisfaction column).

### Likely questions
- **Why route in code instead of letting the LLM choose?** Faster, cheaper, predictable, explainable, and fallback is guaranteed.
- **What if the Planner fails?** Retry once; if it still fails, return a clear error. The Planner uses structured output so invalid plans are rejected.
- **What if all agents fail?** One replan with failure context; then a partial result with an explanation. Bounded: 1 per step, 2 per query.
- **How do you measure accuracy?** Planner intent vs. labels on 200 given + ~30 realistic queries; we explain the given queries are synthetic.
- **Latency overhead?** Mostly one Planner call (~0.5–1.5 s); routing < 5 ms; measured against direct agent calls.
- **What did you change in the data?** Only descriptions and capabilities (placeholders). Labels and metrics untouched; originals kept in the repo.

---

## 21. Submission checklist

Submit **by 3:40 PM**:

- [ ] Live deployed link on GCP (Cloud Run), tested in a private/incognito window
- [ ] GitHub repository link (public or shared with organizers) with README
- [ ] Presentation slides (PDF or link)
- [ ] Architecture diagram showing agents and how they interact
- [ ] Team name and all members' names
- [ ] Backup demo screen recording saved locally
- [ ] No API keys anywhere in the repo (search the repo for `sk-`)
- [ ] Final commit pushed

**README must include:** what it is, architecture diagram, how routing/fallback/replan work, tech stack, how to run locally, how it is deployed, eval results, and what we enriched in the data.
