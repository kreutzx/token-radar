// Token Radar model "radar-4": one sealed snapshot in, one ranked board out.
//
// radar-4 keeps radar-3's fitted model exactly as it was — the same size
// curve, category factors, token odds, priors and verdict lines, so every
// row's price is unchanged — and widens the validation around it. Where
// radar-3 reported two backtests (leave-one-out and a walk-forward time
// split), radar-4 adds a second, independent held-out test: a five-fold
// holdout whose folds are dealt by a hash of the protocol's slug, so the
// split owes nothing to listing date, size or the order of the snapshot.
// A comp is only ever priced by a model that never saw it, three different
// ways, and all three error bands are printed on the dashboard and in
// METHOD.md.
//
// radar-3 replaced radar-2's asserted multiple (a flat TVL x 0.32 with
// hand-picked sector factors) with a model fitted to the snapshot's own traded
// protocols, validated inside this program, and priced with its uncertainty
// shown. Nothing is keyed to a protocol's name; every number below is either
// fitted from the snapshot at run time or listed under PRIORS as a stated
// judgement, never fitted and never hidden.
//
// Launch value (what a token would be worth if it launched at the value the
// traded record supports):
//
//   curve_usd   = exp(A + B x ln tvl_usd)        A, B fitted by OLS on the
//                                                traded comps (see fitComps)
//   launch_usd  = round(curve_usd x category_factor x struct_mult x haircut)
//
//   category_factor  the category's shrunk, damped median residual against
//                    the curve, with family fallbacks (fitted)
//   struct_mult      0.5 for curator categories, whose TVL is nested inside
//                    other protocols on this same board (prior, see PRIORS)
//   haircut          0.9 for a protocol in sharp one-week decline or too new
//                    to price (prior, see PRIORS)
//
// Implied value (the board's ranking number) is the launch value weighted by
// the chance the protocol ever records a token, estimated from its peers:
//
//   implied_usd = round(launch_usd x token_odds)
//
//   token_odds  the share of comparable protocols (same age band, same TVL
//               band) that already record a token, shrunk toward the global
//               share (fitted from the snapshot's cross-section)
//
// The band on every row is exp(median |log error|) of a leave-one-out
// backtest of the launch model over the traded comps, recomputed each run.
// Two further held-out tests are reported beside it on the dashboard and in
// METHOD.md: a walk-forward split (fit on the earlier-listed half of the
// comps, scored on the later half) and a five-fold holdout dealt by slug
// hash (fit on four folds, score the fifth, rotate until every comp has
// been priced out of sample exactly once).
//
// Seven-day growth is deliberately NOT a launch-value input: fitted on the
// traded comps its slope comes out negative and regime-bound (the snapshot
// week was a falling week; no traded comp grew more than 5%), so growth
// enters through the odds peers, the concern haircut and the farm verdict
// instead of scaling value. METHOD.md shows the counts behind that choice.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** Stated judgements, printed as priors wherever the fit is printed. */
export const PRIORS = {
  /** Curator TVL is nested: the same dollars sit in the underlying protocols. */
  curator_mult: 0.5,
  /** Applied to a protocol in sharp decline or too new to price. */
  concern_haircut: 0.9,
  concern_fall_pct: -25,
  concern_age_days: 21,
  /** Peer-share shrinkage weight for the token-odds cells. */
  odds_shrink: 12,
  /** Verdict lines, efficiency path: expected value per TVL dollar, and odds. */
  farm_density: 0.25,
  farm_odds: 0.5,
  thin_density: 0.05,
  thin_odds: 0.2,
  /** Verdict lines, absolute path: a large expected value at high odds farms even when thin per TVL dollar. */
  farm_abs_usd: 5_000_000,
  farm_abs_odds: 0.6,
  farm_abs_density: 0.02,
  thin_abs_usd: 1_000_000,
  thin_abs_odds: 0.45,
} as const;

/** Categories whose TVL is an allocation over other protocols' TVL. */
export const CURATOR_CATEGORIES: ReadonlySet<string> = new Set([
  'Risk Curators',
  'Onchain Capital Allocator',
]);

export const MODEL_VERSION = 'radar-4';

/** How many folds the slug-dealt holdout rotates through. */
export const HOLDOUT_FOLDS = 5;

/** How many live-token protocols the dashboard's Live view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  launch_value_usd: number;
  token_odds: number;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  est_cost_usd: number;
  model: {
    curve_usd: number;
    category_factor: number;
    factor_source: string;
    struct_mult: number;
    haircut: number;
    concern: boolean;
    odds: number;
    band_factor: number;
  };
  farm_steps: string[];
}

/** One row as the dashboard's data.js carries it (farm plan included, verbatim). */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  curve_usd: number;
  category_factor: number;
  factor_source: string;
  struct_mult: number;
  haircut: number;
  concern: boolean;
  launch_value_usd: number;
  token_odds: number;
  odds_peers: string;
  implied_value_usd: number;
  band_lo_usd: number;
  band_hi_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  est_cost_usd: number;
  watchlist: boolean;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One fitted category factor, as the dashboard and METHOD.md print it. */
export interface FactorRow {
  category: string;
  comps: number;
  factor: number;
  source: 'category' | 'family' | 'global';
}

/** The fit and its backtests, recomputed from the snapshot on every run. */
export interface FitReport {
  comps: number;
  intercept: number;
  slope: number;
  band_factor: number;
  loo_median_abs_log_err: number;
  loo_within_2x: number;
  loo_within_3x: number;
  wf_train: number;
  wf_test: number;
  wf_split_listed_at: string;
  wf_median_abs_log_err: number;
  wf_band_factor: number;
  wf_within_3x: number;
  kf_folds: number;
  kf_test: number;
  kf_median_abs_log_err: number;
  kf_band_factor: number;
  kf_within_2x: number;
  kf_within_3x: number;
  comps_grew_5: number;
  comps_fell_5: number;
  traded_total: number;
  traded_share: number;
}

/** How the snapshot's protocols divide, so the page accounts for all of them. */
export interface Accounting {
  total: number;
  traded: number;
  with_mcap: number;
  ranked: number;
  unranked: { reason: string; count: number }[];
  watchlist: number;
  watchlist_ranked: number;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  fit: FitReport;
  factors: FactorRow[];
  priors: typeof PRIORS;
  haircut_rows: number;
  curator_rows: number;
  verdict_counts: { FARM: number; THIN: number; SKIP: number };
  accounting: Accounting;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot cannot be scored. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** The middle element of a sorted copy (lower median for even counts). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Whole days from listed_at to as_of, clamped at zero; null when either is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether the record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A name ending in a release marker is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Categories that are not a launch of their own: exchanges and wrapped/staked/bridged products. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Why a pre-token protocol is not ranked, or null when it is rankable. */
export function unrankedReason(p: SnapshotProtocol): string | null {
  if (!isPreToken(p)) return 'already records a token';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return 'a bridge, staking or exchange product, not a launch of its own';
  if (VERSIONED.test(p.name)) return 'a versioned pool of another protocol';
  if (EXCHANGE_PREFIX.test(p.name)) return 'an exchange product';
  if (WRAPPED_WORD.test(p.name)) return 'a wrapped or staked product of another protocol';
  return null;
}

/** Whether a protocol may be ranked: pre-token, and not an excluded product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return unrankedReason(p) === null;
}

// ---------------------------------------------------------------- the fit

/** A fitted launch model: the size curve plus a factor lookup by category. */
interface FittedModel {
  intercept: number;
  slope: number;
  factorFor: (category: string | null) => { factor: number; source: 'category' | 'family' | 'global' };
}

/** The traded comps the fit learns from: a token trades, both figures present, not an exchange token. */
export function tradedComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX',
  );
}

/** Ordinary least squares of y on x. */
function ols(xs: number[], ys: number[]): { intercept: number; slope: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { intercept: my - slope * mx, slope };
}

/** Coarse families a category factor falls back to when the category itself is thin. */
const FAMILIES: { name: string; keys: string[] }[] = [
  { name: 'bridge', keys: ['bridge'] },
  { name: 'credit', keys: ['lend', 'cdp', 'collateral'] },
  { name: 'exchange', keys: ['dex', 'liquidity'] },
  { name: 'staking', keys: ['staking', 'restaking', 'restaked'] },
  { name: 'yield', keys: ['yield', 'farm', 'allocator', 'curator', 'basis'] },
  { name: 'derivatives', keys: ['derivative', 'perpetual', 'options', 'synthetics'] },
  { name: 'stable', keys: ['stable', 'algo'] },
  { name: 'rwa', keys: ['rwa'] },
];

function familyOf(category: string | null): string | null {
  if (category === null) return null;
  const c = category.toLowerCase();
  for (const f of FAMILIES) {
    if (f.keys.some((k) => c.includes(k))) return f.name;
  }
  return null;
}

/**
 * Fit the launch model on a set of traded comps: OLS of log market cap on log
 * TVL, then each category's factor as its median residual against the curve,
 * shrunk by n/(n+4) and damped to half strength in log space, with the same
 * treatment one level up for families and a global factor over all residuals
 * as the last resort.
 */
function fitModel(comps: SnapshotProtocol[]): FittedModel {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const { intercept, slope } = ols(xs, ys);
  const residuals = comps.map((p, i) => ys[i]! - (intercept + slope * xs[i]!));

  const shrunkFactor = (members: number[]): number =>
    Math.exp(0.5 * (members.length / (members.length + 4)) * median(members));

  const byCategory = new Map<string, number[]>();
  const byFamily = new Map<string, number[]>();
  comps.forEach((p, i) => {
    const cat = p.category ?? '(none)';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(residuals[i]!);
    const fam = familyOf(p.category);
    if (fam !== null) {
      if (!byFamily.has(fam)) byFamily.set(fam, []);
      byFamily.get(fam)!.push(residuals[i]!);
    }
  });
  const globalFactor = round4(shrunkFactor(residuals));

  return {
    intercept,
    slope,
    factorFor: (category) => {
      const catMembers = byCategory.get(category ?? '(none)');
      if (catMembers !== undefined && catMembers.length >= 3) {
        return { factor: round4(shrunkFactor(catMembers)), source: 'category' };
      }
      const fam = familyOf(category);
      const famMembers = fam === null ? undefined : byFamily.get(fam);
      if (famMembers !== undefined && famMembers.length >= 3) {
        return { factor: round4(shrunkFactor(famMembers)), source: 'family' };
      }
      return { factor: globalFactor, source: 'global' };
    },
  };
}

/** The curve's launch value for one TVL, before factors (whole dollars). */
function curveUsd(model: FittedModel, tvl: number): number {
  return Math.max(1, Math.round(Math.exp(model.intercept + model.slope * Math.log(Math.max(1, tvl)))));
}

// ---------------------------------------------------------------- token odds

/** Age and TVL bands the peer record is read in. */
function ageBand(age: number | null): string {
  if (age === null) return 'age unknown';
  if (age < 180) return 'under 6 months old';
  if (age < 365) return '6 to 12 months old';
  if (age < 730) return '1 to 2 years old';
  return 'over 2 years old';
}

function tvlBand(tvl: number): string {
  if (tvl < 10_000_000) return 'under $10M of TVL';
  if (tvl < 50_000_000) return '$10M to $50M of TVL';
  if (tvl < 200_000_000) return '$50M to $200M of TVL';
  return 'over $200M of TVL';
}

interface OddsModel {
  oddsFor: (p: SnapshotProtocol, age: number | null) => { odds: number; peers: string };
  globalShare: number;
}

/**
 * Token odds from the snapshot's own cross-section: of the protocols in a
 * protocol's age x TVL cell, the share that already record a token, shrunk
 * toward the global traded share by PRIORS.odds_shrink pseudo-protocols.
 * Cells thinner than 20 protocols fall back to the age band alone.
 */
function buildOdds(snapshot: Snapshot): OddsModel {
  const total = snapshot.protocols.length;
  const traded = snapshot.protocols.filter((p) => !isPreToken(p)).length;
  const globalShare = total === 0 ? 0 : traded / total;
  const k = PRIORS.odds_shrink;

  const cells = new Map<string, { traded: number; total: number }>();
  const bands = new Map<string, { traded: number; total: number }>();
  for (const p of snapshot.protocols) {
    const age = ageDays(snapshot.as_of, p.listed_at);
    const cellKey = `${ageBand(age)}|${tvlBand(p.tvl_usd)}`;
    const bandKey = ageBand(age);
    for (const [map, key] of [
      [cells, cellKey],
      [bands, bandKey],
    ] as const) {
      const cell = map.get(key) ?? { traded: 0, total: 0 };
      cell.total += 1;
      if (!isPreToken(p)) cell.traded += 1;
      map.set(key, cell);
    }
  }

  const shrunk = (cell: { traded: number; total: number }): number =>
    (cell.traded + k * globalShare) / (cell.total + k);

  return {
    globalShare,
    oddsFor: (p, age) => {
      const cell = cells.get(`${ageBand(age)}|${tvlBand(p.tvl_usd)}`);
      const band = bands.get(ageBand(age)) ?? { traded: 0, total: 0 };
      const use = cell !== undefined && cell.total >= 20 ? cell : band;
      const odds = round4(clamp(shrunk(use), 0.01, 0.95));
      return {
        odds,
        peers: `${use.traded} of ${use.total} peers ${ageBand(age)}${use === cell ? ` with ${tvlBand(p.tvl_usd)}` : ''} already record a token`,
      };
    },
  };
}

// ---------------------------------------------------------------- backtests

/** The launch model's error on one comp, in log space (curve x category factor). */
function launchError(model: FittedModel, comp: SnapshotProtocol): number {
  const { factor } = model.factorFor(comp.category);
  const predicted = Math.exp(model.intercept + model.slope * Math.log(comp.tvl_usd)) * factor;
  return Math.abs(Math.log(comp.mcap_usd!) - Math.log(Math.max(1, predicted)));
}

/**
 * Which holdout fold a comp belongs to: a 32-bit FNV-1a hash of its slug,
 * taken modulo the fold count. The deal is a pure function of the slug, so
 * it is identical on every run and owes nothing to the comp's listing date,
 * its size, or its place in the snapshot — the property that makes this
 * holdout independent of the walk-forward's time split.
 */
function foldOf(slug: string, folds: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % folds;
}

/**
 * All three backtests, run on every build: leave-one-out over all traded
 * comps (refit without the comp, then price it), a walk-forward split that
 * fits on the earlier-listed half of the dated comps and prices the later
 * half, and a five-fold holdout dealt by slug hash that fits on four folds
 * and prices the fifth, rotating until every comp has been held out once.
 */
function backtests(comps: SnapshotProtocol[]): Omit<FitReport, 'comps' | 'intercept' | 'slope' | 'comps_grew_5' | 'comps_fell_5' | 'traded_total' | 'traded_share'> {
  const looErrors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const rest = comps.filter((_, j) => j !== i);
    looErrors.push(launchError(fitModel(rest), comps[i]!));
  }
  const looMedian = median(looErrors);

  const dated = comps
    .filter((p) => p.listed_at !== null)
    .sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const wfModel = fitModel(train);
  const wfErrors = test.map((p) => launchError(wfModel, p));
  const wfMedian = median(wfErrors);

  const kfErrors: number[] = [];
  for (let fold = 0; fold < HOLDOUT_FOLDS; fold++) {
    const kfTrain = comps.filter((p) => foldOf(p.slug, HOLDOUT_FOLDS) !== fold);
    const kfTest = comps.filter((p) => foldOf(p.slug, HOLDOUT_FOLDS) === fold);
    if (kfTrain.length === 0 || kfTest.length === 0) continue;
    const kfModel = fitModel(kfTrain);
    for (const p of kfTest) kfErrors.push(launchError(kfModel, p));
  }
  const kfMedian = median(kfErrors);

  const share = (errors: number[], limit: number): number =>
    errors.length === 0 ? 0 : round3(errors.filter((e) => e < limit).length / errors.length);

  return {
    band_factor: round4(Math.exp(looMedian)),
    loo_median_abs_log_err: round4(looMedian),
    loo_within_2x: share(looErrors, Math.log(2)),
    loo_within_3x: share(looErrors, Math.log(3)),
    wf_train: train.length,
    wf_test: test.length,
    wf_split_listed_at: train.length > 0 ? train[train.length - 1]!.listed_at! : '',
    wf_median_abs_log_err: round4(wfMedian),
    wf_band_factor: round4(Math.exp(wfMedian)),
    wf_within_3x: share(wfErrors, Math.log(3)),
    kf_folds: HOLDOUT_FOLDS,
    kf_test: kfErrors.length,
    kf_median_abs_log_err: round4(kfMedian),
    kf_band_factor: round4(Math.exp(kfMedian)),
    kf_within_2x: share(kfErrors, Math.log(2)),
    kf_within_3x: share(kfErrors, Math.log(3)),
  };
}

// ---------------------------------------------------------------- farm plans

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** Capital for one farm position, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 300;
  if (p.tvl_usd >= 1_000_000_000) return 200;
  if (p.tvl_usd >= 100_000_000) return 120;
  return 60;
}

/** Hold length from the protocol's age: younger protocols need a longer window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** What one transaction costs on a chain, as a budget range and a midpoint. */
function gasFor(chain: string): { text: string; mid: number } {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return { text: 'about $4 to $9 of gas per transaction on Ethereum', mid: 6.5 };
  if (c.includes('solana')) return { text: 'about $0.02 of fees per transaction on Solana', mid: 0.02 };
  if (c.includes('bitcoin')) return { text: 'about $1 to $3 of network fees per Bitcoin transaction', mid: 2 };
  if (
    c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon') ||
    c.includes('monad') || c.includes('hyperliquid') || c.includes('plasma') || c.includes('ink') ||
    c.includes('berachain') || c.includes('sei')
  ) {
    return { text: `about $0.05 to $0.60 of gas per transaction on ${chain}`, mid: 0.3 };
  }
  return { text: `about $0.50 to $2 of gas per transaction on ${chain}`, mid: 1.25 };
}

/** The mechanism family a farm plan is written for, from the category. */
type Mechanism = 'credit' | 'exchange' | 'bridge' | 'staking' | 'curator' | 'derivatives' | 'yield' | 'plain';

function mechanismOf(p: SnapshotProtocol): Mechanism {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'credit';
  if (c.includes('dex') || c.includes('liquidity')) return 'exchange';
  if (c.includes('staking') || c.includes('restaking') || c.includes('restaked')) return 'staking';
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return 'derivatives';
  if (c.includes('yield') || c.includes('farm') || c.includes('basis') || c.includes('aggregator')) return 'yield';
  return 'plain';
}

/** The plan's core position step, per mechanism: what to open, with cost and time. */
function coreStep(mech: Mechanism, p: SnapshotProtocol, capital: number, chain: string, gasText: string): string {
  const name = p.name;
  switch (mech) {
    case 'credit':
      return `Supply $${capital} of USDC as collateral to ${name} on ${chain} and borrow no more than 40% of it in a stablecoin, keeping the health factor above 1.6. Cost: $${capital} of capital and ${gasText}. Time: 15 minutes.`;
    case 'exchange':
      return `Provide $${capital} of liquidity to ${name}'s deepest USDC pool on ${chain}, in the tightest range you will check weekly, and keep the position open. Cost: $${capital} of capital and ${gasText}. Time: 20 minutes.`;
    case 'bridge':
      return `Bridge $${capital} of USDC from Ethereum to ${chain} through ${name}, then deposit the bridged funds into one app on ${chain} the same day so the trip counts as use, not transit. Cost: $${capital} of capital, ${gasText}, plus the bridge's own fee of about 0.1%. Time: 30 minutes including the wait for finality.`;
    case 'staking':
      return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the liquid receipt token in the farming wallet, unstaked nowhere else. Cost: $${capital} of capital and ${gasText}. Time: 10 minutes.`;
    case 'curator':
      return `Deposit $${capital} of USDC into one ${name} vault on ${chain} whose strategy you can explain in one sentence, and hold the vault shares in the farming wallet. Cost: $${capital} of capital and ${gasText}. Time: 15 minutes, most of it reading the vault's strategy page.`;
    case 'derivatives':
      return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one hedged position under $20 notional (long spot against a short perp, or the reverse). Cost: $${capital} of capital and ${gasText}. Time: 20 minutes.`;
    case 'yield':
      return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault or farm on ${chain} and leave the receipt in the farming wallet. Cost: $${capital} of capital and ${gasText}. Time: 15 minutes.`;
    default:
      return `Deposit $${capital} of USDC into ${name} on ${chain} through its own interface and keep the position open. Cost: $${capital} of capital and ${gasText}. Time: 15 minutes.`;
  }
}

/** The plan's second step: the mechanism-specific habit that keeps the position qualifying. */
function habitStep(mech: Mechanism, p: SnapshotProtocol, gasText: string): string {
  const name = p.name;
  switch (mech) {
    case 'credit':
      return `Set a calendar check for the loan: if collateral value falls 15%, repay part of the borrow the same day; never let the health factor drift under 1.3. Cost: ${gasText} only when you act. Time: 5 minutes a week to look.`;
    case 'exchange':
      return `Check the position's range every week and re-centre it once if the price has left the range; an out-of-range position earns nothing and shows no activity. Cost: ${gasText} a week at most. Time: 10 minutes a week.`;
    case 'bridge':
      return `Bridge a small $10 to $20 back the other way once a month, so the route shows two-way use rather than a single one-way trip. Cost: ${gasText} plus about 0.1% of the amount. Time: 15 minutes a month.`;
    case 'staking':
      return `Claim and re-stake the rewards once a month, or vote with the receipt token when ${name} holds a governance vote. Cost: ${gasText} a month. Time: 10 minutes a month.`;
    case 'curator':
      return `Read the vault's monthly reallocation note and confirm your vault was not merged or wound down; move to the successor vault the week it is announced if it was. Cost: ${gasText} only when you move. Time: 10 minutes a month.`;
    case 'derivatives':
      return `Open and close one small trade a week (under $20 notional, hedged), keeping total weekly volume under $100 so the account reads as a user, not a wash trader. Cost: ${gasText} plus under $1 of trading fees a week. Time: 15 minutes a week.`;
    case 'yield':
      return `Compound the yield back into the same vault once a month, or move it to ${name}'s next vault when one opens, so the balance history shows continued use. Cost: ${gasText} a month. Time: 10 minutes a month.`;
    default:
      return `Make one small qualifying action a week on ${name}: a deposit, a swap, a vote or a claim, always from the same wallet. Cost: ${gasText} a week. Time: 10 minutes a week.`;
  }
}

export interface PlanContext {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  density: number;
  odds: number;
  estCost: number;
}

/** A protocol's farm plan: seven steps, each with what it costs and how long it takes, ending in the verdict. */
export function farmPlan(p: SnapshotProtocol, age: number | null, ctx: PlanContext): { steps: string[]; estCost: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const mech = mechanismOf(p);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const estCost = Math.max(1, Math.round(gas.mid * (4 + weeks)));
  const verdictLine =
    ctx.verdict === 'FARM'
      ? `the plan clears one of the board's FARM lines: at least $${PRIORS.farm_density} of expected value per TVL dollar at odds of ${PRIORS.farm_odds} or better, or at least $5M of expected value at odds of ${PRIORS.farm_abs_odds} or better`
      : ctx.verdict === 'THIN'
        ? `the plan lands at THIN: worth a small position only — it clears the board's THIN line but neither FARM line (the efficiency line at $${PRIORS.farm_density} per TVL dollar and odds ${PRIORS.farm_odds}, or the absolute line at $5M expected and odds ${PRIORS.farm_abs_odds})`
        : `the plan lands at SKIP: under the board's THIN line (odds at least ${PRIORS.thin_odds} with $${PRIORS.thin_density} per TVL dollar, or $1M expected at odds ${PRIORS.thin_abs_odds}), the expected value does not cover even this plan's $${estCost} of fees`;
  const steps = [
    `Open a fresh wallet for ${p.name} alone, write its seed phrase on paper, and fund it with the $${capital} of capital plus fee money from an exchange. Cost: ${gas.text} for the first transaction. Time: 10 minutes.`,
    coreStep(mech, p, capital, chain, gas.text),
    habitStep(mech, p, gas.text),
    `Hold the position for at least ${hold} days without withdrawing, so the activity spans more than one snapshot of the protocol's records. Cost: the $${capital} stays in the position for ${hold} days; total fees over the hold come to about $${estCost}. Time: ${hold} days.`,
    `Once a month, open ${p.name}'s own points or rewards page from its official site or docs and check the wallet and position are counted; never follow a link from a message or a search ad. Cost: no fee to check, and never pay to claim anything. Time: 10 minutes a month.`,
    `Keep a farm log with the wallet address, the dates, every transaction hash and the $${capital} position, so the position can be repeated or unwound in one sitting. Cost: nothing but the log. Time: 5 minutes.`,
    `Verdict ${ctx.verdict}: peers like this one record a token ${Math.round(ctx.odds * 100)}% of the time and the model prices about $${ctx.density.toFixed(2)} of expected value per TVL dollar, so ${verdictLine}. Exit: unwind the position, and if a token is ever announced, claim only from the link on ${p.name}'s own site, then revoke its spending approval. Cost: ${gas.text} to exit. Time: 15 minutes.`,
  ];
  return { steps: steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s)), estCost };
}

// ---------------------------------------------------------------- scoring

/** The plan's fee estimate, from the chain's gas midpoint over the hold (setup, weekly, exit). */
function estCostFor(p: SnapshotProtocol, age: number | null): number {
  const gas = gasFor(chainOf(p));
  const weeks = Math.max(1, Math.ceil(holdDaysFor(age) / 7));
  return Math.max(1, Math.round(gas.mid * (4 + weeks)));
}

/** One protocol fully priced by the fitted model. */
interface Scored {
  p: SnapshotProtocol;
  age: number | null;
  curve: number;
  factor: number;
  factorSource: 'category' | 'family' | 'global';
  struct: number;
  haircut: number;
  concern: boolean;
  launch: number;
  odds: number;
  peers: string;
  implied: number;
  bandLo: number;
  bandHi: number;
  density: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  estCost: number;
}

function scoreProtocol(
  p: SnapshotProtocol,
  snapshot: Snapshot,
  model: FittedModel,
  oddsModel: OddsModel,
  bandFactor: number,
): Scored {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const curve = curveUsd(model, p.tvl_usd);
  const { factor, source } = model.factorFor(p.category);
  const struct = CURATOR_CATEGORIES.has(p.category ?? '') ? PRIORS.curator_mult : 1;
  const concern =
    (p.change_7d !== null && p.change_7d <= PRIORS.concern_fall_pct) ||
    (age !== null && age < PRIORS.concern_age_days);
  const haircut = concern ? PRIORS.concern_haircut : 1;
  const launch = Math.max(1, Math.round(curve * factor * struct * haircut));
  const { odds, peers } = oddsModel.oddsFor(p, age);
  const implied = Math.max(1, Math.round(launch * odds));
  const density = p.tvl_usd > 0 ? implied / p.tvl_usd : 0;
  const efficient = density >= PRIORS.farm_density && odds >= PRIORS.farm_odds;
  const absolute =
    implied >= PRIORS.farm_abs_usd && odds >= PRIORS.farm_abs_odds && density >= PRIORS.farm_abs_density;
  let verdict: Scored['verdict'] =
    efficient || absolute
      ? 'FARM'
      : (density >= PRIORS.thin_density && odds >= PRIORS.thin_odds) ||
          (implied >= PRIORS.thin_abs_usd && odds >= PRIORS.thin_abs_odds)
        ? 'THIN'
        : 'SKIP';
  if (concern && verdict === 'FARM') verdict = 'THIN';
  return {
    p,
    age,
    curve,
    factor,
    factorSource: source,
    struct,
    haircut,
    concern,
    launch,
    odds,
    peers,
    implied,
    bandLo: Math.max(1, Math.round(implied / bandFactor)),
    bandHi: Math.round(implied * bandFactor),
    density,
    verdict,
    estCost: estCostFor(p, age),
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the entry ships, from the snapshot: the board, the page's data, the audit numbers. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const comps = tradedComps(snapshot);
  const model = fitModel(comps);
  const bt = backtests(comps);
  const oddsModel = buildOdds(snapshot);

  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => scoreProtocol(p, snapshot, model, oddsModel, bt.band_factor));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const watchlist = new Set(snapshot.watchlist);
  const board: BoardRow[] = scored.map((s, i) => {
    const { steps } = farmPlan(s.p, s.age, { verdict: s.verdict, density: s.density, odds: s.odds, estCost: s.estCost });
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.age,
      launch_value_usd: s.launch,
      token_odds: s.odds,
      implied_value_usd: s.implied,
      band_lo_usd: s.bandLo,
      band_hi_usd: s.bandHi,
      verdict: s.verdict,
      est_cost_usd: s.estCost,
      model: {
        curve_usd: s.curve,
        category_factor: s.factor,
        factor_source: s.factorSource,
        struct_mult: s.struct,
        haircut: s.haircut,
        concern: s.concern,
        odds: s.odds,
        band_factor: bt.band_factor,
      },
      farm_steps: steps,
    };
  });

  const rows: RadarRow[] = scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    curve_usd: s.curve,
    category_factor: s.factor,
    factor_source: s.factorSource,
    struct_mult: s.struct,
    haircut: s.haircut,
    concern: s.concern,
    launch_value_usd: s.launch,
    token_odds: s.odds,
    odds_peers: s.peers,
    implied_value_usd: s.implied,
    band_lo_usd: s.bandLo,
    band_hi_usd: s.bandHi,
    verdict: s.verdict,
    est_cost_usd: s.estCost,
    watchlist: watchlist.has(s.p.slug),
    farm_steps: board[i]!.farm_steps,
  }));

  const live = liveRows(snapshot);
  const boardSlugs = new Set(board.map((r) => r.slug));
  const reasonCounts = new Map<string, number>();
  for (const p of snapshot.protocols) {
    if (!isPreToken(p) || boardSlugs.has(p.slug)) continue;
    const reason = unrankedReason(p) ?? 'not selected';
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }

  const factorRows = new Map<string, FactorRow>();
  for (const s of scored) {
    const label = s.p.category ?? '(none)';
    if (!factorRows.has(label)) {
      factorRows.set(label, {
        category: label,
        comps: comps.filter((c) => (c.category ?? '(none)') === label).length,
        factor: s.factor,
        source: s.factorSource,
      });
    }
  }

  const fit: FitReport = {
    comps: comps.length,
    intercept: round4(model.intercept),
    slope: round4(model.slope),
    ...bt,
    comps_grew_5: comps.filter((c) => (c.change_7d ?? 0) > 5).length,
    comps_fell_5: comps.filter((c) => (c.change_7d ?? 0) < -5).length,
    traded_total: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    traded_share: round3(oddsModel.globalShare),
  };

  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    fit,
    factors: [...factorRows.values()].sort((a, b) => b.factor - a.factor),
    priors: PRIORS,
    haircut_rows: scored.filter((s) => s.concern).length,
    curator_rows: scored.filter((s) => s.struct === PRIORS.curator_mult).length,
    verdict_counts: {
      FARM: scored.filter((s) => s.verdict === 'FARM').length,
      THIN: scored.filter((s) => s.verdict === 'THIN').length,
      SKIP: scored.filter((s) => s.verdict === 'SKIP').length,
    },
    accounting: {
      total: snapshot.protocols.length,
      traded: fit.traded_total,
      with_mcap: snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
      ranked: board.length,
      unranked: [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
      watchlist: snapshot.watchlist.length,
      watchlist_ranked: snapshot.watchlist.filter((s) => boardSlugs.has(s)).length,
    },
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => r.tvl_usd < snapshot.floor_usd).length,
    live_size: live.length,
    rows,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 minimum`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.band_lo_usd > r.implied_value_usd || r.band_hi_usd < r.implied_value_usd) {
      return `${r.slug} has a band that excludes its own implied value`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
  }
  return null;
}

/** The dashboard's dataset as one script: window.RADAR, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

// ---------------------------------------------------------------- METHOD.md

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const money = (n: number): string => `$${commas(Math.round(n))}`;

/**
 * The audit document the program writes beside the dashboard on every run:
 * the fit, its backtests, the priors, and the full accounting of the
 * snapshot, with the run's own numbers. It ships in the dossier, so the
 * reader of the source reads the same evidence the screenshots show.
 */
export function methodDocument(radar: RadarData): string {
  const f = radar.fit;
  const a = radar.accounting;
  const lines: string[] = [];
  lines.push('# Method — how this board prices a launch that has not happened');
  lines.push('');
  lines.push(
    `Snapshot ${radar.as_of} (${radar.source}). The board ranks ${a.ranked} pre-token protocols by implied value ` +
      `and accounts for all ${a.total} protocols in the snapshot: ${a.traded} already record a token and are set ` +
      `aside as the peer record and the Live view (${a.with_mcap} of them carry a market cap), ${a.ranked} are ` +
      `ranked here, and the rest record no token but are not a launch ` +
      `of their own (${a.unranked.map((u) => `${u.count} ${u.reason}`).join('; ')}). ` +
      `The watchlist is covered ${a.watchlist_ranked} of ${a.watchlist}.`,
  );
  lines.push('');
  lines.push('## The fit (learned from the snapshot at run time)');
  lines.push('');
  lines.push(
    `Comps: the ${f.comps} protocols whose token trades with TVL and market cap both on record, exchange ` +
      `tokens excluded (of the ${a.with_mcap} protocols that carry a market cap). Ordinary least squares of log market ` +
      `cap on log TVL over those comps gives:`,
  );
  lines.push('');
  lines.push(`    log(market cap) = ${f.intercept} + ${f.slope} x log(TVL)`);
  lines.push('');
  lines.push(
    `The slope under 1 is the size curve: ten times the TVL prices at about ${Math.pow(10, f.slope).toFixed(1)} times ` +
      `the value, not ten times. Each category then takes a factor: the median of its comps' residuals against the ` +
      `curve, shrunk by n/(n+4) and damped to half strength in log space; a category with fewer than 3 comps falls ` +
      `back to its family's factor, then to a global factor fitted on all the comps' residuals the same way. Launch value is the curve value times the category factor, the ` +
      `structural multiplier and the haircut below, rounded to whole dollars. Implied value, the ranking number, ` +
      `is launch value times token odds.`,
  );
  lines.push('');
  lines.push('Category factors fitted on their own comps, on this run:');
  lines.push('');
  for (const row of radar.factors.filter((r) => r.source === 'category')) {
    lines.push(`- ${row.category}: x${row.factor} (${row.comps} comps)`);
  }
  const famCount = radar.factors.filter((r) => r.source === 'family').length;
  const globRows = radar.factors.filter((r) => r.source === 'global');
  lines.push('');
  lines.push(
    `A further ${famCount} board categories take their family's factor, and ${globRows.length} take the global ` +
      `factor${globRows.length > 0 ? ` of x${globRows[0]!.factor}` : ''} fitted on all comps' residuals.`,
  );
  lines.push('');
  lines.push('## Validation (computed inside the program, every run)');
  lines.push('');
  lines.push(
    `- Leave-one-out: each of the ${f.comps} comps is priced by a model refitted without it. Median absolute log ` +
      `error ${f.loo_median_abs_log_err}, so every row's band is its implied value x/${f.band_factor}. ` +
      `${Math.round(f.loo_within_2x * 100)}% of comps price within x2 and ${Math.round(f.loo_within_3x * 100)}% within x3.`,
  );
  lines.push(
    `- Walk-forward: fitting on the ${f.wf_train} comps listed by ${f.wf_split_listed_at} and pricing the ` +
      `${f.wf_test} listed later gives a median absolute log error of ${f.wf_median_abs_log_err} (x/${f.wf_band_factor}), ` +
      `${Math.round(f.wf_within_3x * 100)}% within x3 — the model is not just memorising the comps it shows.`,
  );
  lines.push(
    `- Held out a second way, on a split that ignores time: the comps are dealt into ${f.kf_folds} folds by a hash ` +
      `of the slug, each fold is priced by a model fitted on the other four, and all ${f.kf_test} comps are priced ` +
      `exactly once, out of sample. Median absolute log error ${f.kf_median_abs_log_err} (x/${f.kf_band_factor}), ` +
      `${Math.round(f.kf_within_2x * 100)}% within x2 and ${Math.round(f.kf_within_3x * 100)}% within x3. Because the ` +
      `deal depends only on the slug, this test cannot be flattered by the listing order the walk-forward reads.`,
  );
  lines.push(
    `- Growth is not a launch-value input, on this evidence: ${f.comps_grew_5} of the ${f.comps} comps grew more ` +
      `than 5% in the snapshot's seven days and ${f.comps_fell_5} fell more than 5%, so a fitted growth slope is a ` +
      `falling week's artefact. Growth enters through the odds peers, the concern haircut and the farm verdicts.`,
  );
  lines.push('');
  lines.push('## Token odds (fitted from the cross-section)');
  lines.push('');
  lines.push(
    `A protocol's odds are the share of its peers that already record a token: peers are the protocols in its ` +
      `age band x TVL band cell (cells under 20 protocols fall back to the age band), shrunk toward the global ` +
      `traded share of ${f.traded_share} by ${PRIORS.odds_shrink} pseudo-protocols. Each row's detail view names ` +
      `its own peer count. Odds say how often a protocol like this one has a token on record; they never claim ` +
      `this one will launch, or when.`,
  );
  lines.push('');
  lines.push('## Priors (stated judgements, not fitted)');
  lines.push('');
  lines.push(
    `- Curator multiplier x${PRIORS.curator_mult} on ${radar.curator_rows} ranked rows (Risk Curators, Onchain ` +
      `Capital Allocator): a curator's TVL is nested inside the protocols it allocates to, so the same dollars ` +
      `would otherwise be priced twice on one board.`,
  );
  lines.push(
    `- Concern haircut x${PRIORS.concern_haircut} on ${radar.haircut_rows} ranked rows: a seven-day fall of ` +
      `${PRIORS.concern_fall_pct}% or worse, or under ${PRIORS.concern_age_days} days on record — the price is in ` +
      `flux or there is barely a record to price. A concern row can be THIN at best, never FARM.`,
  );
  lines.push(
    `- Verdict lines: FARM clears either the efficiency line (odds at least ${PRIORS.farm_odds} and at least ` +
      `$${PRIORS.farm_density} of expected value per TVL dollar) or the absolute line (at least $5M of expected ` +
      `value at odds of ${PRIORS.farm_abs_odds} or better, with at least $${PRIORS.farm_abs_density} per TVL ` +
      `dollar); THIN clears a lower line on the same two measures; the rest are SKIP. This run: ` +
      `${radar.verdict_counts.FARM} FARM, ${radar.verdict_counts.THIN} THIN, ${radar.verdict_counts.SKIP} SKIP.`,
  );
  lines.push('');
  lines.push('## Farm plans');
  lines.push('');
  lines.push(
    `Each plan is written for its protocol's mechanism (lending and CDP, DEX liquidity, bridges, staking and ` +
      `restaking, curator vaults, derivatives, yield vaults), not from one template: the steps differ in the ` +
      `position they open and the habit that keeps it qualifying. Every step states a dollar cost and a duration, ` +
      `capital follows the protocol's TVL tier, the hold follows its age, and the plan ends with its verdict and ` +
      `the arithmetic behind it. Plan fees are estimated from the first chain's gas midpoint over the hold.`,
  );
  lines.push('');
  lines.push('## Limits');
  lines.push('');
  lines.push(
    `The band is the honest part of this board: a launch value is a fitted multiple of a fragmented TVL record, ` +
      `and the leave-one-out band of x/${f.band_factor} says how far such multiples usually land from the market's ` +
      `own price. Rows are ranked by the middle of that band, never by its top. A protocol that records no token ` +
      `may still have one its DefiLlama record does not carry.`,
  );
  lines.push('');
  return lines.join('\n');
}
