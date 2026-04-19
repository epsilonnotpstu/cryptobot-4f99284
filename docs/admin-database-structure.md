# Admin/User Database Structure Notes

_Last updated: 2026-04-19_

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

## Assets Module Impact (User-Facing + Admin-Aware)

Assets integration keeps existing admin separation model intact while adding user wallet operations and unified wallet history logging.

New wallet-operation tables:
- `wallet_transfer_requests`
- `wallet_conversion_requests`
- `withdrawal_requests`
- `asset_wallet_ledger`

User-facing assets backend actions/routes now available:
- gateway actions: `assets.summary`, `assets.wallets`, `assets.history`, `assets.transfer`, `assets.convert`, `assets.convert.quote`, `assets.withdraw.config`, `assets.withdraw.submit`, `assets.withdrawals`, `assets.transfers`, `assets.conversions`
- REST routes:
  - `GET /api/assets/summary`
  - `GET /api/assets/wallets`
  - `GET /api/assets/history`
  - `POST /api/assets/transfer`
  - `POST /api/assets/convert`
  - `GET /api/assets/withdraw/config`
  - `POST /api/assets/withdraw`
  - `GET /api/assets/withdrawals`
  - `GET /api/assets/transfers`
  - `GET /api/assets/conversions`

Accounting consistency rules:
- `user_wallet_balance_details` remains source of truth for `available_usd` and `locked_usd`.
- `user_wallet_balances.total_usd` remains synchronized (`available + locked`) for legacy dashboard compatibility.
- Every wallet-affecting assets action writes to `asset_wallet_ledger`.
- Binary and LUM modules continue using `BINARY_USDT` and existing lock/unlock settlement behavior without schema breakage.

## Admin Asset Management Impact (This Prompt)

Admin assets control is now first-class and DB-driven.

New admin-facing tables used directly:
- `asset_admin_audit_logs`
- `asset_module_settings`
- `wallet_freeze_rules`

Admin asset gateway actions:
- `admin.assets.dashboard-summary`
- `admin.assets.wallets`
- `admin.assets.wallet.detail`
- `admin.assets.wallet.adjust`
- `admin.assets.wallet.freeze`
- `admin.assets.withdrawals`
- `admin.assets.withdrawals.review`
- `admin.assets.withdrawals.complete`
- `admin.assets.transfers`
- `admin.assets.conversions`
- `admin.assets.settings`
- `admin.assets.settings.save`
- `admin.assets.audit-logs`

Admin asset REST routes:
- `GET /api/admin/assets/dashboard-summary`
- `GET /api/admin/assets/wallets`
- `GET /api/admin/assets/wallets/:userId`
- `POST /api/admin/assets/wallets/adjust`
- `POST /api/admin/assets/wallets/freeze`
- `GET /api/admin/assets/withdrawals`
- `POST /api/admin/assets/withdrawals/review`
- `POST /api/admin/assets/withdrawals/complete`
- `GET /api/admin/assets/transfers`
- `GET /api/admin/assets/conversions`
- `GET /api/admin/assets/settings`
- `POST /api/admin/assets/settings/save`
- `GET /api/admin/assets/audit-logs`

Withdrawal review accounting model:
- User request creation locks amount from available balance (`withdraw_request` + `lock` ledger row).
- Admin `rejected/cancelled` unlocks funds back to available (`unlock` ledger row).
- Admin `completed` consumes locked funds (`debit` ledger row).
- All review/complete actions create `asset_admin_audit_logs` records.

Deposit approval wallet target:
- Deposit approval credit target is now resolved from `asset_module_settings.deposits_credit_wallet_symbol` (default `SPOT_USDT`), not hardcoded.

## Support Management Impact (User + Admin)

Support chat is now DB-backed and integrated for both user dashboard and admin panel.

New support tables:
- `support_tickets`
- `support_ticket_messages`
- `support_admin_audit_logs`

User gateway actions:
- `support.tickets.list`
- `support.ticket.detail`
- `support.ticket.create`
- `support.ticket.message.send`
- `support.ticket.status.update`

User REST routes:
- `GET /api/support/tickets`
- `GET /api/support/tickets/:ticketRef`
- `POST /api/support/tickets`
- `POST /api/support/tickets/:ticketRef/messages`
- `POST /api/support/tickets/:ticketRef/status`

Admin support gateway actions:
- `admin.support.dashboard-summary`
- `admin.support.tickets`
- `admin.support.ticket.detail`
- `admin.support.ticket.reply`
- `admin.support.ticket.update`
- `admin.support.audit-logs`

Admin support REST routes:
- `GET /api/admin/support/dashboard-summary`
- `GET /api/admin/support/tickets`
- `GET /api/admin/support/tickets/:ticketRef`
- `POST /api/admin/support/tickets/reply`
- `POST /api/admin/support/tickets/update`
- `GET /api/admin/support/audit-logs`

Support state model notes:
- User message -> ticket moves to `pending_admin` and increments `admin_unread_count`.
- Admin reply -> ticket moves to `pending_user` and increments `user_unread_count`.
- Admin/user thread open marks relevant unread counters as read.
- Admin status/priority/assignment changes append to `support_admin_audit_logs`.

## Transaction Management Impact (User + Admin)

Transaction center is fully DB-backed for both convert and spot flows.

Transaction tables in active use:
- `convert_pairs`
- `convert_orders`
- `convert_wallet_ledger`
- `convert_admin_audit_logs`
- `spot_pairs`
- `spot_price_ticks`
- `spot_orders`
- `spot_trades`
- `spot_wallet_ledger`
- `spot_admin_audit_logs`
- `transaction_engine_settings`

Admin transaction gateway actions:
- `admin.transaction.dashboard-summary`
- `admin.transaction.engine-settings.get`
- `admin.transaction.engine-settings.save`
- `admin.transaction.convert.pairs.list`
- `admin.transaction.convert.pairs.create`
- `admin.transaction.convert.pairs.update`
- `admin.transaction.convert.pairs.delete`
- `admin.transaction.convert.pairs.toggle-status`
- `admin.transaction.convert.orders.list`
- `admin.transaction.convert.manual-rate.push`
- `admin.transaction.spot.pairs.list`
- `admin.transaction.spot.pairs.create`
- `admin.transaction.spot.pairs.update`
- `admin.transaction.spot.pairs.delete`
- `admin.transaction.spot.pairs.toggle-status`
- `admin.transaction.spot.orders.list`
- `admin.transaction.spot.order.cancel`
- `admin.transaction.spot.order.force-fill`
- `admin.transaction.spot.manual-tick.push`
- `admin.transaction.spot.feed.settings.save`
- `admin.transaction.audit.list`

Stability/accounting notes:
- Transaction wallet snapshot now aggregates canonical wallet symbols before response (`SPOTUSDT` + `SPOT_USDT`) to prevent available-balance mismatch in UI.
- Stale spot price feed now auto-refreshes the latest tick from current pair price at runtime, so convert/spot flows remain operational even without recent manual tick pushes.
