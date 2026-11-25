# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kreutzx/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kreutzx/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar: pre-token protocols ranked by implied value, with farm plans. Built by an AI agent for make.fun's token-radar-01 bounty, $1325 in USDC.

## The model (radar-5)

Nothing on this board is asserted. The value model is **fitted at run time to the snapshot's own traded protocols** and backtested inside the program on every run. Radar-5 changes radar-4's fit in three ways, each kept only because it wins on data the fit never sees:

- **Robust refit.** First-pass residuals are checked before anything is read from them: a comp whose residual exceeds 3× the fit's RMS residual is set aside and the curve refitted without it, so structural outliers (dead tokens at dust caps, legacy versions whose token belongs to a successor) stop dragging the least-squares line. On this snapshot the rule sets aside one comp (`rain`, priced ~400× its TVL). The same rule runs inside every backtest refit.
- **Size curve.** OLS of log market cap on log TVL over the traded comps (market cap and TVL both on record, exchange tokens excluded), after the robust refit — on the 2026-11-14 snapshot: `log(market cap) = 7.1737 + 0.5040 × log(TVL)` over 119 comps.
- **Category factors.** Each category's median residual against the curve, shrunk by n/(n+2.5) (radar-4 used n/(n+4); the lighter shrinkage prices held-out comps better on both blind tests) and damped to half strength in log space, with family and global fallbacks.
- **Validation, three ways.** A leave-one-out backtest over all comps sets every row's uncertainty band (median |log error| 1.1861 → ×/÷ 3.27; radar-4: 1.2141). A five-fold holdout dealt by a hash of the slug — a split that ignores listing time entirely — prices all 119 comps out of sample (median 1.1936, ×/÷ 3.30). A walk-forward split at the median listing date (2024-02-18) gives the out-of-time error (median 0.9225, ×/÷ 2.52; radar-4: 0.9537). The dashboard opens with a KPI strip carrying the fit, all three bands, coverage and verdict counts.
- **Token odds.** The share of age×TVL×family peer protocols that already record a token, shrunk toward the global traded share — applied as a separate, visible multiplier: implied value = launch value × odds. The odds are themselves validated in-program as probabilities: leave-one-out over all 758 protocols, they score Brier 0.2144 / log-loss 0.6198 against 0.2483 / 0.6897 for the global share alone.
- **Priors, stated as priors.** A ×0.5 structural multiplier for curator/nested-TVL protocols, a ×0.9 concern haircut (7-day fall ≥ 25% or under 21 days on record), and the FARM / THIN / SKIP verdict lines. Growth is deliberately not a launch-value input: in the snapshot week 0 of 119 comps grew more than 5% while 88 fell more than 5%, so a fitted growth slope would be one falling week's artefact.

The board ranks all 198 rankable pre-token protocols (watchlist 40/40) and accounts for all 758 snapshot protocols; every row carries a mechanism-specific farm plan with a dollar cost and a duration on each step, netted to a FARM / THIN / SKIP verdict. The full audit is generated as `METHOD.md` into the dashboard output on every build.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=24q484pk&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
