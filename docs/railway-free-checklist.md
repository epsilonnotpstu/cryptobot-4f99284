# Railway Free Deploy Checklist (Copy-Paste Ready)

_Updated: 2026-04-23_

This checklist is only for Railway Free/Trial deploy.

## 1) Create Railway project

1. Railway dashboard -> `New Project` -> `Deploy from GitHub repo`.
2. Select this repo (`cryptobot-4f99284`).
3. Railway will use the included `Dockerfile` / `railway.toml`.

## 2) Add persistent volume (required for SQLite)

1. Open your Railway service -> `Settings` -> `Volumes`.
2. Add a volume and mount path: `/data`.
3. Keep size within Free/Trial allowance.

## 3) Add environment variables (copy-paste)

Railway service -> `Variables` -> paste this block, then replace placeholders:

```env
NODE_ENV=production
HOST=0.0.0.0
APP_NAME=CryptoBot Prime

SERVE_STATIC=true
AUTH_DATA_DIR=/data
AUTH_DATA_DIR_FALLBACK=/tmp/cryptobot2-auth-data

# Keep Vercel Blob disabled on Railway
BLOB_SYNC_DISABLED=true
BLOB_SYNC_DISABLE_ON_FAILURE=true

AUTH_HASH_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
OTP_TTL_MINUTES=10
RESET_TOKEN_TTL_MINUTES=15
SESSION_TTL_DAYS=30

# Same-origin API on Railway web

VITE_ALLOW_EXTERNAL_API_FALLBACK=false

# Railway public domain (auto variable)

VITE_PUBLIC_AUTH_BASE_URL="https://cryptobot-prime-production.up.railway.app/"

VITE_NATIVE_AUTH_CALLBACK_URL=cryptobot://auth-callback

VITE_API_BASE_URL="https://cryptobot-prime-production.up.railway.app"

# Optional Google auth
GOOGLE_CLIENT_ID="532626530913-orvilpfr9p301g0oq62eq754k4vnptn4.apps.googleusercontent.com"

VITE_GOOGLE_CLIENT_ID="532626530913-orvilpfr9p301g0oq62eq754k4vnptn4.apps.googleusercontent.com"

# Email delivery (Railway Free/Trial/Hobby: use HTTPS API provider)
EMAIL_PROVIDER=resend
RESEND_API_KEY=REPLACE_WITH_RESEND_API_KEY
RESEND_FROM="CryptoBot Prime <onboarding@YOUR_VERIFIED_DOMAIN>"

# Optional SMTP (works on Railway Pro and above)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=REPLACE_WITH_SMTP_USERNAME
SMTP_PASS=REPLACE_WITH_SMTP_PASSWORD_OR_APP_KEY
SMTP_FROM="CryptoBot Prime <REPLACE_WITH_SMTP_FROM_EMAIL>"
```

Important:
1. `PORT` manually set করো না on Railway. Railway runtime dynamic `PORT` inject করে।
2. আগে যদি `PORT=4000` set করা থাকে, remove করে redeploy দাও।

Generate a strong `AUTH_HASH_SECRET` quickly:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 4) Deploy

1. Click `Deploy` (or trigger redeploy after setting vars).
2. Wait until deployment is healthy.

## 5) Health and route check

Replace `YOUR_DOMAIN` with Railway public domain.

```bash
curl -i https://YOUR_DOMAIN/api/health
```

Expected: HTTP `200` with JSON containing `"ok": true`.

Open these in browser:

1. `https://YOUR_DOMAIN/`
2. `https://YOUR_DOMAIN/#/login`
3. `https://YOUR_DOMAIN/#/signup`
4. `https://YOUR_DOMAIN/api/health`

## 6) Functional smoke test

1. User signup OTP flow.
2. User login flow.
3. Admin login/signup flow.
4. At least one admin page load (`#/admin`).

## 7) Common fixes

1. If health fails:
   - Check volume mounted at `/data`.
   - Confirm `AUTH_DATA_DIR=/data`.
2. If OTP fails:
   - Railway Free/Trial/Hobby হলে SMTP blocked থাকতে পারে; `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` + `RESEND_FROM` set করো।
   - Railway Pro হলে SMTP credentials/sender verify করে redeploy দাও।
   - `onboarding@resend.dev` test sender দিয়ে only তোমার own Resend account email-এ mail যাবে; real user delivery-এর জন্য Resend-এ domain verify করে `RESEND_FROM` update করো।
3. If web cannot call API:
   - Keep `VITE_API_BASE_URL` empty and redeploy.
4. If old frontend config is cached:
   - Trigger a fresh redeploy after env update.
