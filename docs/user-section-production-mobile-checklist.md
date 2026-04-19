# User Section Production + Mobile Revision Checklist

This checklist is focused on the user section only: auth, dashboard, deposit, lum, binary, transactions, assets, support.

## 1) Web Production Hosting (Vercel)

1. Set production env values in Vercel project settings:
   - `VITE_API_BASE_URL` (leave empty if using same Vercel project `/api` routes)
   - `VITE_ALLOW_EXTERNAL_API_FALLBACK=false`
   - `VITE_PUBLIC_AUTH_BASE_URL` (public HTTPS URL only)
   - `VITE_NATIVE_AUTH_CALLBACK_URL=cryptobotprime://auth-callback`
   - `VITE_GOOGLE_CLIENT_ID` (if Google sign-in is enabled)
2. Deploy with `npm run build` (or default Vercel build command).
3. Confirm these routes respond after deploy:
   - `/#/login`
   - `/#/signup`
   - `/api/health`
   - `/api/auth/gateway` (POST)
4. Verify user section flows in production:
   - signup OTP
   - login
   - forgot password (lookup -> verify otp -> reset)
   - dashboard profile/password/kyc sections
   - support modal open/send

## 2) Android/iOS App Preparation (Capacitor)

1. In `.env` for app builds, set a reachable backend URL:
   - Real device: public HTTPS backend (recommended)
   - Android emulator local backend: `http://10.0.2.2:4000`
2. Build and sync native projects:
   - `npm run release:mobile:prepare`
3. Open native projects:
   - `npm run cap:open:android`
   - `npm run cap:open:ios`
4. On mobile, validate:
   - app boot lands correctly in auth/app flow
   - login/signup + OTP flow
   - user menu (profile/password/kyc/logout)
   - deposit and support sections

## 3) Pre-Release Verification Command

Run:

```bash
npm run verify:user
```

Expected result:
- Vite production build succeeds without compile errors.
- Vendor chunks are split (`vendor-react`, `vendor-capacitor`, `vendor-auth`, `vendor-misc`) to reduce single bundle risk.

## 4) Known Operational Notes

1. Native app cannot use `localhost` from physical devices.
2. If web deploy cannot reach `/api`, ensure Vercel includes `api/auth/*` files and `api/health.js`.
3. If OTP mail fails, check SMTP sender credentials and provider restrictions.
