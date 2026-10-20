# Deployment Change: Render + Firestore (replaces Cloud Run)

**Read this together with `PROJECT_PLAN.md`. Where they disagree about deployment, THIS file wins.**

GCP billing credit could not be redeemed, so Cloud Run, Cloud Build, Artifact Registry and Secret Manager are **not available**. New setup:

| Part | Where | Notes |
|---|---|---|
| Frontend + backend (one Docker container) | **Render** free web service | Same single-container design as before |
| Database | **Firestore** in GCP project **`ps-05-512207`** | Free tier, no billing needed. Access via a service-account key |
| Keep-awake | **UptimeRobot** pings `/api/health` every 5 min | Render free sleeps after 15 min idle |
| Plan B host | **Hugging Face Spaces** (Docker) | Only if Render fails (e.g. out of memory) |

Everything else in `PROJECT_PLAN.md` (architecture, agents, router, orchestrator, API contract, frontend, eval) stays the same.

---

## PART A: Instructions for Claude Code

> Claude Code: apply every item below, run the checks in A.9, then commit and push. Do not change the architecture or API contract.

### A.1 Port and server start
- The container must listen on the port from the `PORT` environment variable, default `8000`:
  ```
  uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
  ```
- Use a shell-form `CMD` (or `sh -c "..."`) so `${PORT:-8000}` expands.
- **Exactly one worker.** Agent statuses and metrics are cached in memory; multiple workers would each have a different cache and the offline toggle would behave inconsistently.

### A.2 Health endpoint
Add `GET /api/health` → `{"ok": true}`. It must **not** call OpenAI or Firestore (it is pinged every 5 minutes and must be fast and free).

### A.3 Firestore credentials
Firestore must work in both environments without code changes:

| Environment | How credentials are found |
|---|---|
| Laptop | Application Default Credentials from `gcloud auth application-default login` |
| Render | `GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/firebase-key.json` (Render secret file) |

Implementation in `db.py`:
1. If env var `FIREBASE_CREDENTIALS_JSON` is set (used by Plan B), parse it and build credentials from that JSON string (`google.oauth2.service_account.Credentials.from_service_account_info`, or `firebase_admin.credentials.Certificate(dict)` if using firebase_admin).
2. Otherwise use Application Default Credentials (this automatically honours `GOOGLE_APPLICATION_CREDENTIALS`).
3. Project ID always from `GOOGLE_CLOUD_PROJECT` (= `ps-05-512207`).
4. Create the client **once** (module-level / startup), not per request.
5. Never read a key file from inside the repo. Never log credential contents.

### A.4 Startup seeding
On startup, if the `agents` collection is empty, seed it from `data/ps05_agent_registry_enriched.json` (same logic as `scripts/seed_firestore.py`). Then load agents into the in-memory cache. This makes a fresh deploy work with no manual seeding step.

### A.5 Frontend → backend URL
- The frontend must call the API with **relative paths** (`/api/...`), never `http://localhost:8000`.
- Keep the Vite dev proxy (`/api` → `localhost:8000`) for local development only.
- FastAPI serves the built frontend (`frontend/dist`) at `/`, with a fallback to `index.html` for client-side routes (e.g. `/dashboard` refreshed in the browser must not 404).
- No CORS configuration is needed (same origin).

### A.6 Dockerfile (multi-stage, repo root)
- Stage 1 `node:20-slim`: `npm ci` and `npm run build` in `frontend/`.
- Stage 2 `python:3.11-slim`:
  - `pip install --no-cache-dir -r backend/requirements.txt`
  - copy `backend/`, `data/`, and the built `frontend/dist`
  - `ENV PYTHONUNBUFFERED=1` (so logs appear in Render immediately)
  - start command from A.1
- Keep the image small: no dev dependencies, no test data beyond `data/`.

### A.7 `.dockerignore` (repo root)
```
.env
.env.*
!.env.example
**/.venv
**/venv
**/__pycache__
**/node_modules
frontend/dist
.git
*.pyc
*-key.json
service-account*.json
firebase-key.json
```

### A.8 Memory (Render free = 512 MB RAM)
- Pin versions in `backend/requirements.txt`.
- Do not load large data into memory at import time; read CSVs only when needed.
- Eval endpoint: max 5 concurrent LLM calls.
- Streaming responses must not buffer the whole output in memory.

### A.9 Checks before committing
1. `docker build -t meta-router .` succeeds (if Docker is installed on the laptop; if not, skip and rely on Render's build log).
2. Run locally: backend starts, `GET /api/health` returns `{"ok": true}`, `GET /api/agents` returns 12 agents, the UI loads at `/`, a demo query streams events.
3. `git status` shows **no** `.env` and **no** key `.json` files.
4. Search the repo for `sk-` and for `private_key`: there must be **no** matches.

### A.10 Commit and push
```
git add -A
git commit -m "deploy: Render-ready container, health endpoint, Firestore credentials"
git pull --rebase origin main
git push origin main
```

### A.11 README update
Add a "Deployment" section: hosted on Render (single Docker container), Firestore on Google Cloud (`ps-05-512207`), built in Google Antigravity; the same Dockerfile deploys to Cloud Run with one command:
```
gcloud run deploy meta-router --source . --region us-central1 --allow-unauthenticated
```
Do **not** describe Cloud Run as the current host.

### A.12 Plan B only if asked: Hugging Face Spaces
- Spaces expects port **7860**: set `ENV PORT=7860` in the Dockerfile **only on the HF branch/remote**, or set a `PORT=7860` variable in the Space settings.
- The Space README needs this front matter at the very top:
  ```
  ---
  title: Meta Router
  sdk: docker
  app_port: 7860
  ---
  ```
- Credentials on HF: `FIREBASE_CREDENTIALS_JSON` secret (full JSON string), handled by A.3 step 1.
- Push as a second remote: `git remote add space https://huggingface.co/spaces/<user>/<space>` then `git push space main` (password = Hugging Face access token with write permission).

---

## PART B: Manual steps (done by us, not Claude Code)

### B.1 Firestore service-account key (5 min)
1. **console.cloud.google.com** → select project **`ps-05-512207`** → **IAM & Admin → Service Accounts** (enable IAM API if asked, it's free).
2. **+ Create service account** → name `meta-router-backend` → **Create and continue**.
3. Role **Cloud Datastore User** → **Continue → Done**.
4. Open it → **Keys → Add key → Create new key → JSON** → file downloads.
5. **Keep it outside the repo.** Never commit, never paste it in chat.

If key creation is blocked: Firebase console → ⚙️ **Project settings → Service accounts → Generate new private key** (same result).

Firestore check: console → **Firestore** → `(default)` database exists in `ps-05-512207`, Native mode, rules **Restrictive**.

### B.2 Render (≈15 min, mostly build time)
1. **render.com → Sign up with GitHub**.
2. **New + → Web Service** → connect repository **`Hackathon-Final-KHI`** (grant access when GitHub asks).
3. Settings:

   | Field | Value |
   |---|---|
   | Language / Runtime | **Docker** |
   | Branch | `main` |
   | Region | **Ohio (US East)** |
   | Instance type | **Free** |
   | Health check path | `/api/health` |
   | Auto-deploy | On |

4. **Environment variables:**

   | Key | Value |
   |---|---|
   | `OPENAI_API_KEY` | the OpenAI key |
   | `MODEL_NAME` | the mini model name used locally |
   | `GOOGLE_CLOUD_PROJECT` | `ps-05-512207` |
   | `STEP_TIMEOUT_S` | `12` |
   | `GOOGLE_APPLICATION_CREDENTIALS` | `/etc/secrets/firebase-key.json` |

5. **Secret Files → Add secret file**: filename **`firebase-key.json`**, contents = paste the **entire** downloaded key file.
6. **Create Web Service** → watch **Logs** until "Your service is live". URL: `https://<name>.onrender.com`.
7. Test in the browser:
   - `https://<name>.onrender.com/api/health` → `{"ok": true}`
   - `https://<name>.onrender.com/api/agents` → 12 agents
   - `https://<name>.onrender.com/` → UI loads; run demo query 1.

From now on every push to `main` redeploys automatically (≈5–8 min each). **Don't push during the last 15 minutes before presenting.**

### B.3 UptimeRobot (2 min)
**uptimerobot.com** → free account → **Add New Monitor** → **HTTP(s)** → URL `https://<name>.onrender.com/api/health` → interval **5 minutes** → **Create Monitor**.

### B.4 Organizers (1 min, do it now)
Message the organizers and keep the reply:
> "Our GCP credit redemption failed. We are deploying on Render (free tier) with Firestore on Google Cloud. Is this accepted for submission?"

### B.5 Presentation wording
Tech slide / Q&A:
> "Built in Google Antigravity with Google ADK. Firestore on Google Cloud. Hosted on Render because the GCP credit couldn't be redeemed; the same Dockerfile deploys to Cloud Run with one command."

Submission form: give the Render URL as the deployed link and add one line explaining why it isn't Cloud Run.

### B.6 Before presenting
- Open the URL 5 minutes before (UptimeRobot should already keep it warm).
- Registry → **Reset all**.
- Open every page once.
- Backup video ready.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Render build fails at `npm ci` | `package-lock.json` missing → run `npm install` in `frontend/` locally, commit the lockfile |
| Build fails installing Python packages | Check the version pins in `requirements.txt`; read the first error in the log |
| "No open ports detected" / health check fails | Server not using `$PORT` or not on `0.0.0.0` → A.1 |
| "Out of memory" / instance restarts | Reduce eval concurrency; if it persists, switch to Plan B (Hugging Face Spaces, 16 GB) |
| `DefaultCredentialsError` on Render | Secret file name must be exactly `firebase-key.json`; env var path must be `/etc/secrets/firebase-key.json` |
| `403 Missing or insufficient permissions` | Service account lacks **Cloud Datastore User** role, or key is from a different project |
| `404 database (default) does not exist` | Key/project mismatch: `GOOGLE_CLOUD_PROJECT` must be `ps-05-512207` and the key must come from that project |
| UI loads but API calls fail | Frontend still calling `localhost` → A.5 |
| Refreshing `/dashboard` gives 404 | Missing `index.html` fallback → A.5 |
| Logs appear late | `PYTHONUNBUFFERED=1` missing → A.6 |

---

## Timeline from 2:05 PM

| Time | Person A | Person B |
|---|---|---|
| 2:05–2:20 | B.1 key; Claude Code applies Part A; push | Message organizers (B.4); finish UI pages |
| 2:20–2:40 | B.2 Render deploy | B.3 UptimeRobot; test UI on live link |
| 2:40–3:00 | Run eval on the live link, note numbers | Dashboard polish |
| 3:00–3:15 | Bug fixes. **Feature freeze at 3:15** | Slides with real numbers |
| 3:15–3:40 | README, architecture diagram, final push | Backup video, rehearse once |
| **3:40** | **Submit** | |
