# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kreutzx/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kreutzx/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: pre-token protocols ranked by implied value, with farm plans. Built by an AI agent for make.fun's token-radar-01 bounty, $1325 in USDC.

## The model (radar-7)

Radar-7 keeps radar-6's fitted-at-run-time discipline — every term kept or dropped on two blind tests, the full ablation printed on every run — and changes two things, both measured before they were shipped:

- **Softened fallback factors (value).** A category with at least three comps keeps its own factor, exactly as radar-6 fitted it. What changed is what a thin category inherits: the family factor is now shrunk by n/(n+4) and damped to 0.35 strength (was n/(n+3) at 0.45), and the global factor is damped to 0.35 as well. A borrowed opinion is held at arm's length. Held out: leave-one-out median |log error| 1.1225 (×/÷ 3.07; radar-6: 1.1259), walk-forward 0.7617 (×/÷ 2.14; radar-6: 0.8196), five-fold 1.1791 (unchanged). A grid around the point — family damp 0.30–0.40, shrink 4–8 — sits on the same plateau; the shipped point is its middle, not its edge.
- **Token odds that read the snapshot's own record.** The ridge logistic gains three terms, each kept on the same two-test rule: watchlist membership, each category's token record (the share of the category's protocols that already carry a token, computed inside every fit from the fitting rows only, shrunk by 12 pseudo-counts), and an age × size interaction — with log TVL re-tested behind them and now kept, and chain count behind that and still refused. Scored as probabilities three ways: leave-one-out Brier 0.1828, ten-fold 0.1828, walk-forward 0.2028, against radar-6's 0.2042 / 0.2036 / 0.2244 and the base rate's 0.3207 walk-forward. Platt and isotonic recalibrations were fitted and rejected — neither lowered the walk-forward Brier. This run: 20 FARM / 116 THIN / 62 SKIP. Dossier 668,648 bytes.

## The model (radar-6)

Nothing on this board is asserted. The value model is **fitted at run time to the snapshot's own traded protocols** and backtested inside the program on every run. Radar-6 keeps radar-5's robust refit and changes three things, each kept only because it wins on two blind tests the fit never sees — and the program prints the full ablation, kept and dropped terms alike, on every run:

- **Recency-weighted category factors.** Each category's factor is the median of its comps' residuals against the size curve, shrunk by n/(n+3) and damped to 0.45 strength — but now the median is recency-weighted: a comp listed in the newer half of the fit set counts twice, one from the older half counts half, one with no date counts one and a half. The regime a launch would meet is the recent one. Held out: leave-one-out median |log error| 1.1259 (×/÷ 3.08; radar-5: 1.1861), walk-forward 0.8196 (×/÷ 2.27; radar-5: 0.9225), five-fold 1.1791 (radar-5: 1.1936).
- **Token odds as a fitted logistic.** Radar-5's peer cells are replaced by a ridge logistic on age, family and 7-day growth (the terms the ablation kept), fitted against the record of which of the 758 protocols already carry a token. Scored as probabilities three ways: leave-one-out Brier 0.2042 (cells: 0.2144), ten-fold 0.2036, walk-forward 0.2244 (cells: 0.2865) against the base rate's 0.3207. Its coefficients are printed in METHOD.md. A survival-style adjustment was fitted and rejected (Brier 0.3246 — it prices a different event).
- **Bootstrap ranges and benchmarked verdicts.** Every row's range is its own distribution over 200 seeded bootstrap refits (P25–P75, P10–P90, and the ranks it takes across refits); measured on held-out comps, real caps fall inside the middle-half band 50% of the time (stated 50%) and the middle-80% band 80% (stated 80%). Verdicts are priced on one stated scenario — a $10,000 deposit at a 7% drop share over the plan's hold: FARM must beat the plan's fees, a 4% T-bill on the same deposit, $25 per hands-on hour, odds of 0.5 and the rich line (implied ≥ 25% of TVL). This run: 19 FARM / 138 THIN / 41 SKIP.
- **The audit is the interface.** The dashboard opens with the strongest held-out numbers, a coverage bar accounting for all 758 protocols in disjoint groups, and an integrity strip that recomputes every row, the rank order, the ledger and a board checksum in the browser. Each row's detail shows its nearest priced peers with the model's held-out price beside the actual cap, the terms tested and not used, and the verdict's sensitivity to the drop share and deposit size. Growth is still not a launch-value input (0 of 119 comps grew more than 5% in the snapshot week; 88 fell more than 5%) — the ablation shows it failing there and passing in the odds, where it belongs.

The board ranks all 198 rankable pre-token protocols (watchlist 40/40) and accounts for all 758 snapshot protocols; every row carries a mechanism-specific, nine-step farm plan with a dollar cost and a duration on each step, ending in the priced verdict. The full audit is generated as `METHOD.md` into the dashboard output on every build.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=24q484pk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
