# ChatNest — Deployment Guide

This guide takes you from **local project on your machine** to a **live URL
anyone can visit**, using free tiers only.

**Target architecture:**

| Piece | Host | Why |
|---|---|---|
| Frontend (Next.js 16) | **Vercel** | Built by the Next.js team; zero config. |
| Backend (FastAPI) | **Render** | Free web service, easy env vars, disks for Qdrant. |
| PostgreSQL | **Neon** (or Render's free Postgres) | Serverless Postgres, generous free tier. |
| Vector store (Qdrant) | Embedded on backend disk | No extra service needed for small scale. |

---

## Step 1 — Push to GitHub

### 1.1 Create the repo on GitHub

1. Go to [github.com/new](https://github.com/new).
2. **Repository name:** `ChatNest` (or anything you like).
3. **Visibility:** Private is safest until you're happy with it.
4. **Do NOT** add a README, .gitignore, or license — we already have them.
5. Click **Create repository**. Leave the page open; you'll copy the URL in a moment.

### 1.2 Initialise git locally

Open PowerShell in `C:\Users\aditi\OneDrive\Desktop\CubexO\ChatNest` and run:

```powershell
git init
git branch -M main
git add .
git status
```

`git status` should **not** list:

- `.env`
- `venv/`
- `qdrant_storage/`
- `chatnest.db`
- `frontend/node_modules/`
- `frontend/.next/`

If any of them show up, stop and double-check `.gitignore` — those must stay local.

### 1.3 First commit

```powershell
git commit -m "Initial commit: ChatNest full-stack AI chat platform"
```

### 1.4 Connect to GitHub and push

Replace `<your-username>` with your GitHub handle:

```powershell
git remote add origin https://github.com/<your-username>/ChatNest.git
git push -u origin main
```

When it prompts for credentials, use a **GitHub Personal Access Token**
(Settings → Developer settings → Personal access tokens → Tokens (classic) →
scope `repo`) instead of your password.

Refresh the GitHub page — your code should be live.

> ### 🔐 Rotate exposed secrets *now*
>
> Your local `.env` has a real Gemini API key and a DB password. Even though
> `.gitignore` keeps them off GitHub, assume anything you've shared during
> development is compromised:
>
> 1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey) and
>    **delete the old key**. Create a new one.
> 2. Update your local `.env` with the new key.
> 3. Use the new key in the hosting dashboards below — never commit it.

---

## Step 2 — Create a Postgres database (Neon)

1. Sign up at [neon.tech](https://neon.tech) with GitHub.
2. Create a project (region closest to where you'll deploy the backend).
3. On the dashboard, copy the **connection string**. It looks like:
   `postgresql://user:pass@ep-xxxxx.aws.neon.tech/chatnest?sslmode=require`
4. Keep this tab open — you'll paste it into Render in the next step.

*(Alternative: on Render, create a free PostgreSQL instance instead.)*

---

## Step 3 — Deploy the backend to Render

### 3.1 Sign up

Go to [render.com](https://render.com) and sign up with GitHub. Authorise Render
to access your `ChatNest` repository.

### 3.2 Create a Web Service

1. Click **New → Web Service**.
2. Pick your `ChatNest` repo.
3. Fill in the form:

   | Field | Value |
   |---|---|
   | Name | `chatnest-api` |
   | Region | Same as your Neon DB |
   | Branch | `main` |
   | Root Directory | *(leave blank)* |
   | Runtime | `Python 3` |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Plan | Free |

### 3.3 Add environment variables

Under **Environment → Environment Variables**, add:

| Key | Value |
|---|---|
| `USE_SQLITE` | `0` |
| `DATABASE_URL` | *(paste Neon connection string)* |
| `DB_AUTO_CREATE_TABLES` | `1` *(turn off after first successful boot)* |
| `GEMINI_API_KEY` | *(your new key)* |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `JWT_SECRET_KEY` | *(run `python -c "import secrets; print(secrets.token_urlsafe(64))"` locally, paste output)* |
| `JWT_EXPIRE_MINUTES` | `1440` |
| `QDRANT_PATH` | `/var/data/qdrant` |
| `CORS_ALLOW_ORIGINS` | *(leave blank for now; add Vercel URL in Step 5)* |

### 3.4 Add a persistent disk for Qdrant

Under **Disks → Add Disk**:

| Field | Value |
|---|---|
| Name | `qdrant-storage` |
| Mount path | `/var/data` |
| Size | `1 GB` |

This makes sure your vector embeddings survive redeploys.

### 3.5 Deploy

Click **Create Web Service**. Watch the logs — first boot takes 3–5 minutes
because `sentence-transformers` downloads the MiniLM model.

When it's green, visit `https://chatnest-api.onrender.com/` (your actual URL
will be shown). You should see:

```json
{ "status": "ok", "service": "ChatNest API", "version": "2.0.0" }
```

✅ **Also check `/docs`** — the Swagger UI should load.

---

## Step 4 — Deploy the frontend to Vercel

### 4.1 Sign up

Go to [vercel.com](https://vercel.com), sign in with GitHub.

### 4.2 Import the project

1. Click **Add New → Project**.
2. Select your `ChatNest` repo.
3. **Root Directory**: click **Edit** and set it to `frontend`. *(important — the Next.js app lives in a subfolder)*
4. Framework preset should auto-detect as **Next.js**. Leave Build/Output settings default.

### 4.3 Add environment variable

Under **Environment Variables**:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://chatnest-api.onrender.com` *(your Render URL from Step 3.5)* |

### 4.4 Deploy

Click **Deploy**. In ~2 minutes you'll get a URL like
`https://chatnest-<hash>.vercel.app`.

---

## Step 5 — Wire CORS back to the frontend

Now that Vercel gave you a real URL, the backend needs to trust it.

1. Go back to Render → `chatnest-api` → **Environment**.
2. Set `CORS_ALLOW_ORIGINS` to your Vercel URL, for example:

   ```
   https://chatnest-<hash>.vercel.app,https://chatnest.vercel.app
   ```

3. Click **Save Changes**. Render redeploys automatically.

---

## Step 6 — Smoke test

Visit your Vercel URL and:

1. Sign up with a new account.
2. Start a chat — replies should stream in.
3. Switch to Incognito mode — no sidebar history saved.
4. Press `Ctrl+K` and search.
5. Open a chat and try the Share link feature.

If any step fails, check the browser DevTools → Network → the failing request.
A CORS error means Step 5 wasn't saved correctly. A 500 means check the Render
logs.

---

## Step 7 — Lock things down for production

Once everything works:

1. On Render, set `DB_AUTO_CREATE_TABLES=0` so startup doesn't keep running
   `create_all` against your real schema.
2. (Optional) Add a custom domain on Vercel and on Render, then update
   `CORS_ALLOW_ORIGINS` again.
3. (Optional) Upgrade Render to a paid plan if you don't want the free
   instance to sleep after 15 min of inactivity.

---

## Updating the deployed app

From then on, every push to `main` **automatically redeploys** both Vercel and
Render:

```powershell
git add .
git commit -m "Your change"
git push
```

That's it.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Frontend loads but chat requests fail with CORS error | `CORS_ALLOW_ORIGINS` missing your Vercel URL | Update it on Render. |
| Backend boot loops on Render | Postgres URL wrong or network-blocked | Re-copy from Neon; ensure `?sslmode=require`. |
| First chat message is slow | MiniLM model downloading on cold start | Normal on free tier — warm up by pinging `/`. |
| "Failed to fetch" in browser | `NEXT_PUBLIC_API_URL` wrong on Vercel | Edit env var, redeploy. |
| `jwt.PyJWTError` in logs | `JWT_SECRET_KEY` was regenerated mid-session | Users need to log in again; keep the key stable. |
| Qdrant dimension mismatch error | Old local DB still referenced | Code auto-heals by recreating the collection; redeploy. |
