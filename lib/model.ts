// Token Radar model "radar-2": one sealed snapshot in, one ranked board out.
//
// The board ranks protocols that record no token yet. It covers every slug on the
// snapshot's watchlist (the floor, never the ceiling) and adds every rankable
// pre-token protocol below that floor the snapshot carries, so the radar also
// finds the early ones. Protocols whose token already trades are never ranked:
// they are listed separately, at the market's own market cap, in the Live view.
//
// Implied value is one formula of the snapshot's own figures, applied identically
// to every protocol. No name is ever special-cased.
//
//   implied = round( tvl_usd x 0.32 x G x M x C )
//
//   G  growth:    1 + clamp(change_7d, -50, 150) / 100 x 0.8
//                 (change_7d null counts as 0: no growth signal, no penalty)
//   M  maturity:  0.70 + 0.30 x min(age_days, 730) / 730
//                 age is days from listed_at to the snapshot's as_of; an unknown
//                 age counts as 365 days. A protocol that has run longer with no
//                 token has a longer record to price, so it earns up to 1.00.
//   C  sector:    the category's FDV/TVL sector factor. Lending 1.15, Dexs 1.12,
//                 Derivatives 1.10, CDP 1.08, Yield and Yield Aggregator 1.05,
//                 Risk Curators and Onchain Capital Allocator 1.02, RWA and
//                 Stablecoins 0.95, every other category 0.90. Sectors monetise
//                 locked value at different rates; the factor is stated, fixed,
//                 and the same for every protocol in the sector.
//
// A farm plan is derived from the protocol's own record too: its category picks
// the action, its first chain picks the gas and the route, its TVL picks the
// capital, its age picks the hold. Nothing in a plan is written for one name.

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

/** The model's constants, printed in full on the dashboard. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.32,
  growth_weight: 0.8,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 730,
  unknown_age_days: 365,
};

export const MODEL_VERSION = 'radar-2';

/** Sector factor by DefiLlama category (lower-cased match); 0.90 when unlisted. */
export const SECTOR_FACTORS: Readonly<Record<string, number>> = {
  lending: 1.15,
  dexs: 1.12,
  derivatives: 1.1,
  cdp: 1.08,
  yield: 1.05,
  'yield aggregator': 1.05,
  'risk curators': 1.02,
  'onchain capital allocator': 1.02,
  rwa: 0.95,
  stablecoins: 0.95,
};

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
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    sector_factor: number;
    age_days: number | null;
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
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  sector_factor: number;
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

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  sector_factors: Readonly<Record<string, number>>;
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

/** Whole days from listed_at to as_of, clamped at zero; null when either is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The sector factor for a category: an exact match, else a contains-match, else 0.90. */
export function sectorFactor(category: string | null): number {
  if (category === null) return 0.9;
  const c = category.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(SECTOR_FACTORS, c)) return SECTOR_FACTORS[c]!;
  for (const key of Object.keys(SECTOR_FACTORS)) {
    if (c.includes(key)) return SECTOR_FACTORS[key]!;
  }
  return 0.9;
}

/** The multipliers and implied value one protocol gets under this model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; sector: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const sector = sectorFactor(protocol.category);
  const implied = Math.max(
    1,
    Math.round(protocol.tvl_usd * model.base_multiple * growthMult * maturityMult * sector),
  );
  return { implied, growthPct, growthMult, maturityMult, sector, age };
}

/** A name ending in a release marker is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Whether the record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories that are not a launch of their own: exchanges and wrapped/staked/bridged products. */
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

/** Whether a protocol may be ranked: pre-token, and not an exchange, bridge, staked or versioned product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !WRAPPED_WORD.test(p.name)
  );
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The ranked board: every watchlist slug, plus every rankable pre-token protocol below the floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd) chosen.set(p.slug, p);
  }
  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort(
    (a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0),
  );
  return scored.map((s, i) => ({
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
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      sector_factor: s.sector,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age),
  }));
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

/** What one transaction costs on a chain, in the words a farmer budgets with. */
function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $4 to $9 of gas per transaction on Ethereum';
  if (c.includes('solana')) return 'about $0.02 of fees per transaction on Solana';
  if (c.includes('bitcoin')) return 'about $1 to $3 of network fees per Bitcoin transaction';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('polygon') || c.includes('monad') || c.includes('hyperliquid') || c.includes('plasma') || c.includes('ink') || c.includes('berachain') || c.includes('sei')) {
    return `about $0.05 to $0.60 of gas per transaction on ${chain}`;
  }
  return `about $0.50 to $2 of gas per transaction on ${chain}`;
}

/** The category's core farming action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC as collateral to ${name} on ${chain}, borrow no more than 40% of it in a stablecoin, and keep the loan healthy.`;
  }
  if (c.includes('dex')) {
    return `Provide $${capital} of liquidity to ${name}'s deepest pool on ${chain} (a USDC pair if one exists), in the narrowest range you will actively manage, and keep the position open.`;
  }
  if (c.includes('yield aggregator') || c.includes('yield')) {
    return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and leave the receipt tokens in your wallet.`;
  }
  if (c.includes('leveraged farm')) {
    return `Open a $${capital} leveraged farming position on ${name} on ${chain} at no more than 2x leverage and keep the health factor above 1.5.`;
  }
  if (c.includes('bridge') || c.includes('canonical')) {
    return `Bridge $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in one app on the destination chain the same week.`;
  }
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's native asset through ${name} on ${chain} and keep the liquid receipt token in your wallet.`;
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return `Deposit $${capital} of USDC as margin on ${name} on ${chain}, open one small hedged position of under $20 notional, and close it within a week.`;
  }
  if (c.includes('prediction')) {
    return `Fund $${capital} on ${name} and place one small market position of $10 to $20, then let the rest sit as collateral.`;
  }
  if (c.includes('risk curator') || c.includes('onchain capital allocator') || c.includes('curator') || c.includes('allocator')) {
    return `Deposit $${capital} of USDC into a ${name} vault on ${chain}, pick the vault whose strategy you understand, and hold its shares.`;
  }
  if (c.includes('stable')) {
    return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the wallet you farm with.`;
  }
  if (c.includes('rwa')) {
    return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it for the full qualifying period.`;
  }
  if (c.includes('insurance')) {
    return `Buy $${capital} of cover from ${name} on ${chain} for a protocol you already use, and keep the policy active.`;
  }
  if (c.includes('liquid')) {
    return `Deposit $${capital} of the underlying asset into ${name} on ${chain} and keep the receipt token.`;
  }
  if (c.includes('options')) {
    return `Deposit $${capital} of USDC into ${name}'s vault on ${chain} and keep the position through one full expiry cycle.`;
  }
  if (c.includes('farm')) {
    return `Deposit $${capital} of USDC into ${name}'s main farm on ${chain} and keep the position open.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly recurring action. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'Repay or top up a small part of the loan, so the position shows fresh activity without changing its size much.';
  if (c.includes('dex')) return 'Rebalance the range once, or add and remove a small amount of liquidity, so the position is not a single stale deposit.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Open and close one small trade each week, keeping total weekly volume under $100.';
  if (c.includes('prediction')) return 'Settle one market and open one new small position each week.';
  if (c.includes('bridge')) return 'Bridge a small amount ($10 to $20) each week, alternating direction when the route allows it.';
  return 'Make one small qualifying action each week: a deposit, a swap, a vote, or a claim on the protocol.';
}

/** A protocol's farm plan: seven concrete steps, each with cost and time. */
export function farmSteps(p: SnapshotProtocol, age: number | null): string[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  const steps = [
    `Set up a fresh wallet that holds only the $${capital} you plan to farm with ${p.name}, write its seed phrase on paper, and fund it from an exchange. Cost: ${gas} for the first transaction, plus the $${capital} of capital. Time: 10 minutes.`,
    `${action} Cost: $${capital} of capital and ${gas}. Time: 15 minutes to set up, then confirm the position on the protocol's own page.`,
    `${weekly} Cost: ${gas} a week, roughly $1 to $10 a week in total. Time: 10 minutes a week.`,
    `Hold the position for at least ${hold} days without withdrawing, so the activity spans more than one points snapshot. Cost: the $${capital} stays locked in the position for ${hold} days. Time: ${hold} days.`,
    `Once a month, open the protocol's own points or rewards page from its official site or docs and check that your wallet and position are counted. Cost: no fee to check, and never pay to claim anything. Time: 10 minutes a month.`,
    `If the protocol ever announces a token, claim only through the link it publishes on its own site, and revoke the spending approval for ${p.name} after you finish. Cost: ${gas} to revoke. Time: 10 minutes.`,
    `Keep a farm log with the wallet address, the dates, every transaction hash and the $${capital} position, so you can repeat the position or unwind it in one step. Cost: nothing but the log. Time: 5 minutes.`,
  ];
  return steps.map((s) => (s.length > 600 ? `${s.slice(0, 596)}...` : s));
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

/** One board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    sector_factor: row.model.sector_factor,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    sector_factors: SECTOR_FACTORS,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
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
    if (
      typeof p.slug !== 'string' ||
      typeof p.name !== 'string' ||
      typeof p.tvl_usd !== 'number' ||
      !Number.isFinite(p.tvl_usd)
    ) {
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
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
