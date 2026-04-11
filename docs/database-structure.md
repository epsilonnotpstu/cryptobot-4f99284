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

## LUM Tables

### `lum_plans`
LUM/Mining product configuration table.

Key columns:
- `plan_code` TEXT UNIQUE
- `category` TEXT (`lum`, `mining`)
- `title`, `short_description`, `details_html`
- `currency`
- `minimum_amount_usd`, `maximum_amount_usd`
- `return_rate`, `return_type` (`daily_percent`, `cycle_percent`, `fixed_amount`, `apr_percent`)
- `cycle_days`
- `payout_type` (`on_maturity`, `daily_credit`, `manual_settlement`)
- `lock_principal`, `allow_early_redeem`, `early_redeem_penalty_percent`
- `requires_admin_review`
- `quota_limit`, `quota_used`
- `is_featured`, `badge_label`, `display_sort_order`
- `status` (`draft`, `active`, `disabled`, `archived`)
- `created_at`, `updated_at`, `created_by`, `updated_by`

### `lum_plan_contents`
Per-plan content blocks for pledge/risk/faq informational modal content.

Columns:
- `plan_id`
- `content_type`
- `title`
- `body_text`
- `sort_order`
- `is_active`
- `created_at`, `updated_at`

### `lum_investments`
Main LUM investment order table with immutable plan snapshots.

Columns:
- `investment_ref` TEXT UNIQUE
- `user_id`, `plan_id`
- plan snapshot columns (`plan_code_snapshot`, `plan_title_snapshot`, `category_snapshot`, `currency_snapshot`, etc.)
- amount/projection columns (`invested_amount_usd`, `expected_profit_usd`, `expected_total_return_usd`)
- accrual/settlement columns (`accrued_profit_usd`, `settled_profit_usd`, `settled_total_return_usd`)
- `locked_principal_usd`, `wallet_asset_symbol`
- `status` (`pending`, `active`, `completed`, `rejected`, `cancelled`, `redeemed_early`)
- lifecycle columns (`started_at`, `ends_at`, `settled_at`, `reviewed_at`, `reviewed_by`)
- `created_at`, `updated_at`

### `lum_investment_rewards`
Reward ledger rows per investment.

Columns:
- `investment_id`
- `reward_date`
- `reward_amount_usd`
- `reward_type` (`daily`, `maturity`, `manual_adjustment`)
- `status` (`pending`, `credited`, `void`)
- `created_at`, `credited_at`, `note`

### `lum_wallet_ledger`
LUM wallet movement ledger.

Columns:
- `user_id`
- `investment_id`
- `ledger_type` (`lock`, `unlock`, `reward_credit`, `principal_return`, `early_redeem_penalty`, `manual_adjustment`)
- `asset_symbol`
- `amount_usd`
- `balance_before_usd`, `balance_after_usd`
- `note`
- `created_at`, `created_by`

### `user_wallet_balance_details`
Wallet accounting detail table for available/locked/reward split while preserving existing `user_wallet_balances`.

Columns:
- `user_id`
- `asset_symbol`
- `available_usd`
- `locked_usd`
- `reward_earned_usd`
- `updated_at`
- UNIQUE(`user_id`, `asset_symbol`)

### `lum_admin_audit_logs`
Admin audit trail for sensitive LUM actions.

Columns:
- `admin_user_id`
- `action_type`
- `target_type`
- `target_id`
- `note`
- `created_at`

## Binary Options Tables

### `binary_pairs`
Tradable binary option pairs (seeded from enabled `deposit_assets` symbols, quoted in USDT).

Columns:
- `id` INTEGER PK
- `pair_code` TEXT UNIQUE (example: `BTCUSDT`)
- `display_name` TEXT (example: `BTC/USDT`)
- `base_asset`, `quote_asset`
- `price_source_type` (`internal_feed`, `external_api`, `manual_admin_feed`)
- `source_symbol`
- `current_price`, `previous_price`
- `price_precision`
- `chart_timeframe_label`
- `is_enabled`, `is_featured`
- `display_sort_order`
- `created_at`, `updated_at`, `created_by`, `updated_by`

### `binary_period_rules`
Admin-configurable period + payout rules (global with `pair_id = NULL`, or per-pair override).

Columns:
- `id` INTEGER PK
- `pair_id` INTEGER nullable
- `period_seconds`
- `payout_percent`
- `refund_percent_on_draw`
- `is_active`
- `display_sort_order`
- `created_at`, `updated_at`, `created_by`, `updated_by`

### `binary_price_ticks`
Tick history used by both chart rendering and settlement source.

Columns:
- `id` INTEGER PK
- `pair_id`
- `price`
- `tick_time`
- `source_type`
- `created_at`

### `binary_trades`
Main fixed-time binary order table with immutable snapshots.

Columns:
- `id` INTEGER PK
- `trade_ref` TEXT UNIQUE
- `user_id`
- pair snapshots (`pair_id`, `pair_code_snapshot`, `pair_display_name_snapshot`)
- `direction` (`long`, `short`)
- `period_seconds`
- rule snapshots (`payout_percent_snapshot`, `draw_refund_percent_snapshot`)
- `wallet_asset_symbol`
- `stake_amount_usd`
- `expected_profit_usd`, `expected_total_payout_usd`
- `entry_price`, `settlement_price`
- `result_status` (`active`, `won`, `lost`, `draw`, `cancelled`, `error`)
- lifecycle (`opened_at`, `expires_at`, `settled_at`)
- `wallet_lock_status` (`locked`, `released`)
- `pnl_usd`
- `note`
- `created_at`, `updated_at`

### `binary_wallet_ledger`
Wallet movement ledger for binary module accounting.

Columns:
- `id` INTEGER PK
- `user_id`
- `trade_id`
- `ledger_type` (`binary_lock`, `binary_refund`, `binary_win_profit`, `binary_loss`, `binary_draw_refund`, `binary_manual_adjustment`)
- `asset_symbol`
- `amount_usd`
- `balance_before_usd`, `balance_after_usd`
- `note`
- `created_at`, `created_by`

### `binary_admin_audit_logs`
Audit log for sensitive binary admin actions.

Columns:
- `id` INTEGER PK
- `admin_user_id`
- `action_type`
- `target_type`
- `target_id`
- `note`
- `created_at`

### `binary_engine_settings`
Singleton runtime settings table (`id = 1`) for trading engine behavior.

Columns:
- `engine_mode` (`internal_tick`, `external_price_sync`, `manual_admin_tick`)
- `settlement_price_mode`
- `tick_interval_ms`
- `chart_history_limit`
- `binary_wallet_asset_symbol` (default `BINARY_USDT`)
- `require_kyc_for_binary`
- `allow_draw_refund`
- `max_open_trades_per_user`
- `global_min_stake_usd`, `global_max_stake_usd`
- `allow_same_second_multi_trade`
- `trade_outcome_mode` (`auto`, `force_win`, `force_loss`)
- `auto_transfer_from_spot`
- `created_at`, `updated_at`

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

## Wallet Model Notes (Current)

The project now supports three logical wallet symbols for app trading flows:
- `SPOT_USDT`: deposit credits (approved deposits also sync here)
- `MAIN_USDT`: reserved for future transfer/asset flows
- `BINARY_USDT`: binary options stake/lock/settlement wallet

`user_wallet_balance_details` holds precise `available_usd` and `locked_usd`.
`user_wallet_balances.total_usd` is kept synchronized as `available + locked` for dashboard compatibility.
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

Schema changes:
- Added full LUM module tables:
  - `lum_plans`
  - `lum_plan_contents`
  - `lum_investments`
  - `lum_investment_rewards`
  - `lum_wallet_ledger`
  - `user_wallet_balance_details`
  - `lum_admin_audit_logs`

Backend changes:
- Added LUM backend module: `server/lum-module.js`.
- Added user routes:
  - `GET /api/lum/summary`
  - `GET /api/lum/plans`
  - `GET /api/lum/plans/:id`
  - `POST /api/lum/invest`
  - `GET /api/lum/investments`
  - `GET /api/lum/investments/:id`
  - `GET /api/lum/entrust`
  - `GET /api/lum/info`
- Added admin LUM routes:
  - `GET /api/admin/lum/plans`
  - `POST /api/admin/lum/plans/create`
  - `POST /api/admin/lum/plans/update`
  - `POST /api/admin/lum/plans/delete`
  - `POST /api/admin/lum/plans/toggle-status`
  - `GET /api/admin/lum/investments`
  - `POST /api/admin/lum/investments/review`
  - `POST /api/admin/lum/investments/force-settle`
  - `GET /api/admin/lum/dashboard-summary`
  - `POST /api/admin/lum/content/save`
- Added matching gateway actions for `lum.*` and `admin.lum.*`.

Frontend changes:
- Added separate LUM module pages/components under `src/features/lum/`.
- Dashboard quick action `LUM` now opens dedicated LUM page.

Binary admin integration changes:
- Added admin Binary management UI component:
  - `src/admin/components/BinaryManagementPage.jsx`
- Admin section now consumes existing Binary admin APIs for:
  - engine settings save (`trade_outcome_mode`, `auto_transfer_from_spot`, limits)
  - pair management
  - period rule management
  - trade desk actions (force settle/cancel)
- Binary engine runtime update (no schema change):
  - `internal_tick`: server generates continuous random-walk ticks.
  - `external_price_sync`: server attempts Binance live price sync per pair (`source_symbol`/`pair_code`) and falls back safely when a symbol is unavailable.
  - `manual_admin_tick`: server keeps last chart state and only updates when admin pushes manual ticks.
