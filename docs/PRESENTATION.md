# Presentation script and demo checklist

7 minutes + 3 minutes Q&A, strict. Presenters: **Muhammad Ali** and **Hammad-Ullah**.

## Before going on stage (by 3:15)
- [ ] `gcloud run services update meta-router --region us-central1 --min-instances 1`
- [ ] Open the live link in a fresh incognito window. Visit all 4 pages once to warm up.
- [ ] Registry → **Reset all to original status**
- [ ] Have `data/demo_sales.csv` and `data/samples/vendor_contract.txt` ready in a folder you can reach fast
- [ ] Backup screen recording open in another tab
- [ ] After presenting: set `--min-instances 0` again

## Slides (one idea each)

| # | Time | Slide | Say |
|---|---|---|---|
| 1 | 0:00 | **Problem** | Organizations run many specialist AI agents; users don't know which to use and copy outputs between them by hand. In this dataset's own logs only **9%** of requests reached the right agent and **25%** needed rerouting. Average response ~4 s. Four of twelve agents are unhealthy right now. |
| 2 | 1:00 | **Solution** (architecture diagram `docs/architecture.png`) | One entry point. Planner understands and splits the request → Router picks the best healthy agent per step in code → Orchestrator chains steps, falls back, replans → Dashboard shows every decision. |
| 3 | 2:00 | **Live demo** (below) | 3 minutes. |
| 4 | 5:00 | **Results** | Routing accuracy **_X%_** vs 9% baseline · compound completion **_X%_** · overhead **_X s_** vs direct call (mostly one planner call; routing itself < 5 ms). |
| 5 | 5:30 | **Tech + GCP** | Google ADK agents, OpenAI gpt-5-mini via LiteLLM, FastAPI, React, Firestore, Cloud Run (one container), Secret Manager, built in Google Antigravity. |
| 6 | 6:00 | **Scalability + next steps** | New agent = one registry entry + one intent-map line, no code. Hundreds of agents: embedding search → score top candidates. Small classifier for simple queries, LLM planner only for compound ones. Learn routing weights from the satisfaction column. |

## Live demo (3 minutes)
1. **Simple**: "What is the leave policy for employees going for Hajj?" → HRAssist. Point at the score bars: match, success, health, speed. LegalReview is struck out because it's in maintenance.
2. **Automatic fallback**: attach `vendor_contract.txt`, "Review this vendor contract for risky clauses." → LegalReview is in maintenance → amber fallback → ComplianceChecker.
3. **Compound with real tools**: attach `demo_sales.csv`, "Clean this sales data, find the top products and write a report." → pipeline graph DataCleaner → SalesInsight → ReportWriter. Every number comes from pandas. Click **Download report**.
4. **Live failure**: Registry → SalesInsight **Take offline** → back to Command Center, run query 3 again → reroutes to ReportWriter. (The trace from step 3 is still on screen to compare.)
5. *(If time)* **Replan**: take ReportWriter offline, ask "Translate this into Urdu: The office is closed on Friday." → no translation agent available → purple replan → completed by another agent.
6. **Dashboard**: "Before 9% → Now X%", fallback rate, latency per agent, recent decisions.

Reset all agents after the demo.

## Likely questions
- **Why route in code instead of letting the LLM choose?** Faster, cheaper, predictable, explainable (score breakdown), and fallback is guaranteed.
- **What if the planner fails?** It retries once; plans are validated against a Pydantic schema; otherwise a clear error event, never a crash.
- **What if all agents fail?** One replan per step (max 2 per query) with failure context and the list of available agents; then a partial result with an explanation.
- **How do you measure accuracy?** Planner intent vs labels on 200 given queries and 32 realistic ones we wrote (the given text is synthetic). Agent accuracy = chosen agent is the best available one for the true intent.
- **Latency overhead?** Measured on 10 queries: direct worker call vs full orchestrator. Overhead is almost all the planner call.
- **What did you change in the data?** Only descriptions and capabilities (they were placeholders like `cap_1`). Labels, statuses and metrics untouched; originals kept in `data/original/`.
- **Is anything hardcoded?** No. Every answer is a real LLM call or a real tool; the offline toggle really changes agent state in Firestore.
