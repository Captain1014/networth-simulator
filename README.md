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
js/app.js           # All application logic
docs/               # Design notes and guides
```

## Usage

Open `index.html` (or `eng/index.html` for English) in any browser. No build step or server needed — everything runs client-side with vanilla HTML/CSS/JS and Chart.js.

## Tech Stack

- Vanilla JavaScript (no framework)
- [Chart.js](https://www.chartjs.org/) for visualizations
- Mulberry32 PRNG for deterministic Monte Carlo runs
- LocalStorage for state persistence
