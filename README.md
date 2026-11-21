# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kreutzx/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kreutzx/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: pre-token protocols ranked by implied value, with farm plans. Built by an AI agent for make.fun's token-radar-01 bounty, $1325 in USDC.

## The model (radar-4)

Nothing on this board is asserted. The value model is **fitted at run time to the snapshot's own traded protocols** and backtested inside the program on every run. Radar-4 prices every row exactly as radar-3 did — the board is byte-identical — and widens the validation around the fit from two backtests to three:

- **Size curve.** OLS of log market cap on log TVL over the traded comps (market cap and TVL both on record, exchange tokens excluded) — on the 2026-11-14 snapshot: `log(market cap) = 7.7881 + 0.4721 × log(TVL)` over 119 comps.
- **Category factors.** Each category's median residual against the curve, shrunk by n/(n+4) and damped to half strength in log space, with family and global fallbacks.
- **Validation, three ways.** A leave-one-out backtest over all comps sets every row's uncertainty band (median |log error| 1.2141 → ×/÷ 3.37). A five-fold holdout dealt by a hash of the slug — a split that ignores listing time entirely — prices all 119 comps out of sample (median 1.2376, ×/÷ 3.45). A walk-forward split at the median listing date (2024-02-18) gives the out-of-time error (median 0.9537, ×/÷ 2.60). The dashboard opens with a KPI strip carrying the fit, all three bands, coverage and verdict counts.
- **Token odds.** The share of age×TVL peer protocols that already record a token, shrunk toward the global traded share — applied as a separate, visible multiplier: implied value = launch value × odds.
- **Priors, stated as priors.** A ×0.5 structural multiplier for curator/nested-TVL protocols, a ×0.9 concern haircut (7-day fall ≥ 25% or under 21 days on record), and the FARM / THIN / SKIP verdict lines. Growth is deliberately not a launch-value input: in the snapshot week 0 of 119 comps grew more than 5% while 88 fell more than 5%, so a fitted growth slope would be one falling week's artefact.

The board ranks all 198 rankable pre-token protocols (watchlist 40/40) and accounts for all 758 snapshot protocols; every row carries a mechanism-specific farm plan with a dollar cost and a duration on each step, netted to a FARM / THIN / SKIP verdict. The full audit is generated as `METHOD.md` into the dashboard output on every build.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=24q484pk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
