# OTP + Domain Setup Guide (Railway + Resend)

_Last updated: 2026-05-25_

## Why your 403 is happening
Resend returns 403 when sending from `resend.dev` test sender to any email except your own Resend account email.
You must verify your own domain in Resend and send from that domain.

## 1) Resend domain setup (required)
1. Open Resend dashboard -> `Domains` -> `Add Domain`.
2. Add your domain: `rampxtrading.com`.
3. Copy DNS records shown by Resend (SPF/DKIM and related records).
4. Go to your DNS provider and add all records exactly.
5. Wait for Resend status to become `Verified`.
6. After verify, set sender email from your domain (example: `noreply@rampxtrading.com`).

## 2) Railway env variables (required)
In Railway service -> `Variables`, set:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=your_real_resend_api_key
RESEND_FROM="CryptoBot Prime <noreply@rampxtrading.com>"

# optional SMTP fallback (project now auto-fallbacks provider if one fails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
SMTP_FROM="CryptoBot Prime <noreply@rampxtrading.com>"
```

Then redeploy Railway service.

## 3) Add custom domain in Railway
1. Railway -> your service -> `Settings` -> `Domains` -> `Custom Domain`.
2. Add your domain or subdomain (recommended app subdomain first: `app.rampxtrading.com`).
3. Railway will show DNS records (CNAME/TXT or ALIAS/ANAME for apex).
4. Add those records in your DNS provider.
5. Wait until Railway shows domain as connected and SSL issued.

## 4) Test OTP in production
1. Open `https://YOUR_DOMAIN/#/signup`.
2. Use a brand new email and click `Get Code`.
3. Confirm inbox receives OTP.
4. Complete signup with OTP.
5. Try wrong OTP once to confirm validation error.
6. Try correct OTP to confirm success.

## 5) API smoke test (optional)

```bash
curl -i -X POST "https://YOUR_DOMAIN/api/auth/signup/send-otp" \
  -H "Content-Type: application/json" \
  --data '{"name":"Otp Test","email":"new-user@example.com"}'
```

Expected: `200` with `{"ok":true,"delivery":"email",...}`

## Notes
- Domain purchase alone is not enough; Resend must show domain `Verified`.
- `RESEND_FROM` must use the verified domain.
- If Cloudflare proxy is used and Railway validation fails, set DNS record to DNS-only (gray cloud) during validation.
