# Project Database Structure

_Last updated: 2026-04-10_

## Overview
This file documents the full database structure used by CryptoBot (web/app auth, KYC, deposits, wallet, and admin panel).

Database engine: SQLite (`server/data/auth.sqlite`)

## Core Tables

### `users`
Primary identity table for both platform users and admins.

Columns:
- `id` INTEGER PK
- `user_id` TEXT UNIQUE (business ID)
- `name` TEXT
- `first_name` TEXT
- `last_name` TEXT
- `mobile` TEXT
- `avatar_url` TEXT
- `account_role` TEXT (`admin`, `super_admin`, `trader`, `pro_trader`, `institutional`)
- `account_status` TEXT (`active`, `suspended`, `banned`)
- `kyc_status` TEXT (`pending`, `authenticated`, `rejected`)
- `auth_tag` TEXT (`kyc-pending`, `kyc-authenticated`, `kyc-rejected`)
- `kyc_updated_at` TEXT (ISO datetime)
- `email` TEXT UNIQUE
- `password_hash` TEXT
- `created_at` TEXT (ISO datetime)

### `otp_codes`
Stores OTP hashes for signup/verification flows.

Columns:
- `id` INTEGER PK
- `email` TEXT
- `purpose` TEXT
- `otp_hash` TEXT
- `expires_at` TEXT
- `consumed_at` TEXT nullable
- `created_at` TEXT

### `sessions`
Stores hashed session tokens for authenticated app/admin access.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `session_token_hash` TEXT UNIQUE
- `expires_at` TEXT
- `created_at` TEXT

### `password_reset_tokens`
Stores password reset token hashes.

Columns:
- `id` INTEGER PK
- `email` TEXT
- `reset_token_hash` TEXT UNIQUE
- `expires_at` TEXT
- `consumed_at` TEXT nullable
- `created_at` TEXT

### `kyc_submissions`
Stores user KYC submissions and admin review result.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `full_name` TEXT
- `certification` TEXT (`nid`, `passport`, `driving_license`)
- `ssn` TEXT
- `front_file_name` TEXT
- `front_file_data` TEXT (base64 data URL)
- `back_file_name` TEXT
- `back_file_data` TEXT (base64 data URL)
- `status` TEXT (`pending`, `authenticated`, `rejected`)
- `note` TEXT
- `submitted_at` TEXT
- `reviewed_at` TEXT nullable
- `reviewed_by` TEXT nullable

### `platform_notices`
Stores admin-published live notice for user dashboard.

Columns:
- `id` INTEGER PK
- `message` TEXT
- `is_active` INTEGER (`0/1`)
- `created_at` TEXT
- `updated_at` TEXT

### `deposit_assets`
Admin-configured crypto deposit assets/chains.

Columns:
- `id` INTEGER PK
- `symbol` TEXT UNIQUE
- `name` TEXT
- `chain_name` TEXT
- `recharge_address` TEXT
- `qr_code_data` TEXT
- `min_amount_usd` REAL
- `max_amount_usd` REAL
- `sort_order` INTEGER
- `is_enabled` INTEGER (`0/1`)
- `created_at` TEXT
- `updated_at` TEXT

### `deposit_requests`
User deposit proof/recharge requests with admin review status.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `asset_id` INTEGER
- `asset_symbol` TEXT
- `asset_name` TEXT
- `chain_name` TEXT
- `recharge_address_snapshot` TEXT
- `amount_usd` REAL
- `screenshot_file_name` TEXT
- `screenshot_file_data` TEXT (base64 data URL)
- `status` TEXT (`pending`, `approved`, `rejected`)
- `note` TEXT
- `submitted_at` TEXT
- `reviewed_at` TEXT nullable
- `reviewed_by` TEXT nullable

### `user_wallet_balances`
Per-user wallet balance ledger used by dashboard.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `asset_symbol` TEXT
- `asset_name` TEXT
- `total_usd` REAL
- `updated_at` TEXT
- UNIQUE(`user_id`, `asset_symbol`)

## SQL Views (Role Separation)

### `admin_accounts`
```sql
SELECT *
FROM users
WHERE account_role IN ('admin', 'super_admin');
```

### `platform_users`
```sql
SELECT *
FROM users
WHERE account_role NOT IN ('admin', 'super_admin');
```

These views are recreated at server start by `ensureUserRoleViews()`.

## API/Data Model Notes

### User directory (admin)
`admin.users.list` returns:
- platform-user stats (admins excluded by default)
- `isActiveSession`
- `kycSubmissionCount`
- `latestKycSubmissionStatus`
- `kycStage` (`not_submitted`, `submitted_pending`, `authenticated`)

### KYC queue (admin)
`admin.kyc.list` returns:
- latest KYC request per platform user
- request-level counts (`totalKycRequests`, pending/authenticated/rejected)
- request payload includes KYC media (`frontFileData`, `backFileData`) for admin review UI

### KYC review action
`admin.kyc.review` accepts decision:
- `authenticated`
- `rejected` (note required)
- `pending` (used to reset/cancel review back to pending)

On review, both `kyc_submissions.status` and `users.kyc_status/auth_tag/kyc_updated_at` are updated.

## Changes In This Prompt

Schema change:
- No table/column schema changes.

Backend logic change:
- Added admin action: `admin.deposit.asset.delete`.
- Added HTTP endpoint: `POST /api/admin/deposit/assets/delete`.
- Deposit asset deletion removes `deposit_assets` rows only; historical `deposit_requests` are preserved.
- Admin dashboard data sync now includes both deposit assets list and deposit requests list for a dedicated deposit management section.

Frontend integration:
- User deposit flow moved to a separate page component: `src/features/dashboard/DepositPage.jsx`.
- Dashboard deposit button now opens the separate deposit page (instead of inline dashboard view).
- User dashboard home now shows a `Deposit Request Status` summary block.
- New admin page component: `src/admin/components/DepositManagementPage.jsx`.
  - Subsection 1: Add/update/delete deposit crypto assets.
  - Subsection 2: Deposit request review with screenshot preview and approve/reject/pending actions.
