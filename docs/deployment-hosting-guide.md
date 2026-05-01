# Deployment + Hosting Guide (Free and Paid)

_Updated: 2026-04-23_

## Why your Vercel setup is breaking

This project uses Vercel Blob for SQLite sync in serverless mode.  
On Hobby, when Blob usage limits are exceeded, Blob access is blocked until the rolling window resets (official Vercel docs), which can make app features appear broken.

## Code changes already included in this repo

1. Blob sync now auto-disables on quota/permission errors, so the API keeps running.
2. Added `BLOB_SYNC_DISABLED=true` override support.
3. Removed unnecessary blob sync call on every `/api/auth/gateway` request (major reduction in advanced operations).
4. Added optional static serving from Express (`SERVE_STATIC=true`) so one service can host both frontend + API.
5. Added `Dockerfile` for one-click container deploy.

## Recommended hosting options

## 1) Free-friendly (best): Railway

Why:
- Railway supports persistent volumes (Free/Trial: 0.5GB per official docs), which fits SQLite.
- No serverless cold start limitations like Vercel functions for this backend style.

Deploy:
1. Deploy from repo using the included `Dockerfile`.
2. Add a volume mount at `/data`.
3. Set env vars:
   - `NODE_ENV=production`
   - `SERVE_STATIC=true`
   - `AUTH_DATA_DIR=/data`
   - `BLOB_SYNC_DISABLED=true`
   - Do not manually set `PORT` on Railway (Railway injects it dynamically)
   - `VITE_API_BASE_URL=` (empty, if same domain serves both frontend+api)
   - OTP mail: prefer HTTPS API (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM`) on Free/Trial/Hobby.
   - SMTP only on Railway Pro+.
   - Google env vars as needed.
4. For exact copy-paste steps and variable template, use:
   - `docs/railway-free-checklist.md`

## 2) Paid (most stable): Render paid web service + persistent disk

Why:
- Paid Render supports persistent disk for local SQLite.
- Good for always-on API + disk durability.

Deploy:
1. Create paid Web Service from repo (`Dockerfile`).
2. Attach persistent disk and mount `/data`.
3. Set same env vars as Railway option above.

## 3) Keep Vercel (paid) with Blob spend headroom

If you must stay on Vercel:
1. Upgrade plan and monitor Blob advanced ops.
2. Keep `BLOB_SYNC_DISABLE_ON_FAILURE=true`.
3. Use Blob only when needed (already optimized in code).

For immediate recovery on Vercel Hobby: set `BLOB_SYNC_DISABLED=true` and redeploy.

## Free option caveats you should know

Render Free has hard limits:
- spins down after idle,
- local filesystem is ephemeral,
- no persistent disks on free,
- outbound SMTP ports are restricted on free.

So Render Free is not suitable for this OTP + SQLite architecture.

## Pre-deploy checklist

1. `npm run build`
2. `npm run server:start` (or platform health check) and verify:
   - `/api/health`
   - login/signup flow
   - admin auth flow
3. Confirm volume mount path equals `AUTH_DATA_DIR`.
4. Ensure `BLOB_READ_WRITE_TOKEN` is unset when using persistent disk hosting.

## References

- Vercel Blob pricing/limits: https://vercel.com/docs/vercel-blob/usage-and-pricing
- Railway pricing: https://railway.com/pricing
- Railway volumes: https://docs.railway.com/volumes/reference
- Render free limits: https://render.com/docs/free
- Render persistent disks: https://render.com/docs/disks
