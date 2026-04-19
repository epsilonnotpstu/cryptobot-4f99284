# Project Database Structure

_Last updated: 2026-04-19_

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

## Assets Module Tables

### `wallet_transfer_requests`
Internal wallet reallocation requests (Spot/Main/Binary transfer flow).

Columns:
- `id` INTEGER PK
- `transfer_ref` TEXT UNIQUE
- `user_id` TEXT
- `from_wallet_symbol` TEXT
- `to_wallet_symbol` TEXT
- `asset_symbol` TEXT (default `USDT`)
- `amount_usd` REAL
- `status` TEXT (`completed`, `cancelled`, `failed`)
- `note` TEXT nullable
- `created_at` TEXT
- `updated_at` TEXT

### `wallet_conversion_requests`
In-wallet asset conversion records (e.g., BTC -> USDT within same wallet scope).

Columns:
- `id` INTEGER PK
- `conversion_ref` TEXT UNIQUE
- `user_id` TEXT
- `wallet_symbol` TEXT
- `from_asset_symbol` TEXT
- `to_asset_symbol` TEXT
- `source_amount` REAL
- `rate_snapshot` REAL
- `converted_amount` REAL
- `fee_amount` REAL (default `0`)
- `status` TEXT (`completed`, `cancelled`, `failed`)
- `note` TEXT nullable
- `created_at` TEXT
- `updated_at` TEXT

### `withdrawal_requests`
User withdrawal request lifecycle table.

Columns:
- `id` INTEGER PK
- `withdrawal_ref` TEXT UNIQUE
- `user_id` TEXT
- `wallet_symbol` TEXT (default `SPOT_USDT`)
- `asset_symbol` TEXT
- `network_type` TEXT nullable
- `destination_address` TEXT nullable
- `destination_label` TEXT nullable
- `amount_usd` REAL
- `fee_amount_usd` REAL (default `0`)
- `net_amount_usd` REAL
- `status` TEXT (`pending`, `approved`, `rejected`, `processing`, `completed`, `cancelled`)
- `note` TEXT nullable
- `submitted_at` TEXT
- `reviewed_at` TEXT nullable
- `reviewed_by` TEXT nullable
- `completed_at` TEXT nullable
- `created_at` TEXT
- `updated_at` TEXT

### `asset_wallet_ledger`
Unified wallet movement ledger for cross-module wallet visibility.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `ledger_ref_type` TEXT (examples: `deposit_approval`, `withdraw_request`, `withdraw_approved`, `wallet_transfer`, `wallet_convert`, `binary_settlement`, `lum_lock`, `lum_unlock`)
- `ledger_ref_id` TEXT nullable
- `wallet_symbol` TEXT
- `asset_symbol` TEXT (default `USDT`)
- `movement_type` TEXT (`credit`, `debit`, `lock`, `unlock`)
- `amount_usd` REAL
- `balance_before_usd` REAL nullable
- `balance_after_usd` REAL nullable
- `note` TEXT nullable
- `created_at` TEXT
- `created_by` TEXT nullable

### `asset_admin_audit_logs`
Admin audit trail for sensitive asset management actions.

Columns:
- `id` INTEGER PK
- `admin_user_id` TEXT
- `action_type` TEXT
- `target_type` TEXT
- `target_id` TEXT
- `note` TEXT nullable
- `created_at` TEXT

### `asset_module_settings`
Single-row settings table for wallet controls, transfer permissions, conversion permissions, and withdraw constraints.

Columns:
- `id` INTEGER PK CHECK (`id = 1`)
- `deposits_credit_wallet_symbol` TEXT (default `SPOT_USDT`)
- `withdrawals_enabled` INTEGER (`0/1`)
- `withdraw_allowed_from_spot` INTEGER (`0/1`)
- `withdraw_allowed_from_main` INTEGER (`0/1`)
- `withdraw_allowed_from_binary` INTEGER (`0/1`)
- `min_withdraw_usd` REAL
- `max_withdraw_usd` REAL nullable
- `withdraw_fee_percent` REAL
- `supported_withdraw_assets_json` TEXT (JSON array)
- `withdraw_network_map_json` TEXT (JSON object)
- `transfers_enabled` INTEGER (`0/1`)
- `convert_enabled` INTEGER (`0/1`)
- `convert_fee_percent` REAL
- `conversion_pairs_json` TEXT (JSON array; empty means unrestricted)
- `allow_spot_to_binary` INTEGER (`0/1`)
- `allow_binary_to_spot` INTEGER (`0/1`)
- `allow_spot_to_main` INTEGER (`0/1`)
- `allow_main_to_spot` INTEGER (`0/1`)
- `allow_main_to_binary` INTEGER (`0/1`)
- `allow_binary_to_main` INTEGER (`0/1`)
- `auto_create_wallet_details` INTEGER (`0/1`)
- `wallet_freeze_enabled` INTEGER (`0/1`)
- `created_at` TEXT
- `updated_at` TEXT
- `updated_by` TEXT nullable

### `wallet_freeze_rules`
Per-user per-wallet freeze policy table to block deposit/withdraw/transfer/convert at API level.

Columns:
- `id` INTEGER PK
- `user_id` TEXT
- `wallet_symbol` TEXT
- `freeze_deposit` INTEGER (`0/1`)
- `freeze_withdraw` INTEGER (`0/1`)
- `freeze_transfer` INTEGER (`0/1`)
- `freeze_convert` INTEGER (`0/1`)
- `note` TEXT nullable
- `created_at` TEXT
- `updated_at` TEXT
- `updated_by` TEXT nullable
- UNIQUE(`user_id`, `wallet_symbol`)

## Transaction Module Tables

### `convert_pairs`
User convert market pair configuration.

Columns:
- `id` INTEGER PK
- `pair_code` TEXT UNIQUE
- `display_name` TEXT
- `from_asset`, `to_asset`
- `rate_source_type` (`internal_feed`, `external_api`, `manual_admin_feed`)
- `source_symbol`
- `min_amount_usd`, `max_amount_usd`
- `fee_percent`, `spread_percent`, `fixed_fee_usd`
- `manual_rate` REAL nullable
- `is_enabled`, `display_sort_order`
- `created_at`, `updated_at`, `created_by`, `updated_by`

### `convert_orders`
Completed/failed/cancelled conversion history table.

Columns:
- `id` INTEGER PK
- `convert_ref` TEXT UNIQUE
- `user_id`
- `convert_pair_id`
- pair snapshots (`pair_code_snapshot`, `display_name_snapshot`, `from_asset_snapshot`, `to_asset_snapshot`)
- `from_amount`
- `raw_rate`, `applied_rate`
- `fee_amount`, `receive_amount`
- `status` (`pending`, `completed`, `failed`, `cancelled`)
- `note`
- `created_at`, `completed_at`, `updated_at`

### `convert_wallet_ledger`
Wallet movement entries created by convert actions.

Columns:
- `id` INTEGER PK
- `user_id`
- `convert_id`
- `ledger_type`
- `asset_symbol`
- `amount`
- `balance_before`, `balance_after`
- `note`
- `created_at`, `created_by`

### `convert_admin_audit_logs`
Admin audit logs for convert pair/rate/settings actions.

Columns:
- `id` INTEGER PK
- `admin_user_id`
- `action_type`
- `target_type`
- `target_id`
- `note`
- `created_at`

### `spot_pairs`
Spot trading pair configuration table.

Columns:
- `id` INTEGER PK
- `pair_code` TEXT UNIQUE
- `display_name`
- `base_asset`, `quote_asset`
- `price_source_type`, `source_symbol`
- `current_price`, `previous_price`
- `price_precision`, `quantity_precision`
- `min_order_size`, `max_order_size`
- `maker_fee_percent`, `taker_fee_percent`
- `is_enabled`, `is_featured`, `display_sort_order`
- `created_at`, `updated_at`, `created_by`, `updated_by`

### `spot_price_ticks`
Spot market tick history.

Columns:
- `id` INTEGER PK
- `pair_id`
- `price`
- `tick_time`
- `source_type`
- `created_at`

### `spot_orders`
User spot order table.

Columns:
- `id` INTEGER PK
- `order_ref` TEXT UNIQUE
- `user_id`, `pair_id`
- pair snapshots (`pair_code_snapshot`, `pair_display_name_snapshot`, `base_asset_snapshot`, `quote_asset_snapshot`)
- `side` (`buy`, `sell`)
- `order_type` (`market`, `limit`)
- `price`, `quantity`
- `filled_quantity`, `avg_fill_price`
- `quote_amount`, `fee_amount`, `fee_asset`
- `status` (`open`, `partially_filled`, `filled`, `cancelled`, `rejected`, `error`)
- `locked_asset_symbol`, `locked_amount`
- `note`
- `created_at`, `updated_at`, `filled_at`, `cancelled_at`

### `spot_trades`
Execution records generated from filled spot orders.

Columns:
- `id` INTEGER PK
- `trade_ref` TEXT UNIQUE
- `order_id`, `user_id`, `pair_id`
- `pair_code_snapshot`
- `side`
- `execution_price`, `execution_quantity`
- `quote_total`
- `fee_amount`, `fee_asset`
- `created_at`

### `spot_wallet_ledger`
Wallet movement ledger for spot order lock/unlock/fill events.

Columns:
- `id` INTEGER PK
- `user_id`
- `order_id` nullable
- `trade_id` nullable
- `ledger_type`
- `asset_symbol`
- `amount`
- `balance_before`, `balance_after`
- `note`
- `created_at`, `created_by`

### `spot_admin_audit_logs`
Admin audit logs for spot pair/order/feed actions.

Columns:
- `id` INTEGER PK
- `admin_user_id`
- `action_type`
- `target_type`
- `target_id`
- `note`
- `created_at`

### `transaction_engine_settings`
Singleton (`id = 1`) transaction runtime control table.

Columns:
- `transaction_module_enabled`, `convert_enabled`, `spot_enabled`
- `maintenance_mode_enabled`, `maintenance_message`
- `emergency_freeze_enabled`
- default fee/size config (`default_convert_fee_percent`, `default_convert_spread_percent`, `default_fixed_convert_fee_usd`, `default_maker_fee_percent`, `default_taker_fee_percent`, `default_min_order_size`, `default_max_order_size`)
- `manual_rate_mode_enabled`, `manual_price_mode_enabled`
- account guard flags (`require_active_account_only`, `block_suspended_users`, `block_banned_users`)
- `kyc_required_above_amount_usd` nullable
- `updated_at`, `updated_by`

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
- Assets transfer/convert/withdraw operations are executed in DB transactions and append corresponding rows in `asset_wallet_ledger`.
- Approved deposits continue to credit `SPOT_USDT` and are reflected in assets summary distribution.
- Transaction wallet snapshots aggregate alias symbols before response (`SPOTUSDT` + `SPOT_USDT`) to avoid inconsistent available balance display.
- Spot/convert pricing now auto-refreshes stale tick timestamps from the latest known pair price to keep user transaction flow operational.

### Assets user routes
Assets module exposes:
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

### Transaction user routes
Transaction module exposes:
- `GET /api/transaction/convert/pairs`
- `POST /api/transaction/convert/quote`
- `POST /api/transaction/convert/submit`
- `GET /api/transaction/convert/history`
- `GET /api/transaction/spot/pairs`
- `GET /api/transaction/spot/market-summary`
- `GET /api/transaction/spot/ticks`
- `GET /api/transaction/spot/recent-trades`
- `POST /api/transaction/spot/order/place`
- `GET /api/transaction/spot/orders/open`
- `GET /api/transaction/spot/orders/history`
- `POST /api/transaction/spot/order/cancel`
- `GET /api/transaction/spot/orderbook`

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

Assets integration changes:
- Added assets backend module: `server/assets-module.js`.
- Added new DB tables:
  - `wallet_transfer_requests`
  - `wallet_conversion_requests`
  - `withdrawal_requests`
  - `asset_wallet_ledger`
- Added user-level assets API endpoints under `/api/assets/*`.
