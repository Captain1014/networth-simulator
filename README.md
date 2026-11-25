# Net Worth Simulator

A client-side net worth and retirement simulator with multi-account tracking, life events, Monte Carlo analysis, and the 4% rule.

## Features

- **Multi-account management** — Add and track pension, Roth IRA, 401(k), and other investment accounts with individual return rates and tax rules
- **Life events** — Model one-time income or expenses (home purchase, inheritance, etc.) on exact calendar dates
- **Monte Carlo simulation** — Run seeded portfolio paths in a local Web Worker to see net-worth p10/p50/p90 bands and dated cash-need funding success
- **Scenario comparison** — Switch between base, optimistic (+2%), and pessimistic (-2%) return scenarios
- **4% rule tracker** — FIRE progress bar showing how close current assets are to the target retirement number
- **Debt modeling** — Mortgage, student loans, car loans with individual interest rates
- **i18n** — Korean (KRW) and English (USD) with locale-aware formatting
- **Data export** — Copy full simulator state to clipboard for pasting into a chat
- **Mobile-friendly** — Bottom tab navigation with responsive layout
- **LocalStorage** — All inputs persist across sessions, no server required

## Project Structure

```
index.html          # Root page (Korean locale)
ko/index.html       # Korean version
eng/index.html      # English version
css/style.css       # Styles
js/app.js           # Existing UI actions and chart adapters
js/core.js          # Validation, migration, storage, and FX helpers
js/workspace.js     # Persistence, recovery, currency entry, and accessible UI
js/events.js        # Calendar-date editors and chronological life-event timeline
js/finance-state.js # Versioned assumptions and shared form schemas
js/finance-tax.js   # Pure effective-tax and equity-settlement helpers
js/finance-timeline.js # Dated/monthly model compilation
js/finance-engine.js # Shared deterministic/stochastic financial ledger
js/finance-ui.js    # Itemized finance settings and private-file import
js/finance-adapter.js # Gross/net/liquidity reports and exports
js/finance-worker.js # Browser-local Monte Carlo worker
tests/              # Isolated headless Chrome regression tests
docs/               # Design notes and guides
```

## Usage

No build step or Node installation is required. For local review, serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1` and open `http://127.0.0.1:8765/eng/`. HTTP(S) is required for reliable worker/crypto behavior. Financial inputs stay client-side; the static server does not receive profile contents.

## Saving, backup, and multiple currencies

- Basic monetary fields have separate USD and KRW inputs. Both amounts are added, not treated as alternative representations of the same balance. Leave the other currency blank if it does not apply.
- Each account, life event, and housing scenario has its own input currency. Account balances and fixed contributions use that account's currency. Percentage contributions use the explicitly selected net-income or eligible-gross salary basis.
- The display-currency selector changes charts, summary cards, and tables without modifying entered amounts. Calculations normalize amounts to USD internally.
- USD/KRW reference rates come from [Frankfurter](https://frankfurter.dev/). The UI shows the reference date and fetch time. These are not live trading quotes or bank conversion prices. Long-term projections hold the selected exchange rate constant.
- Rates are checked on entry, on returning to the tab, and hourly while visible, with a one-hour freshness window. Offline, the last valid rate is used with a warning; rates over four days old are flagged. Without a rate, cross-currency results pause, while raw inputs and encrypted backup remain available. A manual rate can be entered for offline use.
- Autosave belongs to this browser profile and does not synchronize across devices. Local saves are not encrypted. Save failures are shown; invalid or unreadable stored data is not automatically replaced with examples.
- Older saves lack currency metadata. Reviewing and migrating that separate copy is optional; preview its amounts before choosing the original currency. If you have entered new USD/KRW values, **Save current entries** preserves those values and archives the stored original without a currency prompt. Calculations remain available while overwrite protection is active.
- Use **Create Backup → Download encrypted file** and **Restore Backup → Choose encrypted backup file** to transfer data. Keep the password separately. Existing long backup tokens remain supported. Short relay codes expire after 48 hours and are not permanent backups.
- Recovery controls can restore the previous valid snapshot or download the stored original. Recovery JSON and clipboard exports are unencrypted; keep them private and out of Git.
- Changes in another tab pause saving to avoid silently overwriting that tab's data. Export any edits before reloading.

## Life-event dates

Set the projection start date beside your current age. New life events use an exact date (and an optional exclusive end date for recurring additions). The timeline is chronological; selecting an item opens its editor. Graphs and yearly rows show calendar year alongside modeled age.

Income/expense change events replace only the base amount in the event's selected currency. Setting KRW income to zero does not clear USD income, and vice versa. Wage growth and inflation continue independently on the remaining currency streams. Additional recurring events stay additive. Same-date changes in different currencies are independent of insertion order; multiple changes in the same currency follow date/ID order.

The first report row covers the start date (included) through December 31; later rows cover full calendar years. The internal ledger splits on exact events and month boundaries, including future years. Monthly amounts use actual month overlap; annual rates use actual days in that year (365/366). Inputs remain annual rates or explicitly monthly amounts, never silently rescaled in storage.

Accrued salary and expenses settle at month end by default. Explicit payment days override accrual without duplicating it. Dated deposits, stock settlement and home purchases use their dates; future salary is not available before settlement. Returns compound over actual elapsed fractions. Opening balances are snapshots; pre-start transactions are not replayed.

Existing age-based events keep their original start/end timing and display an approximate year. Their exact date is left blank until explicitly selected. Existing end-age timing is retained until an end date is chosen or **No end date** is selected. Exact dates and the projection anchor are included in saved data and backups.

Taxable accounts have no withdrawal-age restriction in the simulator. Their age field is omitted, and a previously saved withdrawal age does not block access to those funds. Retirement-account withdrawal settings are unchanged.

## Integrated finance model

Open **Finance model settings** for cash yields, effective taxes, itemized income/expenses, scenarios, equity compensation, home purchases and retirement assumptions. A blank value is unknown, not confirmed zero. In itemized mode, the old annual fields/cash-flow events remain in the backup but are not counted again. Converting legacy flows is explicit; conditional legacy events require review.

- **Cash vs market assets:** legacy non-pension balances become cash/deposit buckets with a visible unconfirmed 0% yield until reviewed. The old generic return is preserved as reference, not automatically applied to bank cash. Market accounts retain individual total expected returns, dividend yields and volatility groups.
- **Net worth vs liquidity:** net worth includes gross account balances, refundable rental deposits, modeled properties and ESPP clearing, less debt. Available funds exclude deposits, clearing, home equity and inaccessible retirement accounts. Withdrawal taxes are estimated before an account can fund a cash need.
- **Rental deposits:** use deposit payment/refund events. Cash/owned-asset transfers conserve wealth before fees and tax-funded liquidation effects. Refunds precede payments on the same date. Unfunded payments create no deposit asset; excessive refunds cannot create cash.
- **Tax assumptions:** cash interest and reinvested dividends have separate effective tax rates. Brokerage sales use pooled proportional basis and tax only positive realized gain; no loss credits/carryforwards are modeled. Deferred and Roth distributions both respect the explicit effective withdrawal rate. Roth qualification and cross-country tax outcomes are user assumptions, not legal/treaty determinations. Unknown basis provisionally uses opening value and is prominently flagged.
- **Gross vs net:** net salary is not taxed again or falsely shown as known gross pay. Gross TC targets are separate from cash settlement; linked salary/vesting components are not added a second time. Business receipts deduct costs and estimated tax; operating losses consume funds rather than disappearing. The tax column includes additional modeled taxes, not withholding already included in net-pay inputs.
- **DC:** employer contributions credit the retirement account, not salary cash. Fixed amount overrides percentage instead of being added to it. Posting schedule, eligible gross base and opening balance are separate assumptions. First-year forecasts and employment dates constrain annual contributions.
- **DB / severance:** the dedicated form records a manually estimated total and payment date, not a statutory salary/tenure calculation. New records are disabled by default; new entitlements also require confirmation they are not already included in DC, assets or other income. Gross benefits use the entered payment tax, while net benefits are not taxed again. Cash and retirement-account destinations settle once, without prorating the lump sum. Existing retirement assets instead move from a selected source: modeled retirement-to-retirement transfers carry proportional basis without new income or payment tax; cash distributions respect source access/tax assumptions and owned-balance limits. Confirm actual rollover eligibility independently. Complete active records can replace linked old one-time income/events; incomplete/disabled records do not suppress them. Finance schema 2 reads schema 1 without inventing benefits.
- **ESPP:** employee principal moves to owned clearing, never new income. Already-deducted payroll is not deducted again. Explicit purchase quotes and lookback assumptions determine shares/benefit; missing prices leave money in clearing. Tax timing is configurable as a modeling assumption; recognized benefit adjusts basis to prevent duplicate gain tax. Actual plan limits and jurisdiction rules must be reviewed.
- **RSU:** unvested awards are not owned liquid assets. Actual dated vesting settles once into after-tax shares or cash. Later sale transfers existing value rather than repeating salary. Fixed-value schedules are capped by declared award value; share-based schedules can use an explicit share cap, without treating historical grant FMV as a legal ceiling on later share value.
- **Retirement:** choose target monthly spending in today's purchasing power or retirement-date nominal terms, or keep the existing expense path. A target replaces base spending, while explicitly additional expenses remain separate. Government pension only starts at the entered age. Cash, brokerage, then accessible retirement funds cover obligations both before and after retirement.
- **Bridge / partial FI:** reports show available opening funds, needs and shortages before deferred-account access. A funding gap fails even with positive net worth. Partial FI uses a separately entered coverage goal/maintained work-income assumption; it does not automatically retire the user or treat business revenue as passive net income.
- **Household / home scenarios:** partner and missing family budgets are not assumed to be confirmed zero. Included-in-parent expenses are split, not duplicated. Home down payments/principal are asset/liability transfers; interest, closing and running costs are expenses. Only the linked rent component stops. Unknown home price/loan terms cannot fabricate a house.
- **Monte Carlo:** Base uses fixed expected returns. MC uses the same ledger for every market account, common normal shocks within a market group, time-scaled drift and square-root-time volatility. Cash is not randomly exposed to market volatility. Percentiles show net worth; success requires funding every dated need. Seed/runs and provisional status are visible. FX stays at the selected reference rate; advanced correlations and statutory tax calculations are not provided.

Profiles now save as schema version 3. Version-2 backups remain readable without a currency reconfirmation; older tabs reject the newer schema rather than stripping finance settings. Unversioned saves retain the explicit preview/migration flow. Private profile JSON imports are browser-local and unencrypted files must remain private; encrypted backup includes all finance settings.

## Tests

Run `python3 tests/run.py` with Google Chrome installed. `python3 tests/run.py --finance-only` runs independent analytic model tests without Chart.js or network access. Pass `--chrome /path/to/chrome` for a different executable.

The test runner uses Python's standard library, a localhost-only server, temporary Chrome profiles, the pinned Chart.js version, and deterministic fake exchange rates. It does not access your normal browser data or depend on the live exchange-rate API. Internet access is required to obtain Chart.js from its existing CDN.

Coverage includes mixed-currency calculations and display toggles, load/migration failures, save conflicts and quota errors, import validation, encrypted file/token round trips, stale/offline FX handling, locale pages, and keyboard-accessible dialogs. No build step or Node installation is required.

## Tech Stack

- Vanilla JavaScript (no framework)
- [Chart.js](https://www.chartjs.org/) for visualizations
- Mulberry32 PRNG for deterministic Monte Carlo runs
- LocalStorage for state persistence
