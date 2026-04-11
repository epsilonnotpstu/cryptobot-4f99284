# Project Structure Map

_Last updated: 2026-04-10_

This file gives a high-level map of the CryptoBot codebase so future prompts can quickly target the right module.

## Root

- `package.json` / `package-lock.json`: scripts, dependencies
- `vite.config.js`: Vite config (frontend + dev server config)
- `vercel.json`: deployment routing/runtime config
- `capacitor.config.json`: mobile bridge config
- `index.html`: SPA root

## Frontend (`src/`)

- `src/main.jsx`: app bootstrap
- `src/App.jsx`: top-level routing + auth service wrapper + app/admin flow wiring
- `src/styles.css`: global website/auth styles

### User App (`src/features/dashboard/`)

- `PremiumDashboardPage.jsx`: main logged-in user dashboard
- `DepositPage.jsx`: separate deposit flow page
  - asset select
  - deposit address + QR + copy action
  - amount + screenshot upload + submit
  - records view
- `premium-dashboard.css`: styles for dashboard + deposit page

### LUM Module (`src/features/lum/`)

- `LUMPage.jsx`: dedicated LUM center page
- `LUMSummaryCard.jsx`: custodial/expected/return summary card
- `LUMPlanTabs.jsx`: LUM vs Mining tabs
- `LUMPlanCard.jsx`: plan listing card UI
- `LUMPlanDetailModal.jsx`: plan detail + pledge/risk information
- `LUMInvestModal.jsx`: investment amount + projection + confirm flow
- `LUMEntrustModal.jsx`: active/completed/pending investment history
- `LUMInvestmentTable.jsx`: reusable investment table
- `LUMInfoModal.jsx`: pledge/risk info modal
- `lum-utils.js`: format/projection helpers
- `lum.css`: LUM-specific styles

### Binary Module (`src/features/binary/`)

- `BinaryPage.jsx`: dedicated Binary Options page (chart, periods, amount, trade flow)
- `BinaryHeader.jsx`: pair selector + live price + refresh/history actions
- `BinaryChartCard.jsx`: synchronized tick chart card
- `BinaryDirectionToggle.jsx`: Long/Short selector
- `BinaryPeriodSelector.jsx`: payout period picker
- `BinaryAmountCard.jsx`: stake input, slider, quick %, projection summary
- `BinaryActiveTradeModal.jsx`: active trade countdown + details
- `BinaryResultModal.jsx`: settled result modal (win/loss/draw)
- `BinaryRecordsSection.jsx`: filterable binary trade history
- `binary-utils.js`: formatting/projection/countdown helpers
- `binary.css`: Binary-specific styles

### Admin App (`src/admin/`)

- `AdminSectionPage.jsx`: admin auth/session state + data orchestration + handlers
- `admin-section.css`: admin UI styles
- `constants.js`: sidebar items, tabs, static chart fallback data

#### Admin Components (`src/admin/components/`)

- `AdminAuthPage.jsx`: admin login/signup UI
- `AdminDashboardPage.jsx`: admin shell, sidebar, section router
- `UserManagementPage.jsx`: user list/search/filter/detail/delete
- `KycReviewPage.jsx`: KYC request review queue + media preview + decisions
- `DepositManagementPage.jsx`: deposit asset CRUD + deposit request review
- `LUMManagementPage.jsx`: LUM plan studio + investment desk + content editor (admin)
- `BinaryManagementPage.jsx`: binary control center (engine/outcome mode), pair desk, period rules, trade desk

#### Admin Utils (`src/admin/utils/`)

- `storage.js`: local session persistence helpers
- `format.js`: admin UI formatting helpers

## Backend (`server/`)

- `server/index.js`: Express API + SQLite schema/init + auth + admin actions
- `server/lum-module.js`: LUM schema bootstrap + wallet-lock logic + settlement + user/admin LUM handlers
- `server/binary-module.js`: Binary schema bootstrap + tick engine + trade open/settlement + user/admin Binary handlers
- `server/data/auth.sqlite`: primary database file
- `server/data/auth.sqlite-wal`, `server/data/auth.sqlite-shm`: SQLite WAL files

## Serverless API Layer (`api/`)

- `api/index.js`: root API entry
- `api/health.js`: health check endpoint
- `api/auth/*`: route adapters for auth/gateway operations
- `api/_shared/handleExpressRoute.js`: shared route bridge

## Docs (`docs/`)

- `database-structure.md`: full DB schema + API-data notes
- `admin-database-structure.md`: admin/user separation + admin-focused DB notes
- `project-structure-map.md`: this project structure guide

## Mobile Projects

- `android/`: Android Capacitor project files
- `ios/`: iOS Capacitor project files

## Notable Runtime Data Files

- `.env`, `.env.local`, `.env.example`: environment settings
- `.vercel/`: local Vercel project linkage/output metadata
