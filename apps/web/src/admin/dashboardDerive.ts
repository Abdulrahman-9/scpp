import { scheduleCompliancePct, type ApprovalTier, type LocalContentScope } from '@masaar/scpp-rules';
import type { WorkingCalendar } from '@masaar/working-days';
import { tenderStatus } from '../operator/derive';
import { arCompare } from '../registry/useTableSort';
import { PROGRESS_BUCKETS, type ProgressBucket } from '../registry/useHashParams';
import {
  currentStage, tenderApprovalTier,
  type ContractStageKey, type ContractState, type OperatorOrg, type State, type Tender,
} from '../store';
import { contractProgress, currentStageKey } from './contractDerive';

/**
 * Dashboard derivations — client requests 1, 2, 5, 6, 12, 13.
 *
 * ONE definition per portfolio question, imported by every surface that asks it: a KPI tile, the
 * chart beside it and the registry it links to all read the same function, so the number a
 * manager clicks and the rows they land on can never disagree. Pure; `today` and the working
 * calendar are injected, never read from the clock, so every one of them is testable.
 *
 * Nothing here is stored and nothing is estimated (the governing law): a figure that cannot be
 * computed from `state` is not printed at all.
 */

/* ---------------- scope (§9 work scope) ---------------- */

/**
 * All FOUR members of `LocalContentScope`, not the three the brief named. `HEAVY_MATERIALS` is
 * one of §9's three participation-triggering scopes; folding it into «أخرى» would report a
 * governed category as an ungoverned one. An empty column is honest; a mislabelled count is not.
 */
export const SCOPES: readonly LocalContentScope[] = ['DRILLING', 'ENGINEERING_CONSTRUCTION', 'HEAVY_MATERIALS', 'OTHER'];
export type ScopeCounts = Record<LocalContentScope, number>;

/** A tender with no recorded scope reads as OTHER — the same default `CREATE_TENDER` applies. */
export function scopeCountsOf(tenders: readonly Tender[]): ScopeCounts {
  const out: ScopeCounts = { DRILLING: 0, ENGINEERING_CONSTRUCTION: 0, HEAVY_MATERIALS: 0, OTHER: 0 };
  for (const t of tenders) out[t.scope ?? 'OTHER'] += 1;
  return out;
}

/* ---------------- approval tiers ---------------- */

export type TierCounts = Record<ApprovalTier, number>;

/** How a set of tenders splits across the global ladder — the segments of every tier mark. */
export function tierCountsOf(state: State, tenders: readonly Tender[]): TierCounts {
  const out: TierCounts = { OPERATOR: 0, JMC: 0, MDOC: 0 };
  for (const t of tenders) out[tenderApprovalTier(state, t)] += 1;
  return out;
}

/**
 * The tenders still in flight: a stage is open AND no cancellation/suspension was recorded.
 * A cancelled request is not «active» — counting it would inflate every portfolio split with
 * work nobody is doing.
 */
export function activeTenders(state: State): Tender[] {
  return state.tenders.filter((t) => currentStage(t) !== undefined && !t.lifecycle);
}

/* ---------------- per operating company (requests 1 + 2) ---------------- */

/**
 * The originating company of a contract, through its tender. There is NO operator key on
 * `ContractState` — the only lawful path is the recorded `tenderId`, so a contract that carries
 * none is attributed to nobody rather than guessed at by name or field (the seed contracts are
 * honestly unlinked, and the screens that show these counts say so).
 */
export function contractOperatorId(state: State, c: ContractState): string | undefined {
  return c.tenderId ? state.tenders.find((t) => t.id === c.tenderId)?.operatorId : undefined;
}

/**
 * The three-way partition a company bar is drawn from. It is a partition on purpose — the
 * segments must add up to `tenders` or the bar lies about the portfolio:
 *   · completed — no open stage left;
 *   · halted    — a stage is open but the request was cancelled or suspended (`lifecycle`);
 *   · active    — a stage is open and nothing has stopped it.
 * A suspended request has an open stage, so a plain open/closed split would draw it as running
 * work. That is the whole reason the third part exists.
 */
export type TenderPart = 'active' | 'completed' | 'halted';
export const TENDER_PARTS: readonly TenderPart[] = ['active', 'completed', 'halted'];

export function tenderPartOf(t: Tender): TenderPart {
  if (currentStage(t) === undefined) return 'completed';
  return t.lifecycle ? 'halted' : 'active';
}

export interface CompanyStat {
  op: OperatorOrg;
  /** oil fields the company holds (§7.1 — the source of its authority) */
  fields: number;
  tenders: number;
  /** total estimated value of those tenders (USD) */
  valueUSD: number;
  /** the bar's segments — active + completed + halted === tenders, always */
  parts: Record<TenderPart, number>;
  scopes: ScopeCounts;
  /** tenders whose current stage is past its planned close (= tenderStatus 'delayed') */
  late: number;
  /** contracts traceable to this company through a tender (see contractOperatorId) */
  contracts: number;
  contractValueUSD: number;
}

/**
 * Every operating company with its live portfolio — ALL of them, including companies with no
 * tender at all. Dropping a zero row would tell the reader the fleet is smaller than it is, and
 * «this company raised nothing» is itself a finding.
 *
 * Ordered by portfolio value descending, with the zero-value companies collated in Arabic at the
 * tail — a stable, explainable order rather than the store's insertion order.
 */
export function companyStats(state: State, today: string, cal: WorkingCalendar): CompanyStat[] {
  const byName = arCompare<CompanyStat>((r) => r.op.name);
  return state.operators
    .map((op): CompanyStat => {
      const tenders = state.tenders.filter((t) => t.operatorId === op.id);
      const contracts = state.contracts.filter((c) => contractOperatorId(state, c) === op.id);
      const parts: Record<TenderPart, number> = { active: 0, completed: 0, halted: 0 };
      for (const t of tenders) parts[tenderPartOf(t)] += 1;
      return {
        op,
        fields: state.fields.filter((f) => f.operatorId === op.id).length,
        tenders: tenders.length,
        valueUSD: tenders.reduce((s, t) => s + t.estimatedValueUSD, 0),
        parts,
        scopes: scopeCountsOf(tenders),
        late: tenders.filter((t) => tenderStatus(t, today, cal) === 'delayed').length,
        contracts: contracts.length,
        contractValueUSD: contracts.reduce((s, c) => s + c.valueUSD, 0),
      };
    })
    .sort((a, b) => b.valueUSD - a.valueUSD || byName(a, b));
}

/* ---------------- contract completion (requests 12 + 13) ---------------- */

/** The cut points, written ONCE (§3-د). The last bucket is closed at both ends so 100% lands in it. */
const BUCKET_MIN: Record<ProgressBucket, number> = { '0-25': 0, '25-50': 25, '50-75': 50, '75-100': 75 };

/**
 * The LAST percentage each bucket actually holds — not `min + 25`.
 *
 * The buckets are half-open below (`min ≤ p < min+25`), so «0-25%» and «25-50%» printed side by
 * side claim 25% twice and leave the reader to guess which column owns it. The honest boundary
 * is the last value inside: 24, 49, 74, and 100 for the top bucket, which is closed. The whole
 * digits are exact — `contractProgress` rounds to a whole percent — so nothing between 24 and 25
 * exists to fall through the label.
 */
const BUCKET_MAX: Record<ProgressBucket, number> = { '0-25': 24, '25-50': 49, '50-75': 74, '75-100': 100 };

/**
 * The printed range of a bucket, WITHOUT the percent sign — one definition read by the histogram
 * column, its aria label and the contracts-registry chip, so the three can never disagree about
 * where a bucket ends. En dash: it is a range, not a subtraction.
 */
export function bucketRangeLabel(key: ProgressBucket): string {
  return `${BUCKET_MIN[key]}–${BUCKET_MAX[key]}`;
}

/**
 * Which completion bucket a percentage falls in. Half-open below (`min ≤ p < min+25`) and closed
 * at the very top, so the four buckets PARTITION 0–100 exactly: no value is counted twice and
 * none — 100% least of all — falls through the floor.
 */
export function progressBucketOf(pct: number): ProgressBucket {
  if (pct < 25) return '0-25';
  if (pct < 50) return '25-50';
  if (pct < 75) return '50-75';
  return '75-100';
}

export interface CompletionBucket {
  key: ProgressBucket;
  min: number;
  /** the last percentage the bucket holds (24 / 49 / 74 / 100) — never `min + 25` */
  max: number;
  count: number;
}

/** The histogram: every contract placed by `contractProgress(c).pct`, buckets in reading order. */
export function completionBuckets(contracts: readonly ContractState[]): CompletionBucket[] {
  const counts: Record<ProgressBucket, number> = { '0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0 };
  for (const c of contracts) counts[progressBucketOf(contractProgress(c).pct)] += 1;
  return PROGRESS_BUCKETS.map((key) => ({ key, min: BUCKET_MIN[key], max: BUCKET_MAX[key], count: counts[key] }));
}

/** Contracts parked at one lifecycle stage — the tile and the `?stage=` registry read this. */
export function contractsAtStage(state: State, stage: ContractStageKey): ContractState[] {
  return state.contracts.filter((c) => currentStageKey(c) === stage);
}

export interface AwardedContracts {
  count: number;
  valueUSD: number;
  /** every stage closed — delivery is done */
  completed: number;
  /** at least one stage still open — still being delivered */
  inExecution: number;
}

/**
 * The awarded-contract headline for the public home page (request 13). `completed` and
 * `inExecution` PARTITION `count`: a contract either has an open stage or it does not, so the
 * two numbers are guaranteed to add up and the reader can check the arithmetic on the page.
 */
export function awardedContracts(state: State): AwardedContracts {
  const completed = state.contracts.filter((c) => currentStageKey(c) === undefined).length;
  return {
    count: state.contracts.length,
    valueUSD: state.contracts.reduce((s, c) => s + c.valueUSD, 0),
    completed,
    inExecution: state.contracts.length - completed,
  };
}

/* ---------------- schedule compliance over time (§3-هـ) ---------------- */

export interface CompliancePoint {
  /** 'YYYY-MM' */
  month: string;
  pct: number;
  /** how many closed stages the point is computed from — a point is never printed without them */
  closed: number;
}

const monthKey = (iso: string): string => iso.slice(0, 7);

function shiftMonth(month: string, back: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const total = y * 12 + (m - 1) - back;
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * Schedule compliance month by month — one INDEPENDENT measurement per month, never a running
 * total: «of the stages that were due to close in this month, what share actually closed on
 * time». Each point is computed by the same `scheduleCompliancePct` the KPI uses, over the
 * stages whose PLANNED close falls in that month.
 *
 * Two anti-fabrication rules, both load-bearing:
 *   · stages planned beyond `today` are excluded — a stage not yet due cannot be judged;
 *   · a month with no CLOSED stage yields NO point. `scheduleCompliancePct` answers 100 for an
 *     empty set (correctly — nothing has slipped), but printing that as a data point would draw
 *     a perfect month out of an empty one.
 * The caller draws nothing when fewer than two points survive: a one-point time series is a
 * fabricated trend.
 */
export function complianceSeries(state: State, today: string, months = 6): CompliancePoint[] {
  const nowMonth = monthKey(today);
  const window: string[] = [];
  for (let i = months - 1; i >= 0; i -= 1) window.push(shiftMonth(nowMonth, i));

  const stages = state.tenders.flatMap((t) =>
    t.stages
      .filter((s) => s.plannedTo && s.plannedTo <= today)
      .map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo })),
  );

  const out: CompliancePoint[] = [];
  for (const month of window) {
    const inMonth = stages.filter((s) => monthKey(s.plannedEnd) === month);
    const closed = inMonth.filter((s) => s.actualEnd != null).length;
    if (closed === 0) continue;
    out.push({ month, pct: Math.round(scheduleCompliancePct(inMonth)), closed });
  }
  return out;
}
