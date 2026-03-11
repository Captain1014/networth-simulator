# Monte Carlo Chart Guide

## What the Chart Shows

In Monte Carlo mode, the app runs **1,000 simulations**, then groups asset levels by **percentile** for each year.

- **X-axis**: Age (current age → 100)
- **Y-axis**: Total assets (after tax) — nominal amount

---

## What the Three Lines Mean

| Line | Meaning | How to read it |
|------|--------|-----------------|
| **90th %ile (p90)** | Assets of the top 10% of paths | **Good case**: In about 100 of 1,000 runs, assets stay at or above this level. |
| **Median (p50)** | Assets of the middle path | **Typical case**: Half of runs are above this, half below. A more realistic “average” path than a single deterministic run. |
| **10th %ile (p10)** | Assets of the bottom 10% of paths | **Bad case**: In about 100 of 1,000 runs, assets fall to this level or lower. If this line is near 0, about 10% of paths are nearly depleted by that age. |

- **Band between p10 and p90**: Most paths (about 80%) fall within this band.
- If **p50** stays well above 0, you can read it as “in a typical case, assets are likely to last.”
- If **p10** drops near 0 early, that’s a signal that “in bad return sequences, a noticeable share of paths deplete sooner.”

---

## Success Rate

- **Definition**: Of 1,000 simulations, the share where **assets never fall to zero or below by age 100**.
- **Example**: 87% → In 870 runs assets last to 100; in 130 runs they are depleted before then.
- **How to interpret**:
  - **Higher (e.g. 90%+)** → The plan has more cushion against volatility.
  - **Lower (e.g. under 70%)** → Revisit return, volatility, and spending assumptions, or consider saving more or retiring later.

---

## Changing Volatility

- **Higher volatility** (e.g. 15% → 20%): Returns vary more; p10 tends to drop, p90 to rise. **Success rate usually goes down**.
- **Lower volatility**: Paths bunch together; p10, p50, p90 narrow and look closer to a single path. Success rate usually goes up.

---

## One-Line Summary

- **Median (p50)**: “Expected asset path in a typical case.”
- **p10–p90 band**: “Bad case to good case” range.
- **Success rate**: “Probability that assets last to 100.”
