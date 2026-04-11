ebar cryptobot apps or web er dashboard page er lum section intigrate korar pala.
ami tomake master prompt likhe dicchi. tmi oivabe kaj korba. 
prompt e database theke file structure everything ache. but tmi kheyal rakhba, lum section intigrate korte giye amar main project jno nosto na hoye jai. database er modification er impact e jno main project nosto na hoye jai. and file structure prompt e thik thak nao thakte pare. tmi lum er jonno alada file banaba and suitable jaigai place koba. jehetu prompt jane na amar file structure niy.

and prompt er sobkichu porba and functional jno hoy seita kheyal rakhba. and amar main project jno nosto na hoy. 

lum intigration er jonno admin section e je effect gulo porbe and amin section e lum management korar jonno ki ki korte hobe, seita next prompt e tmi admin section e kore diba. 
lum page er ui/ ux er theme hobe existing crptobot appr/web er motoi. 
ami tomake kichu screen shot dicchi tmi eitar refarence nibe. and tmi chaile tomar iccha moto modification korte paro jeta suitable hobe total project er jonno. 

photo 1 - user dashboard and lum(already ache dashoboard feature.)
photo 2-  after clicking lum this page open.and lum plans section shows.
photo 3: after pressing mining palns
photo 4 and 5- after clicking entrust button .
You are working inside my existing CryptoBot project.

Your task is to implement a FULLY FUNCTIONAL “LUM” module end-to-end for both web/app dashboard and admin panel, integrated into my existing SQLite backend and React JSX frontend.

Important:
- Do NOT create a disconnected demo.
- Do NOT create mock-only UI.
- Do NOT break existing auth, deposit, KYC, wallet, admin, or dashboard flows.
- Reuse my current project patterns, file structure, API style, database connection style, admin action style, and dashboard UI conventions.
- Frontend must visually match my existing project UI/UX as closely as possible.
- My frontend screenshot references will be provided separately, so adapt styles to existing components.
- My backend already uses SQLite database: server/data/auth.sqlite
- Existing core tables already include:
  - users
  - otp_codes
  - sessions
  - password_reset_tokens
  - kyc_submissions
  - platform_notices
  - deposit_assets
  - deposit_requests
  - user_wallet_balances
- Existing project already has user dashboard, deposit flow, admin panel, KYC review flow, and wallet summary flow.
- Keep all existing functionality working.

==================================================
GOAL
==================================================

Build a production-style LUM feature inside the existing project.

The LUM module must support:
1. LUM dashboard summary
2. LUM plans tab
3. Mining plans tab
4. Entrust / My Investment modal or page
5. Active investment tracking
6. Completed investment history
7. Pending / escrow orders
8. Profit calculation engine
9. Maturity settlement
10. Admin plan management
11. Admin investment monitoring
12. Notice / pledge info modal
13. Wallet locking and release flow
14. Proper DB-backed API endpoints
15. Full integration with existing user_wallet_balances

==================================================
BUSINESS UNDERSTANDING
==================================================

Interpret LUM as a branded investment / custodial / lockup / earning product inside the app.

User flow:
- User opens LUM section from dashboard.
- User sees summary cards like:
  - Custodial Funds
  - Today Expected
  - Total Return
  - Order Escrow
- User sees two tabs:
  - LUM Plans
  - Mining Plans
- Each plan has:
  - title
  - minimum amount
  - return rate
  - return type
  - cycle days
  - payout rule
  - buy button
- User can click Buy to create an investment order.
- User balance is checked.
- Amount is moved from available wallet into locked/escrowed state.
- Order becomes pending or active depending on configuration.
- Rewards are calculated by rules.
- On maturity:
  - principal is released
  - reward is credited
  - order becomes completed
- Entrust button shows investment history and active/completed orders.

Important:
This module must not claim fake guarantees in code comments or labels.
All labels should be operationally clear:
- “Estimated Profit”
- “Expected Return”
- “Locked Amount”
- “Maturity Amount”
- “Cycle Days”
- “Return Type”
- “Payout Type”
- “Status”

==================================================
REQUIRED FUNCTIONAL UI SECTIONS
==================================================

Implement the following user-facing LUM screen:

A. Top summary section
- Custodial Funds
- Today Expected
- Total Return
- Order Escrow
- Entrust button

B. Tabs
- LUM Plans
- Mining Plans

C. Plan cards
Each plan card must show:
- Plan Name
- Category
- Minimum Amount
- Return Rate
- Return Type label
- Cycle Days
- Currency
- Buy button
- Optional badge if popular / featured / sale

D. Buy flow
On Buy click:
- open modal or route to plan details
- show complete plan information
- show risk/lock note
- show user available wallet balance
- input investment amount
- validate amount
- calculate estimated profit
- show maturity total
- confirm investment
- submit to backend

E. Entrust / My Investment screen
Must show at least these sections:
1. Active Investments
2. Completed Investments
3. Pending / Escrow Investments

Each row should show:
- Plan Name
- Category
- Invest Date
- Invest Amount
- Profit Amount
- Total Return
- Status
- Start At
- End At
- Remaining Days (for active)
- Order Reference

F. Pledge / Mining Information modal
Like the screenshot concept, add an informational modal/page that explains:
- Pledge currency
- Reward settlement currency
- Lock-up behavior
- Midway redeem policy
- Reservation / quota rule if enabled
- Risk and explanation text
Admin-configurable content is preferred.

==================================================
BUTTON FUNCTIONALITY – EVERY BUTTON MUST WORK
==================================================

Implement all LUM-related buttons and interactions.

1. LUM section entry button
- opens LUM dashboard page/section.

2. Entrust button
- opens My Investment modal/page.
- must load:
  - active investments
  - completed investments
  - pending/escrow investments
  - summary metrics

3. LUM Plans tab button
- loads all active plans where category = 'lum'

4. Mining Plans tab button
- loads all active plans where category = 'mining'

5. Buy button
- opens plan purchase modal/page
- calculates estimate
- validates wallet balance and min amount
- creates investment order

6. Confirm Buy / Confirm Invest button
- sends API request
- creates DB records
- updates wallet
- stores transaction log
- returns updated summary

7. Close modal buttons
- close correctly without page break

8. Optional filter buttons in My Investment
- All
- Active
- Completed
- Pending

9. Admin buttons
- Create Plan
- Update Plan
- Activate / Disable Plan
- Delete Plan (soft delete preferred)
- Review investment orders
- Approve / Reject pending order if review mode is enabled
- Force settle / mark completed only if explicitly admin-enabled and with audit logging

==================================================
DATABASE DESIGN
==================================================

Use my existing SQLite DB and extend it safely.
Do not remove or break current tables.

Create new tables for LUM module.

1. lum_plans
Columns:
- id INTEGER PK
- plan_code TEXT UNIQUE
- category TEXT CHECK category IN ('lum','mining')
- title TEXT NOT NULL
- short_description TEXT
- details_html TEXT
- currency TEXT NOT NULL DEFAULT 'USDT'
- minimum_amount_usd REAL NOT NULL DEFAULT 0
- maximum_amount_usd REAL NULL
- return_rate REAL NOT NULL
- return_type TEXT NOT NULL
  Allowed:
  - 'daily_percent'
  - 'cycle_percent'
  - 'fixed_amount'
  - 'apr_percent'
- cycle_days INTEGER NOT NULL
- payout_type TEXT NOT NULL
  Allowed:
  - 'on_maturity'
  - 'daily_credit'
  - 'manual_settlement'
- lock_principal INTEGER NOT NULL DEFAULT 1
- allow_early_redeem INTEGER NOT NULL DEFAULT 0
- early_redeem_penalty_percent REAL NOT NULL DEFAULT 0
- requires_admin_review INTEGER NOT NULL DEFAULT 0
- quota_limit INTEGER NULL
- quota_used INTEGER NOT NULL DEFAULT 0
- is_featured INTEGER NOT NULL DEFAULT 0
- badge_label TEXT NULL
- display_sort_order INTEGER NOT NULL DEFAULT 0
- status TEXT NOT NULL DEFAULT 'active'
  Allowed:
  - 'draft'
  - 'active'
  - 'disabled'
  - 'archived'
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- created_by TEXT NULL
- updated_by TEXT NULL

2. lum_plan_contents
For informational modal / pledge details / localized content
Columns:
- id INTEGER PK
- plan_id INTEGER NOT NULL
- content_type TEXT NOT NULL
  Examples:
  - 'pledge_info'
  - 'risk_notice'
  - 'faq'
  - 'terms'
- title TEXT
- body_text TEXT
- sort_order INTEGER NOT NULL DEFAULT 0
- is_active INTEGER NOT NULL DEFAULT 1
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

3. lum_investments
Main investment order table
Columns:
- id INTEGER PK
- investment_ref TEXT UNIQUE NOT NULL
- user_id TEXT NOT NULL
- plan_id INTEGER NOT NULL
- plan_code_snapshot TEXT NOT NULL
- plan_title_snapshot TEXT NOT NULL
- category_snapshot TEXT NOT NULL
- currency_snapshot TEXT NOT NULL DEFAULT 'USDT'
- invested_amount_usd REAL NOT NULL
- return_rate_snapshot REAL NOT NULL
- return_type_snapshot TEXT NOT NULL
- payout_type_snapshot TEXT NOT NULL
- cycle_days_snapshot INTEGER NOT NULL
- expected_profit_usd REAL NOT NULL DEFAULT 0
- expected_total_return_usd REAL NOT NULL DEFAULT 0
- accrued_profit_usd REAL NOT NULL DEFAULT 0
- settled_profit_usd REAL NOT NULL DEFAULT 0
- settled_total_return_usd REAL NOT NULL DEFAULT 0
- locked_principal_usd REAL NOT NULL DEFAULT 0
- wallet_asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- status TEXT NOT NULL
  Allowed:
  - 'pending'
  - 'active'
  - 'completed'
  - 'rejected'
  - 'cancelled'
  - 'redeemed_early'
- review_note TEXT NULL
- started_at TEXT NULL
- ends_at TEXT NULL
- settled_at TEXT NULL
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- reviewed_at TEXT NULL
- reviewed_by TEXT NULL

4. lum_investment_rewards
Reward ledger per investment
Columns:
- id INTEGER PK
- investment_id INTEGER NOT NULL
- reward_date TEXT NOT NULL
- reward_amount_usd REAL NOT NULL
- reward_type TEXT NOT NULL
  Examples:
  - 'daily'
  - 'maturity'
  - 'manual_adjustment'
- status TEXT NOT NULL
  Allowed:
  - 'pending'
  - 'credited'
  - 'void'
- created_at TEXT NOT NULL
- credited_at TEXT NULL
- note TEXT NULL

5. lum_wallet_ledger
Financial ledger for LUM-related wallet state changes
Columns:
- id INTEGER PK
- user_id TEXT NOT NULL
- investment_id INTEGER NULL
- ledger_type TEXT NOT NULL
  Allowed:
  - 'lock'
  - 'unlock'
  - 'reward_credit'
  - 'principal_return'
  - 'early_redeem_penalty'
  - 'manual_adjustment'
- asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- amount_usd REAL NOT NULL
- balance_before_usd REAL NULL
- balance_after_usd REAL NULL
- note TEXT NULL
- created_at TEXT NOT NULL
- created_by TEXT NULL

6. user_wallet_balance_details
Because existing user_wallet_balances has only total_usd, extend wallet accounting cleanly.
Create this detail table instead of breaking existing table.
Columns:
- id INTEGER PK
- user_id TEXT NOT NULL
- asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- available_usd REAL NOT NULL DEFAULT 0
- locked_usd REAL NOT NULL DEFAULT 0
- reward_earned_usd REAL NOT NULL DEFAULT 0
- updated_at TEXT NOT NULL
- UNIQUE(user_id, asset_symbol)

7. lum_admin_audit_logs
Columns:
- id INTEGER PK
- admin_user_id TEXT NOT NULL
- action_type TEXT NOT NULL
- target_type TEXT NOT NULL
- target_id TEXT NOT NULL
- note TEXT
- created_at TEXT NOT NULL

==================================================
IMPORTANT DB INTEGRATION RULES
==================================================

1. Keep existing user_wallet_balances table working because dashboard already depends on it.
2. Add user_wallet_balance_details for precise available/locked accounting.
3. Sync user_wallet_balances.total_usd = available_usd + locked_usd
4. Always use DB transactions when:
   - creating investment
   - locking wallet balance
   - settling maturity
   - rejecting order after lock
   - early redemption
   - reward credit
5. Never calculate old investment data from current plan values. Always use snapshot values stored in lum_investments.

==================================================
MATH / CALCULATION RULES
==================================================

Implement exact helper functions for all supported return models.

A. daily_percent
Formula:
- daily_profit = invested_amount * (return_rate / 100)
- total_profit = daily_profit * cycle_days
- maturity_total = invested_amount + total_profit

Example:
invested_amount = 5000
return_rate = 0.5
cycle_days = 14

daily_profit = 5000 * 0.5 / 100 = 25
total_profit = 25 * 14 = 350
maturity_total = 5000 + 350 = 5350

B. cycle_percent
Formula:
- total_profit = invested_amount * (return_rate / 100)
- maturity_total = invested_amount + total_profit

Example:
invested_amount = 100
return_rate = 2
total_profit = 100 * 2 / 100 = 2
maturity_total = 102

C. fixed_amount
Formula:
- total_profit = return_rate
- maturity_total = invested_amount + total_profit

D. apr_percent
Formula:
- daily_rate = apr / 365
- total_profit = invested_amount * ((apr / 100) / 365) * cycle_days
- maturity_total = invested_amount + total_profit

Round all displayed money values to 2 decimal places.
Store raw REAL values, but ensure consistent rounding in API responses and UI.

Also compute:
- today_expected
- total_return
- custodial_funds
- order_escrow

Definitions:
- custodial_funds = sum(locked_principal_usd for active + pending investments)
- today_expected:
  if payout_type = daily_credit, sum today daily rewards
  else show estimated daily accrual using active investments
- total_return:
  sum(settled_profit_usd) + optionally accrued_profit_usd depending on UI card meaning
  Implement both:
  - total_return_realized
  - total_return_estimated
- order_escrow = sum(invested_amount_usd for pending investments)

==================================================
INVESTMENT LIFECYCLE
==================================================

Implement the full lifecycle.

1. Draft plan
Admin creates plan in draft status.

2. Active plan
Admin activates plan. User can view and buy.

3. User submits investment
System validates:
- authenticated session
- account_status = active
- if required: kyc_status authenticated
- plan status active
- amount >= minimum
- amount <= maximum if set
- user has enough available wallet balance
- quota not exceeded if quota_limit exists

4. On investment creation
Inside DB transaction:
- fetch wallet detail row
- ensure available_usd sufficient
- subtract amount from available_usd
- add amount to locked_usd
- sync total_usd
- create lum_investments row
- create lum_wallet_ledger row type lock
- increment quota_used if applicable
- set status:
  - pending if requires_admin_review = 1
  - active otherwise
- if active:
  - set started_at = now
  - set ends_at = now + cycle_days
- if payout_type = daily_credit and status active:
  prepare reward schedule logic or dynamic accrual logic

5. Pending review flow
If plan requires admin review:
- investment remains pending
- amount remains locked
- admin can approve:
  - set status active
  - set started_at / ends_at
- admin can reject:
  - set status rejected
  - release locked amount back to available
  - create unlock ledger

6. Active period
- active investments accrue profit based on formula
- active investments show:
  - accrued profit so far
  - expected maturity amount
  - days remaining

7. Maturity
When current time >= ends_at:
- mark investment completed
- principal unlock
- reward credit
- settled fields update
- create ledger rows:
  - principal_return
  - reward_credit
- update wallet details and summary table

8. Early redemption
If allow_early_redeem = 1:
- compute accrued eligible amount
- apply penalty if configured
- return principal minus penalty if needed
- update status = redeemed_early
- audit log action

==================================================
SCHEDULER / SETTLEMENT LOGIC
==================================================

Implement a backend-safe settlement strategy.

Preferred:
- create a reusable settlement service function
- run it:
  1. on relevant API reads for the current user
  2. on admin investment page reads
  3. optionally on server startup / periodic interval if project already has task runner

Need functions:
- settleMaturedInvestments()
- settleInvestmentById(id)
- updateAccruedProfitForActiveInvestment(investment)
- calculateInvestmentProjection(input)

Because SQLite project may not have a background worker, ensure maturity settlement is still triggered lazily when:
- user opens LUM page
- user opens Entrust history
- admin opens LUM investments page

==================================================
REQUIRED API ENDPOINTS
==================================================

Implement endpoints matching my existing project backend style.

User endpoints:
1. GET /api/lum/summary
Returns:
- custodialFunds
- todayExpected
- totalReturnRealized
- totalReturnEstimated
- orderEscrow
- activeCount
- completedCount
- pendingCount

2. GET /api/lum/plans
Query params:
- category=lum|mining|all
- status=active
Returns visible plan list.

3. GET /api/lum/plans/:id
Returns full plan details + pledge info + calculator defaults.

4. POST /api/lum/invest
Body:
- planId
- amountUsd
Creates new investment order.

5. GET /api/lum/investments
Query params:
- status=all|active|completed|pending|rejected|redeemed_early
- category=lum|mining|all
- page
- limit

6. GET /api/lum/investments/:id
Returns full investment details.

7. GET /api/lum/entrust
Returns grouped object:
- summary
- activeInvestments
- completedInvestments
- pendingInvestments

8. GET /api/lum/info
Returns global informational text blocks / FAQs / pledge explanation

Admin endpoints:
9. GET /api/admin/lum/plans
10. POST /api/admin/lum/plans/create
11. POST /api/admin/lum/plans/update
12. POST /api/admin/lum/plans/delete
13. POST /api/admin/lum/plans/toggle-status
14. GET /api/admin/lum/investments
15. POST /api/admin/lum/investments/review
16. POST /api/admin/lum/investments/force-settle
17. GET /api/admin/lum/dashboard-summary
18. POST /api/admin/lum/content/save

All admin routes must follow existing admin auth/role checks.

==================================================
RESPONSE SHAPE
==================================================

Make API responses consistent with existing project style.

Use shape:
{
  ok: true,
  data: ...
}

or existing project convention if already different.
Stay consistent with the existing codebase.

Validation errors:
{
  ok: false,
  error: "Human readable message"
}

==================================================
FRONTEND IMPLEMENTATION
==================================================

Implement React JSX components integrated into existing dashboard structure.

User components to create/update:
- LUMPage.jsx
- LUMSummaryCard.jsx
- LUMPlanTabs.jsx
- LUMPlanCard.jsx
- LUMPlanDetailModal.jsx
- LUMInvestModal.jsx
- LUMEntrustModal.jsx
- LUMInvestmentTable.jsx
- LUMInfoModal.jsx

Admin components:
- AdminLUMManagementPage.jsx
- AdminLUMPlanForm.jsx
- AdminLUMPlanTable.jsx
- AdminLUMInvestmentTable.jsx
- AdminLUMContentEditor.jsx

Frontend behavior requirements:
- load summary on page open
- load plans by selected tab
- open buy modal on Buy click
- open entrust modal on Entrust click
- show loading states
- show empty states
- show API error states
- refresh summary after successful investment
- refresh tables after settlement/review
- format money consistently
- format date/time consistently
- status badges must be color-coded:
  - pending
  - active
  - completed
  - rejected
  - redeemed_early

==================================================
UI DETAILS TO MATCH THE APP
==================================================

Style the LUM page so it matches my current crypto dashboard aesthetic:
- yellow/gold header cards
- rounded white cards
- mobile-first layout
- button styles consistent with existing dashboard
- minimal visual break from rest of app
- summary numbers in bold
- tab switcher for LUM Plans / Mining Plans
- table or list in My Investment modal
- optional horizontal scroll for dense data
- use same typography scale and spacing style as existing project

Do not redesign my whole app.
Only integrate the LUM module in harmony with current design.

==================================================
ADMIN PANEL FEATURES
==================================================

Admin must be able to:
- create plans
- edit plans
- disable plans
- archive plans
- manage badge labels
- set minimum/maximum amount
- choose return_type
- choose payout_type
- set cycle_days
- set review requirement
- set early redeem rules
- edit pledge info / risk notice / FAQ content
- view all investments
- filter by status/category/date/user
- approve/reject pending investments
- view totals:
  - total active locked
  - total completed return
  - pending orders count
  - today estimated payout
- log every sensitive action into lum_admin_audit_logs

==================================================
DATA ACCESS / WALLET INTEGRATION
==================================================

Existing wallet integration rules:
- Reuse existing authenticated user identity from sessions/users.
- Reuse user_id business key, not only integer id, where existing code does that.
- Wallet funding source comes from the existing user wallet data.
- Existing user_wallet_balances is already used by dashboard, so do not replace it.
- Add and sync user_wallet_balance_details.
- If detail row does not exist for a user/asset, create one from existing total_usd value as:
  - available_usd = total_usd
  - locked_usd = 0
  - reward_earned_usd = 0

==================================================
SPECIAL CALCULATION EXAMPLES TO SUPPORT
==================================================

Make sure these examples work exactly.

Example 1:
Plan type: daily_percent
Amount: 5000
Rate: 0.5
Cycle: 14 days
Profit: 350
Total Return: 5350

Example 2:
Plan type: cycle_percent
Amount: 100
Rate: 2
Cycle: any fixed cycle, but total profit = 2
Total Return: 102

Example 3:
Plan type: daily_percent
Amount: 100000
Rate: 0.9
Cycle: 91
Daily Profit = 900
Total Profit = 81900
Maturity Total = 181900

Example 4:
Plan type: daily_percent
Amount: 50000
Rate: 0.7
Cycle: 36
Daily Profit = 350
Total Profit = 12600
Maturity Total = 62600

==================================================
IMPLEMENTATION ORDER
==================================================

Do the work in this order:

1. Inspect existing backend structure and routing patterns.
2. Inspect how DB migrations/schema bootstrap is currently handled.
3. Add new SQLite schema safely.
4. Add reusable LUM service layer.
5. Add wallet sync helper utilities.
6. Add user API routes.
7. Add admin API routes.
8. Add settlement logic.
9. Add frontend user pages/components.
10. Add admin UI.
11. Wire dashboard LUM entry button.
12. Test end-to-end flow.

==================================================
END-TO-END TEST CASES
==================================================

Implement and verify these scenarios in code:

1. User with enough balance buys active LUM plan successfully.
2. User with insufficient balance gets validation error.
3. User below minimum amount gets blocked.
4. Pending-review plan locks funds and waits for admin.
5. Admin approves pending order and it becomes active.
6. Admin rejects pending order and funds return.
7. Active investment matures and settles correctly.
8. Entrust modal shows completed profit history correctly.
9. Summary cards update after investment and after maturity.
10. Plan changes do not affect old investment history because of snapshots.

==================================================
OUTPUT FORMAT
==================================================

Now implement this directly inside the existing project.

I want actual code changes, not just explanation.

For every file you create or modify:
- preserve existing project conventions
- include complete code
- keep code runnable
- avoid pseudo-code
- avoid TODO placeholders unless absolutely necessary
- if a helper exists, reuse it instead of duplicating

At the end, provide:
1. list of files created/updated
2. schema changes
3. API routes added
4. how the wallet sync works
5. how summary math works
6. how to test the feature manually

If the current codebase already has similar utilities, adapt to them instead of building a parallel architecture.





ekon amra cryptobot apps or web e  binary option section ta implement korbo. ager motoi ami tomake screenshot and master prompt diye dibo oikhane sob e ache.  

ebar direct asol kothai asi. prompt e sobkicu bola ache. tmi segula dekhba. and at first ui/ux design and button box and others elements arrengement er bepare tmi jeta best bole mone hoy and user friendly bole mone hoy seitai korba.
and apps er screenshot to ami tomake dicchi e . segula tmi dekhba. oita reference hisabe. and tmi tomar moto kore jevabe design kole amar apps er theme er shate sync hoy seivabe korbe.

and the most important kota. ei binary option section tar somosto control admin section theke hobe. and tar cheyeo sobcheye boro kotha, and important jinis, admin section e admin er kache ekta option thakbe tred sobsomoy win korte chai naki loss kore rakhte chai. mane admin jdi win kore rakhe, tahole user tred korlei win hobe always. and admin jdi loss kore rakhe tahole always loss e hobe. ami tomake eita janai rakhlam. admin section er design and admin section impliments porer chat prompt e intigrate korbo .


binary options full feature intrigate korar somoy main database section and project structure er dike kheyal rakhbe. project jno nosto na hoye jai. and others kono functionality jno nosto na hoye jai and kaj na kore.

and eikhane win hobar por user er binary wallet e tk joma hobe. 

3 type er wallet thakbe. 1. spot wallet, 2.main wallet 3. binary wallet. database e ektu cheek koro koy type er wallet er kotha bola. 3 type er bola na thakle 3 type er kore dao. and deposite tk spot wallet e jabe ei feature add kore dao. amra pore assets section e eita puropuri clear kore intigrate korbone.

arekta main jinis, amar system e jotogula deposite type er crypto thakbe seigula theke user chiose kore user binary tred korbe and also sei crypto er live graph jno  thake, emn feature jno thake. eita hoyto prompt e bola nai. bola ache kina cheek kore deikho. na bola thakle ei jinis ta intigrate kore implement koiro. 

ui/ux and designing er dike besi kheyal rekho. and master prompt ta te sob functionality bola ache segula deikho and ami tomake ja ja bollam segula most valuable intigrate korba,

You are working inside my existing CryptoBot project.

Your task is to implement a FULLY FUNCTIONAL Binary Options module end-to-end, integrated into my current React JSX frontend, Express backend, and SQLite database.

IMPORTANT:
- Do NOT build a disconnected demo.
- Do NOT create a fake static UI.
- Do NOT break existing auth, KYC, deposit, wallet, LUM, dashboard, or admin flows.
- Reuse my current code style, routing style, SQLite bootstrap style, auth/session checks, wallet helpers, admin action patterns, and UI structure.
- My frontend already has dashboard and dedicated LUM module pages.
- My backend already has server/index.js and server/lum-module.js.
- My app already uses SQLite database server/data/auth.sqlite.
- My project already contains a user app, admin app, and a dedicated LUM module.
- Binary Options must be integrated as a real module within this existing project.

==================================================
PROJECT CONTEXT YOU MUST RESPECT
==================================================

Frontend structure already exists roughly like this:
- src/App.jsx
- src/features/dashboard/PremiumDashboardPage.jsx
- src/features/dashboard/DepositPage.jsx
- src/features/lum/*
- src/admin/*
- src/styles.css
- src/features/dashboard/premium-dashboard.css

Backend structure already exists roughly like this:
- server/index.js
- server/lum-module.js
- server/data/auth.sqlite

LUM backend and wallet detail model already exist.
You must inspect and reuse existing helpers and conventions before writing new code.

Existing DB context:
- users
- sessions
- kyc_submissions
- deposit_assets
- deposit_requests
- user_wallet_balances
- LUM tables already added:
  - lum_plans
  - lum_plan_contents
  - lum_investments
  - lum_investment_rewards
  - lum_wallet_ledger
  - user_wallet_balance_details
  - lum_admin_audit_logs

Binary Options must integrate with this existing wallet/account/session system.
Do not replace wallet architecture.

==================================================
GOAL
==================================================

Build a production-style Binary Options / Fixed-Time Trade module.

The module must support:
1. Binary options page
2. Real-time or simulated live chart feed
3. Pair selection
4. Long / Short direction selection
5. Period selection (30s / 60s / 90s / 120s / 300s or admin-configurable)
6. Payout percentage per period
7. Wallet-based stake amount selection
8. Slider-based amount allocation
9. Quick amount buttons
10. Expected profit + total payout calculation
11. Trade confirmation
12. Active trade countdown
13. Trade settlement
14. Win / loss result modal
15. Trade history records
16. Admin control over payout configuration
17. Admin trade monitoring
18. Admin pair management
19. Admin chart source / binary engine configuration
20. Full SQLite-backed persistence

==================================================
BUSINESS INTERPRETATION
==================================================

Interpret this Binary Options section as a fixed-time directional prediction module.

User selects:
- a trading pair (example BTC/USDT)
- a direction:
  - Long = price will close above entry price
  - Short = price will close below entry price
- a period:
  - example 30s, 60s, 90s, 120s, 300s
- a stake amount

Trade logic:
- At trade open, system stores entry price.
- At expiry, system fetches settlement/close price.
- If user prediction is correct:
  - user receives profit based on configured payout rate
- If prediction is wrong:
  - user loses stake, unless refund ratio is configured
- If price equals entry exactly:
  - configurable behavior:
    - draw / refund
    - or house rule
Default should be draw/refund for fairness unless existing project requirements say otherwise.

This is NOT a spot trade.
This is NOT a futures order.
This is a fixed-time directional prediction contract.

==================================================
MODULE ENTRY + NAVIGATION
==================================================

Integrate Binary Options module into the existing user dashboard and bottom navigation.

Expected entry points:
- Dashboard quick action: Binary / Binary Options
- Footer nav item: Binary Options

When user opens Binary Options, route them to a dedicated Binary page matching current app design language.

Create/update components to support:
- main Binary page
- active trade modal
- result modal
- trade history panel
- pair selector
- chart panel
- amount selector
- direction selector
- period selector

==================================================
USER-FACING UI SECTIONS
==================================================

Build the Binary page with these fully working sections.

A. Header section
- Selected pair
- Current live price
- Optional pair change button
- Optional timer/history shortcut

B. Chart section
- Price chart for selected pair
- Must show recent movement
- Should support line chart at minimum
- If existing UI libs support it, optionally allow candlestick later
- Must visibly update over time
- Must use the same source as settlement price logic or a clearly synchronized source

C. Direction selector
- Long button
- Short button
- Selected state styling
- Must stay consistent in wording across the module
Use one terminology system consistently:
Preferred:
- Long / Short
Do not mix with High / Low in one screen unless you explicitly map both labels.

D. Period selector
- 30 sec
- 60 sec
- 90 sec
- 120 sec
- 300 sec
Each item must show:
- label
- payout percentage

These periods and payout percentages should be admin-configurable from DB, not hardcoded only.

E. Amount selection card
- Minimum limit
- User binary wallet balance
- Estimated profit
- Estimated total payout
- Slider from 0% to 100%
- Large visual percentage bar
- Quick buttons:
  - 10%
  - 25%
  - 50%
  - 75%
  - Max
- Manual amount input
- Currency chip (USDT)

F. Action section
- Big Long trade button OR Big Short trade button depending on selected direction
- Optional confirmation modal before final placement

G. Active trade modal
When a trade is opened, show:
- Pair
- Direction
- Amount
- Period
- Entry price
- Expected profit
- Countdown
- Optional progress ring/progress bar

H. Settlement / result modal
After expiry:
- Win / Loss / Draw label
- Profit or loss amount
- Entry price
- Settlement price
- Direction
- Period
- Stake amount
- Wallet after settlement
- Optional “Trade Again” button

I. Records / trade history section
Each row/card must show:
- Pair
- Direction
- Entry price
- Settlement price
- Period
- Stake amount
- Payout percentage
- Expected profit
- Realized PnL
- Result status
- Opened at
- Settled at

==================================================
EVERY USER INTERACTION MUST WORK
==================================================

Implement all binary-related buttons and controls.

1. Binary section open
- open Binary page

2. Pair switch button
- allow changing current pair

3. Long button
- select Long direction

4. Short button
- select Short direction

5. Period button click
- updates selected period
- updates payout percentage
- updates estimate calculations

6. Slider move
- updates selected stake amount dynamically

7. Quick amount buttons
- updates amount and slider

8. Manual amount input
- updates slider and expected values

9. Trade button
- validates
- opens confirm or directly places trade

10. Confirm trade button
- creates binary trade
- locks stake amount
- starts countdown

11. Close active modal button
- closes cleanly without losing trade state

12. Result modal close button
- closes cleanly and refreshes wallet + records

13. Records filter tabs
- All
- Active
- Won
- Lost
- Draw
- Cancelled if needed

14. Admin create pair
15. Admin update pair
16. Admin enable/disable pair
17. Admin create payout rule
18. Admin update payout rule
19. Admin monitor active trades
20. Admin settle / cancel trade only if explicitly allowed and logged

==================================================
DATABASE DESIGN
==================================================

Extend the existing SQLite DB safely.
Do not remove or break existing tables.
Reuse existing wallet summary and wallet detail logic.

Create these new tables.

1. binary_pairs
Columns:
- id INTEGER PRIMARY KEY
- pair_code TEXT UNIQUE NOT NULL
  Example: BTCUSDT
- display_name TEXT NOT NULL
  Example: BTC/USDT
- base_asset TEXT NOT NULL
- quote_asset TEXT NOT NULL
- price_source_type TEXT NOT NULL DEFAULT 'internal_feed'
  Allowed:
  - 'internal_feed'
  - 'external_api'
  - 'manual_admin_feed'
- source_symbol TEXT NULL
- current_price REAL NOT NULL DEFAULT 0
- previous_price REAL NOT NULL DEFAULT 0
- price_precision INTEGER NOT NULL DEFAULT 2
- chart_timeframe_label TEXT NOT NULL DEFAULT '1s'
- is_enabled INTEGER NOT NULL DEFAULT 1
- is_featured INTEGER NOT NULL DEFAULT 0
- display_sort_order INTEGER NOT NULL DEFAULT 0
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- created_by TEXT NULL
- updated_by TEXT NULL

2. binary_period_rules
Columns:
- id INTEGER PRIMARY KEY
- pair_id INTEGER NULL
  NULL means global/default period rule
- period_seconds INTEGER NOT NULL
- payout_percent REAL NOT NULL
- refund_percent_on_draw REAL NOT NULL DEFAULT 100
- is_active INTEGER NOT NULL DEFAULT 1
- display_sort_order INTEGER NOT NULL DEFAULT 0
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL
- created_by TEXT NULL
- updated_by TEXT NULL

3. binary_price_ticks
For chart rendering and settlement reference history.
Columns:
- id INTEGER PRIMARY KEY
- pair_id INTEGER NOT NULL
- price REAL NOT NULL
- tick_time TEXT NOT NULL
- source_type TEXT NOT NULL
- created_at TEXT NOT NULL

4. binary_trades
Main binary trade orders table
Columns:
- id INTEGER PRIMARY KEY
- trade_ref TEXT UNIQUE NOT NULL
- user_id TEXT NOT NULL
- pair_id INTEGER NOT NULL
- pair_code_snapshot TEXT NOT NULL
- pair_display_name_snapshot TEXT NOT NULL
- direction TEXT NOT NULL
  Allowed:
  - 'long'
  - 'short'
- period_seconds INTEGER NOT NULL
- payout_percent_snapshot REAL NOT NULL
- draw_refund_percent_snapshot REAL NOT NULL DEFAULT 100
- wallet_asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- stake_amount_usd REAL NOT NULL
- expected_profit_usd REAL NOT NULL
- expected_total_payout_usd REAL NOT NULL
- entry_price REAL NOT NULL
- settlement_price REAL NULL
- result_status TEXT NOT NULL
  Allowed:
  - 'active'
  - 'won'
  - 'lost'
  - 'draw'
  - 'cancelled'
  - 'error'
- opened_at TEXT NOT NULL
- expires_at TEXT NOT NULL
- settled_at TEXT NULL
- wallet_lock_status TEXT NOT NULL DEFAULT 'locked'
  Allowed:
  - 'locked'
  - 'released'
- pnl_usd REAL NOT NULL DEFAULT 0
- note TEXT NULL
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

5. binary_wallet_ledger
Ledger for binary trade wallet movements
Columns:
- id INTEGER PRIMARY KEY
- user_id TEXT NOT NULL
- trade_id INTEGER NULL
- ledger_type TEXT NOT NULL
  Allowed:
  - 'binary_lock'
  - 'binary_refund'
  - 'binary_win_profit'
  - 'binary_loss'
  - 'binary_draw_refund'
  - 'binary_manual_adjustment'
- asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- amount_usd REAL NOT NULL
- balance_before_usd REAL NULL
- balance_after_usd REAL NULL
- note TEXT NULL
- created_at TEXT NOT NULL
- created_by TEXT NULL

6. binary_admin_audit_logs
Columns:
- id INTEGER PRIMARY KEY
- admin_user_id TEXT NOT NULL
- action_type TEXT NOT NULL
- target_type TEXT NOT NULL
- target_id TEXT NOT NULL
- note TEXT NULL
- created_at TEXT NOT NULL

7. binary_engine_settings
Singleton-style config table
Columns:
- id INTEGER PRIMARY KEY
- engine_mode TEXT NOT NULL DEFAULT 'internal_tick'
  Allowed:
  - 'internal_tick'
  - 'external_price_sync'
  - 'manual_admin_tick'
- settlement_price_mode TEXT NOT NULL DEFAULT 'latest_tick_at_or_before_expiry'
- tick_interval_ms INTEGER NOT NULL DEFAULT 1000
- chart_history_limit INTEGER NOT NULL DEFAULT 180
- binary_wallet_asset_symbol TEXT NOT NULL DEFAULT 'USDT'
- require_kyc_for_binary INTEGER NOT NULL DEFAULT 0
- allow_draw_refund INTEGER NOT NULL DEFAULT 1
- max_open_trades_per_user INTEGER NOT NULL DEFAULT 1
- global_min_stake_usd REAL NOT NULL DEFAULT 10
- global_max_stake_usd REAL NULL
- allow_same_second_multi_trade INTEGER NOT NULL DEFAULT 0
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

==================================================
WALLET INTEGRATION RULES
==================================================

This module must integrate with existing wallet accounting.

Use the existing:
- user_wallet_balances
- user_wallet_balance_details

Rules:
1. Never break current wallet summary behavior.
2. Binary trades must use available balance, not locked balance.
3. On trade open:
   - subtract stake from available_usd
   - add stake to locked_usd
   - sync total_usd = available_usd + locked_usd
4. On win:
   - release locked stake
   - add locked stake back to available
   - add profit to available
   - increase total_usd by profit only
5. On loss:
   - locked stake is consumed/lost
   - reduce locked_usd by stake
   - total_usd decreases accordingly
6. On draw:
   - release locked stake fully or partially using refund rule
7. Every movement must create binary_wallet_ledger row
8. DB transaction required for:
   - opening trade
   - settling trade
   - admin cancellation
   - draw refund
9. If user_wallet_balance_details row does not exist for user and asset:
   - initialize from existing user_wallet_balances.total_usd
   - available_usd = total_usd
   - locked_usd = 0

==================================================
CHART + PRICE SOURCE LOGIC
==================================================

Implement a real chart data flow.

Use one of these modes:
1. internal_tick
- backend generates or updates latest price ticks per pair
- store in binary_price_ticks
- chart reads recent ticks
- settlement reads from same tick store

2. external_price_sync
- backend periodically fetches prices from an external source
- save into binary_price_ticks
- current_price in binary_pairs stays updated

3. manual_admin_tick
- admin can push/update prices for testing

IMPORTANT:
For trust and consistency, the chart and the settlement must use the same effective source.
Do not display a chart from one source and settle trades from another unrelated source.

At minimum, implement an internal tick engine that works in development and can later be swapped.

Chart API should return:
- pair meta
- current price
- recent ticks
- entry markers if needed

==================================================
TRADING RULES + MATH
==================================================

Implement exact calculation helpers.

Definitions:
stake = amount user risks
payout_percent = profit rate on win
expected_profit = stake * payout_percent / 100
expected_total_payout = stake + expected_profit

Example:
stake = 111898.68
payout_percent = 40
expected_profit = 44759.472 -> display 44759.47
expected_total_payout = 156658.152 -> display 156658.15

Win rules:
- long wins if settlement_price > entry_price
- short wins if settlement_price < entry_price

Draw rule:
- if settlement_price === entry_price
- result is draw
- refund according to draw_refund_percent_snapshot
Default refund should be 100% if allow_draw_refund is enabled

Loss rule:
- opposite of win
- stake is lost unless custom recovery rule exists

Settlement formulas:

A. Win:
profit = stake * payout_percent / 100
wallet receives:
- principal return = stake
- profit = expected_profit
pnl_usd = +profit

B. Loss:
principal returned = 0
profit = 0
pnl_usd = -stake

C. Draw with 100% refund:
principal returned = stake
profit = 0
pnl_usd = 0

D. Draw with partial refund:
refund = stake * refund_percent / 100
pnl_usd = refund - stake

Round display values to 2 decimals.
Store underlying REAL values consistently.
Use helper functions for money formatting.

==================================================
TRADE LIFECYCLE
==================================================

1. User opens Binary page
- system loads default pair
- loads period rules
- loads wallet info
- loads recent ticks
- loads history

2. User selects direction
- long or short

3. User selects period
- payout updates

4. User sets amount
- validate min/max
- validate wallet balance
- update expected profit/total payout

5. User places trade
Inside DB transaction:
- verify session
- verify account_status active
- optionally verify KYC if setting requires it
- verify pair enabled
- verify period allowed
- verify user has enough available balance
- verify max_open_trades_per_user limit
- lock wallet amount
- capture latest current price as entry_price
- create binary_trades row with status active
- create binary_wallet_ledger row type binary_lock

6. Active trade modal
- show countdown
- poll active trade details if needed

7. Trade expiry
On or after expires_at:
- fetch settlement price from binary_price_ticks using configured settlement mode
- compute result
- settle wallet
- update binary_trades
- create wallet ledger rows
- return result payload

8. Result modal
- display outcome
- refresh wallet and history

==================================================
SETTLEMENT ENGINE
==================================================

Implement reusable settlement functions:

- settleExpiredBinaryTrades()
- settleBinaryTradeById(tradeId)
- resolveSettlementPrice(pairId, expiresAt)
- calculateBinaryTradeProjection(stake, payoutPercent)
- evaluateBinaryTradeResult(direction, entryPrice, settlementPrice)

Because this is SQLite and may not have a background worker, implement lazy settlement:
- whenever user opens Binary page
- whenever user requests active trades
- whenever user requests history
- whenever admin opens binary dashboard
Also optionally start a lightweight interval timer on server startup if project architecture allows it.

Settlement price resolution:
Preferred default:
- latest tick at or before expiry time
Fallback:
- nearest tick after expiry within a short grace threshold
If no valid tick exists:
- mark trade error OR delay settlement until tick arrives
Do not fabricate a settlement price silently.

==================================================
REQUIRED USER API ENDPOINTS
==================================================

Implement routes in existing backend style.

1. GET /api/binary/summary
Returns:
- binaryWallet
- availableBalance
- lockedBalance
- activeTradeCount
- totalTrades
- winCount
- lossCount
- drawCount
- totalProfit
- totalLoss
- netPnl

2. GET /api/binary/pairs
Returns enabled pairs

3. GET /api/binary/pairs/:id/chart
Returns:
- pair
- currentPrice
- ticks
- activePeriodRules

4. GET /api/binary/config
Returns:
- min stake
- max stake
- global settings
- available periods
- default pair
- engine mode

5. POST /api/binary/trades/open
Body:
- pairId
- direction
- periodSeconds
- stakeAmountUsd

6. GET /api/binary/trades/active
Returns active trades for current user

7. GET /api/binary/trades/history
Query params:
- result=all|won|lost|draw|active
- pairId
- page
- limit

8. GET /api/binary/trades/:id
Returns full trade details

9. POST /api/binary/trades/:id/settle
Allows explicit client-triggered settlement after expiry for current user if still active

==================================================
REQUIRED ADMIN API ENDPOINTS
==================================================

1. GET /api/admin/binary/dashboard-summary
2. GET /api/admin/binary/pairs
3. POST /api/admin/binary/pairs/create
4. POST /api/admin/binary/pairs/update
5. POST /api/admin/binary/pairs/delete
6. POST /api/admin/binary/pairs/toggle-status
7. GET /api/admin/binary/period-rules
8. POST /api/admin/binary/period-rules/save
9. GET /api/admin/binary/trades
10. POST /api/admin/binary/trades/settle
11. POST /api/admin/binary/trades/cancel
12. GET /api/admin/binary/engine-settings
13. POST /api/admin/binary/engine-settings/save
14. POST /api/admin/binary/manual-tick/push

All admin actions must:
- require admin auth
- follow existing admin route conventions
- create binary_admin_audit_logs rows for sensitive actions

==================================================
FRONTEND IMPLEMENTATION
==================================================

Implement and/or update React JSX components in harmony with the current project.

Suggested component files:
- src/features/binary/BinaryPage.jsx
- src/features/binary/BinaryHeader.jsx
- src/features/binary/BinaryChartCard.jsx
- src/features/binary/BinaryPairSelector.jsx
- src/features/binary/BinaryDirectionToggle.jsx
- src/features/binary/BinaryPeriodSelector.jsx
- src/features/binary/BinaryAmountCard.jsx
- src/features/binary/BinaryActiveTradeModal.jsx
- src/features/binary/BinaryResultModal.jsx
- src/features/binary/BinaryRecordsSection.jsx
- src/features/binary/binary-utils.js
- src/features/binary/binary.css

Admin files:
- src/admin/components/BinaryManagementPage.jsx
- admin subcomponents as needed for:
  - pair management
  - period rule management
  - trade desk
  - engine settings

You may adapt file naming to existing project patterns if similar modules already exist.

Frontend behavior requirements:
- mobile-first layout
- consistent with current crypto dashboard look
- clean loading/empty/error states
- smooth updates when pair/period/amount changes
- active trade modal auto-updates countdown
- result modal shows clear win/loss/draw
- records list refreshes after settlement
- wallet values refresh after trade lifecycle changes

==================================================
PREMIUM / UPDATED UI REQUIREMENTS
==================================================

Upgrade the binary UI to feel more premium and professional than the current rough version, while still matching my existing app style.

Design goals:
- cleaner hierarchy
- more professional spacing
- stronger CTA
- better chart readability
- more premium cards/buttons
- less clutter
- clearer labels

Must include:
- clean pair header
- strong price emphasis
- better chart container
- polished Long/Short toggle
- refined period pills/cards
- amount card with better stake/profit breakdown
- bold trade button
- well-designed active trade modal
- polished result modal
- cleaner records cards/list

Do NOT redesign the whole app.
Only modernize the Binary module inside the existing design language.

==================================================
ADMIN FEATURES
==================================================

Admin must be able to:
- create/update pairs
- enable/disable featured pairs
- define payout rules per period
- override rules globally or per pair
- see all active trades
- see recent settlements
- view user trade activity
- change engine settings
- manually push ticks for testing
- inspect trade outcomes
- cancel problematic trades with audit log
- force settlement if needed with audit log

Admin dashboard summary should include:
- total active stakes
- total settled profit paid
- total losses collected
- net house exposure
- active trades count
- today trades count
- top traded pairs
- win/loss/draw breakdown

==================================================
DATA MODEL / RESPONSE STYLE
==================================================

Use the same response shape conventions already used in this project.
Prefer:
{
  ok: true,
  data: ...
}
and
{
  ok: false,
  error: "Human readable error"
}
unless the existing project uses a different standard.

==================================================
IMPORTANT CONSISTENCY RULES
==================================================

1. Use same source for chart and settlement.
2. Use same terminology throughout:
   - Long / Short
   - Stake
   - Expected Profit
   - Total Payout
   - Entry Price
   - Settlement Price
3. Do not show “Expected: 0” if amount and period are selected.
4. Do not leave trade history fields as zero placeholders unless data truly missing.
5. Preserve immutable snapshots inside binary_trades.
6. Use DB transactions for all wallet-affecting actions.
7. Reuse existing wallet/account/session model.
8. Avoid creating duplicate or conflicting wallet systems.
9. Ensure route registration works in both Express server and any serverless adapter patterns already present.
10. Keep code runnable and integrated.

==================================================
SPECIAL TEST CASES TO PASS
==================================================

Implement and verify these scenarios:

1. User opens binary page and sees enabled pair list + current price + period rules.
2. User selects Long, 30s, and enters valid amount.
3. Expected profit updates instantly.
4. User with insufficient balance is blocked.
5. Trade opens and wallet locks stake.
6. Active trade countdown shows correctly.
7. After expiry, settlement occurs correctly for Long win.
8. After expiry, settlement occurs correctly for Short win.
9. Draw refunds principal correctly.
10. Loss consumes stake correctly.
11. History records show real entry/settlement/result values.
12. Admin changes payout rules and new trades use new rules, but old trades keep snapshots.
13. Admin disables a pair and new trades cannot open on it.
14. Engine settings persist and affect logic.
15. Manual tick push can be used for test settlement.

==================================================
IMPLEMENTATION ORDER
==================================================

Do the work in this order:

1. Inspect current project structure and reuse helpers.
2. Inspect how DB bootstrap/init is currently handled in server/index.js and server/lum-module.js.
3. Add Binary schema bootstrap safely.
4. Add wallet sync helpers for binary module.
5. Add price tick engine/service.
6. Add trade open + settlement service layer.
7. Add user Binary routes.
8. Add admin Binary routes.
9. Add frontend Binary user pages/components.
10. Add admin Binary management UI.
11. Wire Binary entry from dashboard/footer.
12. Test full lifecycle.

==================================================
OUTPUT FORMAT
==================================================

Now implement this directly in the existing project.

I want actual code changes, not just explanation.

For every file you create or modify:
- preserve project conventions
- include complete runnable code
- avoid pseudo-code
- avoid disconnected mock code
- reuse existing utilities whenever possible

At the end provide:
1. files created/updated
2. DB schema changes
3. API routes added
4. wallet flow summary
5. chart/tick engine summary
6. settlement logic summary
7. manual testing steps























ebar amader user section er transaction section ta intigrate korte hobe main cryptobot apps/web e.

user section er jonno binary or lum er jonno jecabe alada folder banaichila oivabe transaction er jonno alada folder banaiyo.
and admin section er jonno admin/components folder e file create koiro. 
ami tomake reference hisabe user side er transaction section er koyekta screenshot dicchi.

user side(cryptobot user side) e ui/ux and theeme hobe onno j page gulo example, dashboard or biranry or lum er moto ui/ux and theme design. alada jno na hoy. tahole user er kache kharap lagbe ekekpage ekek rokom hoye jabe. 

and also ami prompt e sob bole dibo, tmi amar project er shate sync kore transaction section ta intigrate kore diba.
pura jinista jno functional hoy. fully functional. tmi test kore dekba functional kina. 
and obossoi premium and professional functional and ui design hoy. jno user mone kore professional ekta apps or web.

and daatabase and structure er shate fully sync korba. 

ei nao prompt.

You are working inside my existing CryptoBot project. I need you to build and integrate a fully functional Transaction module into the main project without breaking any existing module or changing any existing feature behavior unless strictly required for integration safety.

IMPORTANT HIGH-LEVEL GOAL
Build a production-ready Transaction section for the user app and a fully dynamic global Transaction Management section for the admin app.

This Transaction module must include:
1. Convert system
2. Spot trading system
3. Dynamic admin control over all transaction-related functionality
4. Safe DB schema migration/init
5. Wallet accounting and ledger sync
6. API integration
7. Full project integration without affecting existing auth, dashboard, deposit, KYC, LUM, Binary, admin auth/session, or other working areas

CRITICAL SAFETY AND INTEGRATION RULES
- Do not redesign the whole app.
- Do not change the theme, styling language, or UX pattern globally. Reuse the project’s existing component/style structure and keep the same visual language as the other pages.
- Do not break or change existing LUM, Binary, Deposit, KYC, Auth, Admin, or wallet logic unless a minimal additive integration is required.
- Prefer additive changes over destructive edits.
- Keep all current routes, existing APIs, existing DB tables, and current business flows compatible.
- If any existing helper can be reused, reuse it.
- If any migration/init is needed, make it safe and idempotent.
- Use the current project structure and coding style.
- Ensure the final implementation is fully wired end-to-end, not partial.
- Do not leave placeholders, fake handlers, mock APIs, or dummy UI-only flows.
- Where backward compatibility matters, preserve old behavior.

PROJECT CONTEXT YOU MUST FOLLOW
Frontend project structure currently contains:
- src/main.jsx
- src/App.jsx
- src/features/dashboard/
- src/features/lum/
- src/features/binary/
- src/admin/
- src/admin/components/
- src/admin/utils/

Backend currently contains:
- server/index.js
- server/lum-module.js
- server/binary-module.js
- server/data/auth.sqlite

Existing important DB/business context:
- users table has account_role, account_status, kyc_status, auth_tag, etc.
- user_wallet_balances exists
- user_wallet_balance_details exists for available/locked/reward split
- Binary module already uses pair config, price ticks, trade snapshots, wallet lock/release ledger, admin audit, engine settings
- Current wallet symbols already include SPOT_USDT, MAIN_USDT, BINARY_USDT
- Admin and platform users are logically separated via DB views and admin panel stats are DB-driven

I want the new Transaction module to follow the same architectural seriousness as Binary and LUM.

==================================================
SECTION A — WHAT TO BUILD
==================================================

Build a new Transaction module with 2 user-facing tabs:
1. Convert
2. Trades

A.1. CONVERT TAB
This is an instant asset conversion system.
User can:
- choose From asset
- choose To asset
- enter amount
- use MAX
- reverse/swap selected assets
- see available balance
- get live quote
- see exchange rate
- see fee/spread breakdown
- preview receive amount
- confirm conversion
- see conversion history

Convert must support:
- instant execution
- min/max validation
- same-asset prevention
- insufficient balance validation
- disabled pair validation
- stale/missing rate validation
- maintenance mode blocking
- fee/spread handling
- DB order record
- wallet debit/credit
- ledger rows
- admin override compatibility
- user history list with filters if reasonable

A.2. TRADES TAB
This is a spot trading section, not binary.
User can:
- select spot pair
- view pair info
- place Buy/Sell orders
- choose Market or Limit order
- enter price and amount where applicable
- use balance percentage shortcuts or slider
- see total cost / receive amount
- see fee preview
- place order
- view open orders
- cancel eligible open orders
- view order history
- view recent market trades
- optionally view order book if implementing it is feasible without destabilizing the app

Spot trading must support:
- Buy market order
- Sell market order
- Buy limit order
- Sell limit order
- order validation
- wallet lock/unlock
- immediate fill for market orders
- open order lifecycle for limit orders
- cancel order
- completed order history
- trade execution records
- fee accounting
- disabled pair blocking
- maintenance mode blocking
- admin force intervention when necessary

==================================================
SECTION B — ADMIN MUST BE FULLY DYNAMIC AND GLOBAL
==================================================

Build a new admin section for transaction management where admin has full control over the module globally and dynamically.

Create a new admin page/component and wire it into the admin section router/sidebar.

Admin must be able to control at minimum:

B.1. GLOBAL CONTROL CENTER
- transaction module enable/disable
- convert module enable/disable
- spot trading module enable/disable
- maintenance mode message
- global emergency freeze
- default maker fee
- default taker fee
- default convert fee
- default convert spread
- default min/max safety limits
- manual rate mode enable/disable
- manual price mode enable/disable

B.2. CONVERT DESK
- list convert pairs
- create convert pair
- update convert pair
- delete convert pair if safe
- enable/disable pair
- set min/max amount
- set fee percent
- set spread percent
- set fixed fee if needed
- choose rate source type
- set source symbol
- push manual rate override
- view convert orders
- filter convert orders by user/pair/status/date
- manually mark failed/cancelled when required
- create audit logs for every sensitive action

B.3. SPOT PAIRS DESK
- list spot pairs
- create pair
- update pair
- delete pair if safe
- enable/disable pair
- mark featured
- set sort order
- set base asset
- set quote asset
- set price precision
- set quantity precision
- set min order size
- set max order size
- set maker fee
- set taker fee
- set price source type
- set source symbol
- update pair metadata
- manual tick/price push if system allows
- audit sensitive actions

B.4. ORDER DESK
- list all spot orders
- filter by pair/status/user/date/order type/side
- inspect order details
- inspect execution/fill details
- cancel active open orders when allowed
- force-fill only if implementation is safe and auditable
- mark problematic order with note
- inspect ledger effects
- inspect linked user
- audit every manual intervention

B.5. FEED / MARKET CONTROL
- configure price source mode per pair or globally
- internal_feed / external_api / manual_admin_feed style handling
- manual admin price push
- feed health status if feasible
- stale feed detection handling
- graceful fallback rules
- audit logging

B.6. LIMITS / RISK / COMPLIANCE
- set minimum KYC requirement threshold if needed
- restrict trading/conversion for suspended/banned users
- allow only active users to trade
- optional per-user or per-role limits
- optional per-pair maintenance mode
- optional daily cap / maximum order cap
- validation rules must be centralized

B.7. AUDIT / SUMMARY
- dashboard summary cards
- total convert volume
- total spot volume
- open orders
- completed orders
- failed orders
- enabled pairs
- disabled pairs
- fees earned if derivable
- top pairs
- top users by volume if feasible
- audit logs for manual/admin-sensitive actions

Admin control must be database-driven, not hardcoded, and must be globally effective throughout the app.

==================================================
SECTION C — DATABASE DESIGN AND SCHEMA
==================================================

Add new tables safely through backend initialization in the same spirit as existing modules.

C.1. CONVERT TABLES
Create tables equivalent to:

1) convert_pairs
Fields:
- id INTEGER PK
- pair_code TEXT UNIQUE
- display_name TEXT
- from_asset TEXT
- to_asset TEXT
- rate_source_type TEXT
- source_symbol TEXT
- min_amount_usd REAL
- max_amount_usd REAL
- fee_percent REAL
- spread_percent REAL
- fixed_fee_usd REAL
- manual_rate REAL nullable
- is_enabled INTEGER default 1
- display_sort_order INTEGER default 0
- created_at TEXT
- updated_at TEXT
- created_by TEXT nullable
- updated_by TEXT nullable

2) convert_orders
Fields:
- id INTEGER PK
- convert_ref TEXT UNIQUE
- user_id TEXT
- convert_pair_id INTEGER
- pair_code_snapshot TEXT
- display_name_snapshot TEXT
- from_asset_snapshot TEXT
- to_asset_snapshot TEXT
- from_amount REAL
- raw_rate REAL
- applied_rate REAL
- fee_amount REAL
- receive_amount REAL
- status TEXT   -- pending/completed/failed/cancelled
- note TEXT nullable
- created_at TEXT
- completed_at TEXT nullable
- updated_at TEXT

3) convert_wallet_ledger
Fields:
- id INTEGER PK
- user_id TEXT
- convert_id INTEGER
- ledger_type TEXT -- convert_debit / convert_credit / convert_fee / manual_adjustment
- asset_symbol TEXT
- amount REAL
- balance_before REAL
- balance_after REAL
- note TEXT nullable
- created_at TEXT
- created_by TEXT nullable

4) convert_admin_audit_logs
Fields:
- id INTEGER PK
- admin_user_id TEXT
- action_type TEXT
- target_type TEXT
- target_id TEXT
- note TEXT nullable
- created_at TEXT

C.2. SPOT TABLES
Create tables equivalent to:

1) spot_pairs
Fields:
- id INTEGER PK
- pair_code TEXT UNIQUE
- display_name TEXT
- base_asset TEXT
- quote_asset TEXT
- price_source_type TEXT
- source_symbol TEXT
- current_price REAL
- previous_price REAL
- price_precision INTEGER
- quantity_precision INTEGER
- min_order_size REAL
- max_order_size REAL
- maker_fee_percent REAL
- taker_fee_percent REAL
- is_enabled INTEGER default 1
- is_featured INTEGER default 0
- display_sort_order INTEGER default 0
- created_at TEXT
- updated_at TEXT
- created_by TEXT nullable
- updated_by TEXT nullable

2) spot_price_ticks
Fields:
- id INTEGER PK
- pair_id INTEGER
- price REAL
- tick_time TEXT
- source_type TEXT
- created_at TEXT

3) spot_orders
Fields:
- id INTEGER PK
- order_ref TEXT UNIQUE
- user_id TEXT
- pair_id INTEGER
- pair_code_snapshot TEXT
- pair_display_name_snapshot TEXT
- base_asset_snapshot TEXT
- quote_asset_snapshot TEXT
- side TEXT -- buy/sell
- order_type TEXT -- market/limit
- price REAL nullable
- quantity REAL
- filled_quantity REAL default 0
- avg_fill_price REAL nullable
- quote_amount REAL nullable
- fee_amount REAL default 0
- fee_asset TEXT nullable
- status TEXT -- open/partially_filled/filled/cancelled/rejected/error
- locked_asset_symbol TEXT
- locked_amount REAL
- note TEXT nullable
- created_at TEXT
- updated_at TEXT
- filled_at TEXT nullable
- cancelled_at TEXT nullable

4) spot_trades
Fields:
- id INTEGER PK
- trade_ref TEXT UNIQUE
- order_id INTEGER
- user_id TEXT
- pair_id INTEGER
- pair_code_snapshot TEXT
- side TEXT
- execution_price REAL
- execution_quantity REAL
- quote_total REAL
- fee_amount REAL
- fee_asset TEXT
- created_at TEXT

5) spot_wallet_ledger
Fields:
- id INTEGER PK
- user_id TEXT
- order_id INTEGER nullable
- trade_id INTEGER nullable
- ledger_type TEXT -- order_lock / order_unlock / buy_debit / buy_credit / sell_debit / sell_credit / fee_debit / manual_adjustment
- asset_symbol TEXT
- amount REAL
- balance_before REAL
- balance_after REAL
- note TEXT nullable
- created_at TEXT
- created_by TEXT nullable

6) spot_admin_audit_logs
Fields:
- id INTEGER PK
- admin_user_id TEXT
- action_type TEXT
- target_type TEXT
- target_id TEXT
- note TEXT nullable
- created_at TEXT

C.3. GLOBAL SETTINGS TABLE
Create a transaction_engine_settings table or equivalent config table to support global admin-driven dynamic behavior.

Suggested fields:
- id INTEGER PK
- transaction_module_enabled INTEGER
- convert_enabled INTEGER
- spot_enabled INTEGER
- maintenance_mode_enabled INTEGER
- maintenance_message TEXT nullable
- emergency_freeze_enabled INTEGER
- default_convert_fee_percent REAL
- default_convert_spread_percent REAL
- default_fixed_convert_fee_usd REAL
- default_maker_fee_percent REAL
- default_taker_fee_percent REAL
- manual_rate_mode_enabled INTEGER
- manual_price_mode_enabled INTEGER
- require_active_account_only INTEGER
- block_suspended_users INTEGER
- block_banned_users INTEGER
- kyc_required_above_amount_usd REAL nullable
- updated_at TEXT
- updated_by TEXT nullable

Ensure idempotent creation and safe default seed row.

==================================================
SECTION D — WALLET ACCOUNTING RULES
==================================================

Very important: wallet logic must be correct and compatible with the existing project.

Use the existing wallet model and extend it safely.

RULES:
- Keep user_wallet_balances compatible.
- Keep user_wallet_balance_details compatible.
- Do not break existing wallet consumers.
- Continue syncing aggregate totals after wallet-affecting actions.
- Use available and locked amounts properly.

D.1. ASSET SYMBOL STRATEGY
Use namespaced symbols for spot assets where needed, for example:
- SPOT_USDT
- SPOT_BTC
- SPOT_ETH
or another consistent approach if existing wallet code requires a different pattern.

But preserve compatibility with current wallet architecture.

D.2. CONVERT ACCOUNTING
On successful convert:
- validate source balance available
- debit source asset available amount
- apply fee/spread
- credit target asset available amount
- create convert order row
- create convert wallet ledger rows
- sync wallet summary tables

D.3. SPOT BUY ORDER ACCOUNTING
For buy orders:
- quote asset is the funding asset
- for market buy, fill immediately using current effective price
- for limit buy, lock quote asset when order is created
- when filled, move from locked/debit quote to credited base
- deduct fee
- create spot ledger rows
- sync wallet summary

D.4. SPOT SELL ORDER ACCOUNTING
For sell orders:
- base asset is the funding asset
- for market sell, fill immediately
- for limit sell, lock base asset
- when filled, debit base and credit quote
- deduct fee
- create spot ledger rows
- sync wallet summary

D.5. CANCEL ORDER
- only eligible open or partially-filled orders can be cancelled under allowed rules
- release remaining locked balance
- update order status
- create unlock ledger row
- sync wallet summary

D.6. SAFETY
- prevent negative balances
- all balance-changing operations must be transactional
- use DB transaction boundaries
- if one step fails, roll back the full operation
- all manual admin adjustments must be auditable

==================================================
SECTION E — BUSINESS VALIDATION RULES
==================================================

Centralize validation.

E.1. USER ACCESS
A user can convert/trade only if:
- transaction module enabled
- relevant submodule enabled
- user account_status allows it
- user is not suspended/banned if settings block them
- pair is enabled
- global emergency freeze is off
- maintenance mode is not blocking that action
- KYC threshold rules are satisfied if configured
- sufficient balance exists
- request values are within limits

E.2. CONVERT VALIDATION
- from asset and to asset cannot be same
- amount > 0
- amount within pair min/max
- rate available and not stale
- source asset available balance sufficient
- pair enabled
- conversion setting enabled

E.3. SPOT ORDER VALIDATION
- pair enabled
- side/order type valid
- quantity > 0
- price required for limit order
- current price required for market order
- within min/max order size
- sufficient funding balance
- lock amount computed correctly
- precision rounding enforced consistently

E.4. ADMIN VALIDATION
- only admin/super_admin can use admin actions
- sensitive actions must write audit logs
- deleting pairs should be safe and should not corrupt historical records
- use soft disable when safer than delete

==================================================
SECTION F — BACKEND IMPLEMENTATION
==================================================

Create new backend modules and wire them into server/index.js in the same style as existing modules.

Recommended files:
- server/transaction-module.js
or
- server/convert-module.js
- server/spot-module.js

You may choose the cleaner structure, but the final integration must be easy to maintain.

Backend responsibilities must include:
- schema bootstrap/init
- prepared statements or safe query helpers
- user-facing handlers
- admin-facing handlers
- wallet helpers
- rate/price helpers
- validation helpers
- audit log helpers
- summary/stat queries

F.1. USER API ACTIONS
Implement and wire handlers for at least:

Convert:
- transaction.convert.pairs.list
- transaction.convert.quote
- transaction.convert.submit
- transaction.convert.history

Spot:
- transaction.spot.pairs.list
- transaction.spot.market-summary
- transaction.spot.ticks
- transaction.spot.recent-trades
- transaction.spot.order.place
- transaction.spot.orders.open
- transaction.spot.orders.history
- transaction.spot.order.cancel

Optional if feasible:
- transaction.spot.orderbook

F.2. ADMIN API ACTIONS
Implement and wire handlers for at least:

Global:
- admin.transaction.dashboard-summary
- admin.transaction.engine-settings.get
- admin.transaction.engine-settings.save

Convert:
- admin.transaction.convert.pairs.list
- admin.transaction.convert.pairs.create
- admin.transaction.convert.pairs.update
- admin.transaction.convert.pairs.delete
- admin.transaction.convert.pairs.toggle-status
- admin.transaction.convert.orders.list
- admin.transaction.convert.manual-rate.push

Spot:
- admin.transaction.spot.pairs.list
- admin.transaction.spot.pairs.create
- admin.transaction.spot.pairs.update
- admin.transaction.spot.pairs.delete
- admin.transaction.spot.pairs.toggle-status
- admin.transaction.spot.orders.list
- admin.transaction.spot.order.cancel
- admin.transaction.spot.order.force-fill   (only if implemented safely)
- admin.transaction.spot.manual-tick.push
- admin.transaction.spot.feed.settings.save

Audit:
- admin.transaction.audit.list

All endpoints must be integrated into existing auth/admin permission flow.

==================================================
SECTION G — FRONTEND USER APP INTEGRATION
==================================================

Create a new user feature module for the Transaction section and integrate it into the main app routing/navigation the same way the existing feature pages are integrated.

Recommended structure:
- src/features/transaction/TransactionPage.jsx
- src/features/transaction/TransactionHeader.jsx
- src/features/transaction/ConvertTab.jsx
- src/features/transaction/ConvertForm.jsx
- src/features/transaction/ConvertHistoryTable.jsx
- src/features/transaction/TradesTab.jsx
- src/features/transaction/SpotOrderForm.jsx
- src/features/transaction/SpotOpenOrders.jsx
- src/features/transaction/SpotOrderHistory.jsx
- src/features/transaction/SpotRecentTrades.jsx
- src/features/transaction/SpotMarketSummary.jsx
- src/features/transaction/transaction-utils.js
- src/features/transaction/transaction.css

You may adjust filenames slightly if it matches the project’s pattern better, but keep it organized and modular.

Frontend user requirements:
- all data must come from real backend handlers
- no dummy data
- proper loading/empty/error states
- optimistic updates only where safe
- proper refresh behavior
- preserve app navigation compatibility
- integrate with current auth session wrapper
- reuse current utility/helpers/patterns wherever possible

G.1. CONVERT UX LOGIC
Must support:
- asset selection
- amount input
- MAX
- reverse assets
- live quote call
- preview values
- submit conversion
- success/failure feedback
- history refresh

G.2. SPOT TRADES UX LOGIC
Must support:
- pair selection
- market summary
- buy/sell selection
- market/limit selection
- amount and optional price input
- percentage shortcut/slider
- place order
- open orders
- cancel order
- history
- recent trades

==================================================
SECTION H — FRONTEND ADMIN APP INTEGRATION
==================================================

Create a new admin component and wire it into the existing admin shell/section routing.

Recommended file:
- src/admin/components/TransactionManagementPage.jsx

This page must be fully dynamic and DB/API driven.

Suggested admin subsections/tabs:
- Overview
- Control Center
- Convert Desk
- Spot Pairs
- Order Desk
- Feed Control
- Fees & Limits
- Audit Logs

Admin page requirements:
- fetch all needed data from backend actions
- support create/update/delete/toggle flows
- support summary cards
- support filtering
- support view details modals/drawers where project pattern allows
- support safe confirmation for destructive actions
- show current global settings and allow updating them
- write admin notes where relevant for sensitive actions
- keep styling consistent with existing admin pages

Also update:
- src/admin/AdminSectionPage.jsx
- src/admin/components/AdminDashboardPage.jsx
- src/admin/constants.js
or any other required admin router/sidebar config

Do this in the existing project style, without breaking existing sections like User Management, KYC, Deposit Management, LUM Management, Binary Management.

==================================================
SECTION I — RATE / PRICE SOURCE STRATEGY
==================================================

Design a sane price/rate strategy compatible with the current project.

I.1. CONVERT RATE
Convert may use:
- derived rate from spot pair data
- manual admin override
- external source if existing project already has safe support
- fallback rejection if no valid rate exists

Applied rate should clearly reflect:
- raw market rate
- spread
- fee

I.2. SPOT PRICE
Spot pair current price may use:
- internal_feed
- external_api
- manual_admin_feed

Support manual tick push from admin for admin-controlled environments.

Store spot_price_ticks for recent market history and recent trades display logic where relevant.

I.3. STALE FEED HANDLING
If price/rate is unavailable or stale:
- block market execution
- block quote generation if needed
- return clear backend error
- show safe frontend error state

==================================================
SECTION J — HISTORY, REPORTING, AND ADMIN SUMMARY
==================================================

J.1. USER HISTORY
Show:
- convert history
- open orders
- order history
- recent trades

J.2. ADMIN SUMMARY
Provide dashboard summary queries/cards such as:
- total convert pairs
- enabled convert pairs
- total spot pairs
- enabled spot pairs
- total convert orders
- completed convert orders
- failed convert orders
- open spot orders
- filled spot orders
- cancelled spot orders
- total convert volume
- total spot volume
- total fee amount if feasible

J.3. AUDIT
Every sensitive admin action should create an audit row:
- create pair
- update pair
- toggle pair
- delete pair
- save settings
- manual rate push
- manual price push
- cancel order
- force-fill order
- manual adjustment

==================================================
SECTION K — NON-BREAKING INTEGRATION REQUIREMENT
==================================================

This is very important.

Before finishing, ensure:
- existing app routes still work
- existing admin sections still work
- existing Binary module still works exactly as before
- existing LUM module still works exactly as before
- existing deposit and KYC flows still work exactly as before
- auth/session flow remains unchanged
- no naming collisions with current modules
- no accidental changes to existing DB tables beyond safe additive integration
- any new wallet helper changes stay backward compatible
- no regression in admin stats loading

If you need to touch shared code:
- keep edits minimal
- preserve old behavior
- comment carefully where useful
- ensure the new module uses the shared code without breaking existing callers

==================================================
SECTION L — TEST / VERIFICATION EXPECTATIONS
==================================================

At the end of implementation, make sure the code is logically complete and verify all core flows.

At minimum verify through code-level consistency that:
1. convert pair can be created by admin
2. convert quote works
3. convert submit updates wallet and history
4. spot pair can be created by admin
5. market buy works
6. market sell works
7. limit buy locks funds and can be cancelled
8. limit sell locks funds and can be cancelled
9. open orders load correctly
10. order history loads correctly
11. admin global disable blocks user actions
12. suspended/banned restriction works according to settings
13. audit logs are written
14. existing modules remain unaffected

If any piece cannot be safely implemented exactly as specified, choose the safest production-compatible version and complete the module end-to-end rather than leaving partial scaffolding.

==================================================
SECTION M — IMPLEMENTATION STYLE
==================================================

Use the project’s existing style and patterns.
Keep code maintainable, modular, and explicit.
Prefer clear functions over overly clever abstractions.
Keep DB changes idempotent.
Use proper transactions for money logic.
Use consistent naming with the rest of the project.
Make the admin system truly dynamic and global, not hardcoded and not cosmetic.

FINAL DELIVERABLE
Implement the full Transaction module end-to-end in the existing project:
- backend
- DB
- user UI integration
- admin UI integration
- wallet synchronization
- audit logging
- safety validation
- non-breaking integration

Return the completed code changes directly in the project structure, not just a plan.