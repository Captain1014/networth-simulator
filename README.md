# Net Worth Simulator

A client-side net worth and retirement simulator with multi-account tracking, life events, Monte Carlo analysis, and the 4% rule.

## Features

- **Multi-account management** — Add and track pension, Roth IRA, 401(k), and other investment accounts with individual return rates and tax rules
- **Life events** — Model one-time income or expenses (home purchase, inheritance, etc.) at specific ages
- **Monte Carlo simulation** — Run 1,000 randomized return paths to see p10/p50/p90 bands and survival-to-100 success rate
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
js/app.js           # Simulation and visualizations
js/core.js          # Validation, migration, storage, and FX helpers
js/workspace.js     # Persistence, recovery, currency entry, and accessible UI
js/events.js        # Calendar-date editors and chronological life-event timeline
tests/              # Isolated headless Chrome regression tests
docs/               # Design notes and guides
```

## Usage

Open `index.html` (or `eng/index.html` for English) in any browser. No build step or server needed — everything runs client-side with vanilla HTML/CSS/JS and Chart.js.

## Saving, backup, and multiple currencies

- Basic monetary fields have separate USD and KRW inputs. Both amounts are added, not treated as alternative representations of the same balance. Leave the other currency blank if it does not apply.
- Each account, life event, and housing scenario has its own input currency. Account balances and fixed contributions use that account's currency; percentage contributions retain the existing total-income basis.
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

Financial calculations are still annual, not daily or monthly. An event affects its calendar-year bucket. Recurring additional income/expenses use the full annual amount in each overlapping year, without proration; an end date on January 1 excludes that year. Events before the projection start remain visible as history but are not reapplied to current balances. Events beyond the age-100 horizon remain visible without affecting the forecast.

Existing age-based events keep their original start/end timing and display an approximate year. Their exact date is left blank until explicitly selected. Existing end-age timing is retained until an end date is chosen or **No end date** is selected. Exact dates and the projection anchor are included in saved data and backups.

Taxable accounts have no withdrawal-age restriction in the simulator. Their age field is omitted, and a previously saved withdrawal age does not block access to those funds. Retirement-account withdrawal settings are unchanged.

## Tests

Run `python3 tests/run.py` with Google Chrome installed. Pass `--chrome /path/to/chrome` for a different executable.

The test runner uses Python's standard library, a localhost-only server, temporary Chrome profiles, the pinned Chart.js version, and deterministic fake exchange rates. It does not access your normal browser data or depend on the live exchange-rate API. Internet access is required to obtain Chart.js from its existing CDN.

Coverage includes mixed-currency calculations and display toggles, load/migration failures, save conflicts and quota errors, import validation, encrypted file/token round trips, stale/offline FX handling, locale pages, and keyboard-accessible dialogs. No build step or Node installation is required.

## Tech Stack

- Vanilla JavaScript (no framework)
- [Chart.js](https://www.chartjs.org/) for visualizations
- Mulberry32 PRNG for deterministic Monte Carlo runs
- LocalStorage for state persistence
