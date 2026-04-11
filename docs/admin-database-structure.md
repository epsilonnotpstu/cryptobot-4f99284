# Admin/User Database Structure Notes

_Last updated: 2026-04-10_

> Full project-wide DB reference now lives in [docs/database-structure.md](/home/afridi/Documents/cryptobot-4f99284/docs/database-structure.md).

## Goal
Admin accounts and platform user accounts are now separated logically at database-query level, and admin dashboard metrics are fully database-driven.

## Core Tables (existing)

### `users`
Main identity table for both admin and platform users.

Important columns:
- `user_id` (unique business id)
- `name`, `first_name`, `last_name`, `mobile`, `avatar_url`
- `account_role` (`admin`, `super_admin`, `trader`, `pro_trader`, `institutional`)
- `account_status` (`active`, `suspended`, `banned`)
- `kyc_status` (`pending`, `authenticated`, `rejected`)
- `auth_tag`
- `email` (unique)
- `password_hash`
- `created_at`

### `kyc_submissions`
Stores each KYC request submission.
- One user can have multiple submissions over time.
- Used for total KYC request metrics and admin review workflow.

### `deposit_requests`
Stores each deposit proof/request submission.
- Used for total/pending/approved/rejected deposit request metrics.

### `user_wallet_balances`
Per-user asset balance state updated from approved deposits.

## New Database Separation Layer

To separate admin and non-admin users cleanly, two SQL views are created at server startup:

### `admin_accounts` (new view)
```sql
SELECT *
FROM users
WHERE account_role IN ('admin', 'super_admin');
```

### `platform_users` (new view)
```sql
SELECT *
FROM users
WHERE account_role NOT IN ('admin', 'super_admin');
```

These views are recreated safely during startup by `ensureUserRoleViews()`.

## Query/Stats Changes

## New count queries
- `countPlatformUsersStatement`
- `countAdminUsersStatement`
- `countPlatformUsersByKycStatusStatement`
- `countActivePlatformUsersStatement`
- `countKycSubmissionsTotalStatement`
- `countKycSubmissionsByStatusStatement`

## Users list query update
- `listPlatformUsersStatement` now reads from `platform_users` view.
- `listAllUsersForAdminStatement` keeps access to full `users` when needed.
- Active-session and KYC submission metadata are enriched in list/detail payloads:
  - `is_session_active` (derived from non-expired `sessions`)
  - `kyc_submission_count`
  - `latest_kyc_submission_status`

## API Payload Changes

### `admin.users.list`
Now returns platform-user focused stats (admins excluded by default):
- `stats.totalUsers`
- `stats.totalPlatformUsers`
- `stats.totalAdminUsers`
- `stats.totalAccounts`
- `stats.pendingVerifications`
- `stats.authenticatedUsers`
- `stats.rejectedUsers`

Additional behavior:
- New optional request flag: `includeAdmins` (default `false`)
- Returned `stats.activeUsers` = currently active platform users based on valid session.
- Returned `users[]` now includes:
  - `isActiveSession`
  - `kycSubmissionCount`
  - `latestKycSubmissionStatus`
  - `kycStage` (derived UI state: `not_submitted`, `submitted_pending`, `authenticated`)

### `admin.kyc.list`
Stats now include both user-level and request-level counters:
- `stats.totalUsers`
- `stats.totalPlatformUsers`
- `stats.totalAdminUsers`
- `stats.totalAccounts`
- `stats.pendingVerifications`
- `stats.authenticatedUsers`
- `stats.rejectedUsers`
- `stats.totalKycRequests`
- `stats.pendingKycRequests`
- `stats.authenticatedKycRequests`
- `stats.rejectedKycRequests`

## Dashboard Metric Mapping (implemented)
All values now come from DB-backed API payloads:
- `Total Users` => platform users only (`admin.users.list` stats)
- `+N pending` => pending KYC count (dynamic)
- `Authenticated Users` card => authenticated platform users
- `Total KYC Requests` => total rows in `kyc_submissions`
- `Total Deposit Requests` => total rows in `deposit_requests`

## New Admin User Action

### `admin.user.delete`
- Deletes a platform user from admin panel.
- Protected behavior:
  - cannot delete admin/super_admin
  - cannot delete self account
- Delete transaction removes related records from:
  - `sessions`
  - `user_wallet_balances`
  - `kyc_submissions`
  - `deposit_requests`
  - `otp_codes`
  - `password_reset_tokens`
  - `users`

## Deposit Management Additions (This Prompt)

### New admin gateway action
- `admin.deposit.asset.delete`
  - Removes a configured row from `deposit_assets`.
  - Keeps historical records in `deposit_requests` unchanged.
  - Returns linked historical request count for admin confirmation messaging.

### Updated admin data load
- Admin panel now fetches both:
  - `admin.deposit.assets.list`
  - `admin.deposit.requests.list`
- New aggregated UI model includes:
  - asset stats (`totalAssets`, `enabledAssets`)
  - request stats (`totalRequests`, `pendingRequests`, `approvedRequests`, `rejectedRequests`)
  - full request rows including screenshot payload for review modal.

### New admin section
- Sidebar section: `Deposit Management` (below KYC).
- Two subsections:
  - `Add Deposit Crypto`
  - `Deposit Request Desk`
- Supported actions:
  - create/update asset
  - delete asset
  - review deposit request (`approved`, `rejected`, `pending`)
  - view screenshot and metadata in modal before decision.

## Notes for Future Planning
- If you later want hard physical separation, create dedicated `admins` and `platform_users` tables and migrate auth/session references.
- Current implementation keeps one `users` table for compatibility but enforces separation through role-based views and stats queries.

## LUM Module Impact (Backend Ready)

LUM integration adds DB-backed investment products and admin-reviewable order lifecycle without breaking existing deposit/KYC/user flows.

New LUM tables:
- `lum_plans`
- `lum_plan_contents`
- `lum_investments`
- `lum_investment_rewards`
- `lum_wallet_ledger`
- `user_wallet_balance_details`
- `lum_admin_audit_logs`

Admin backend actions now available:
- `admin.lum.plans.list`
- `admin.lum.plans.create`
- `admin.lum.plans.update`
- `admin.lum.plans.delete`
- `admin.lum.plans.toggle-status`
- `admin.lum.investments.list`
- `admin.lum.investments.review`
- `admin.lum.investments.force-settle`
- `admin.lum.dashboard-summary`
- `admin.lum.content.save`

Admin UI section:
- Sidebar entry: `LUM Management`
- Component: `src/admin/components/LUMManagementPage.jsx`
- Sub-sections:
  - Plan Studio (create/update/activate-disable/archive)
  - Investment Desk (review pending, force settle active)
  - Content Editor (pledge/risk/faq/terms blocks per plan)

Wallet synchronization rule:
- LUM uses `user_wallet_balance_details` for `available_usd` and `locked_usd`.
- `user_wallet_balances.total_usd` remains active and is synced from details (`available + locked`) so current dashboard remains compatible.

## Binary Module Impact (Backend Ready)

Binary options backend now supports full DB-backed lifecycle and admin control.

New Binary tables:
- `binary_pairs`
- `binary_period_rules`
- `binary_price_ticks`
- `binary_trades`
- `binary_wallet_ledger`
- `binary_admin_audit_logs`
- `binary_engine_settings`

Admin backend actions now available:
- `admin.binary.dashboard-summary`
- `admin.binary.pairs`
- `admin.binary.pairs.create`
- `admin.binary.pairs.update`
- `admin.binary.pairs.delete`
- `admin.binary.pairs.toggle-status`
- `admin.binary.period-rules`
- `admin.binary.period-rules.save`
- `admin.binary.trades`
- `admin.binary.trades.settle`
- `admin.binary.trades.cancel`
- `admin.binary.engine-settings`
- `admin.binary.engine-settings.save`
- `admin.binary.manual-tick.push`

Important engine control:
- `binary_engine_settings.trade_outcome_mode` supports:
  - `auto`
  - `force_win`
  - `force_loss`
- This gives admin a global outcome override capability for newly settled trades.

Admin UI integration:
- Sidebar section: `Binary Management`
- Component: `src/admin/components/BinaryManagementPage.jsx`
- Tabs/areas:
  - `Control Center`: engine settings + manual tick push + outcome override card
  - `Pairs Desk`: create/update/delete/toggle pair
  - `Period Rules`: create/update payout rules
  - `Trade Desk`: monitor all trades, force settle, cancel active trades
- Primary forced-outcome control from admin panel:
  - `Always Win` => saves `tradeOutcomeMode = force_win`
  - `Always Loss` => saves `tradeOutcomeMode = force_loss`
  - `Auto` => saves `tradeOutcomeMode = auto`

Wallet synchronization rule for Binary:
- Trade stake locks from `user_wallet_balance_details.available_usd` to `locked_usd` on `BINARY_USDT`.
- On settlement:
  - win: principal unlock + profit credit
  - loss: locked stake consumed
  - draw: refund by configured draw refund %
- `user_wallet_balances` is synced from detail table after each wallet-affecting action.

Deposit-credit adjustment:
- Approved deposits now also credit `SPOT_USDT` (spot wallet symbol).
- Current wallet symbols in use: `SPOT_USDT`, `MAIN_USDT`, `BINARY_USDT`.
