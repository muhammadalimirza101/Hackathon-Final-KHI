# GCP + Firestore setup

Everything goes in **`us-central1`**. Do **not** enable Vertex AI. All LLM calls use the OpenAI key.

## 1. Laptop

1. Install the Google Cloud CLI: https://cloud.google.com/sdk/docs/install (Windows installer). Restart the terminal.
2. Log in and select the project:
   ```bash
   gcloud auth login
   gcloud auth application-default login      # lets the local backend talk to Firestore
   gcloud config set project <PROJECT_ID>
   ```

## 2. Enable APIs

```bash
gcloud services enable run.googleapis.com firestore.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 3. Firestore

Console → Firestore → **Create database** → **Native mode** → database ID `(default)` → location `us-central1`.
Or by CLI:
```bash
gcloud firestore databases create --location=us-central1 --type=firestore-native
```
Collections (`agents`, `requests`, `eval_runs`, `artifacts`) are created automatically on first write.
The backend seeds `agents` on startup if it's empty. To seed by hand: `cd backend && python -m scripts.seed_firestore`.

## 4. Secret

```bash
printf "%s" "<OPENAI_KEY>" | gcloud secrets create openai-key --data-file=-
```
(Use `gcloud secrets versions add openai-key --data-file=-` to change it later.)

## 5. Service account roles

Cloud Run uses the default compute service account `<PROJECT_NUMBER>-compute@developer.gserviceaccount.com`:
```bash
PN=$(gcloud projects describe <PROJECT_ID> --format="value(projectNumber)")
SA=$PN-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding <PROJECT_ID> --member=serviceAccount:$SA --role=roles/datastore.user
```

## 6. Deploy

From the repo root:
```bash
gcloud run deploy meta-router --source . --region us-central1 --allow-unauthenticated \
  --memory 1Gi --timeout 300 \
  --set-secrets OPENAI_API_KEY=openai-key:latest \
  --set-env-vars GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,MODEL_NAME=gpt-5-mini
```
Before presenting: `gcloud run services update meta-router --region us-central1 --min-instances 1`. Afterwards set it back to `0`.

## 7. Budget alert

Billing → Budgets & alerts → create a **$4** budget alert on the project.

## Local run against Firestore

Put `GOOGLE_CLOUD_PROJECT=<PROJECT_ID>` in `backend/.env` (after `gcloud auth application-default login`).
Leave it empty to use the in-memory store (no GCP needed; data resets on restart).
