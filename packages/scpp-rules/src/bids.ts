import {
  IRAQ_CALENDAR,
  nextWorkingDayOnOrAfter,
  toIso,
  type DateInput,
  type WorkingCalendar,
} from '@masaar/working-days';

/**
 * Bid-entry rules: the 4-step stepper, price locking, eligibility, late bids.
 */

export type EvaluationStep =
  | 'technical-opening'
  | 'technical-analysis'
  | 'commercial-opening'
  | 'commercial-analysis';

export interface Bidder {
  id: string;
  technicalResult?: 'pass' | 'fail';
  priceUSD?: number;
}

const COMMERCIAL_STEPS: readonly EvaluationStep[] = ['commercial-opening', 'commercial-analysis'];

/**
 * Price column locked until the bidder passes technical, and only visible
 * in the commercial steps (12.4.2). Two separate evaluation teams (12.4).
 */
export function isPriceVisible(step: EvaluationStep, bidder: Pick<Bidder, 'technicalResult'>): boolean {
  return COMMERCIAL_STEPS.includes(step) && bidder.technicalResult === 'pass';
}

/** Award goes to the lowest technically-qualified bid (6.6). */
export function lowestQualified(bidders: readonly Bidder[]): Bidder | null {
  const qualified = bidders.filter((b) => b.technicalResult === 'pass' && typeof b.priceUSD === 'number');
  if (qualified.length === 0) return null;
  return qualified.reduce((min, b) => (b.priceUSD! < min.priceUSD! ? b : min));
}

/** Derived counts shown on the bid-entry screen — computed, never stored. */
export function bidderCounts(bidders: readonly Bidder[]): { applied: number; qualified: number; priced: number } {
  return {
    applied: bidders.length,
    qualified: bidders.filter((b) => b.technicalResult === 'pass').length,
    priced: bidders.filter((b) => typeof b.priceUSD === 'number').length,
  };
}

/** Late bids are auto-rejected (10.6.1). Accepts full ISO timestamps. */
export function isLateBid(submittedAt: string, closingAt: string): boolean {
  return Date.parse(submittedAt) > Date.parse(closingAt);
}

/**
 * Late by DATE (10.6.1) — the closing is stated by day, so a bid is late only when its calendar date
 * is AFTER the closing date. Slices both operands to their date part and compares as ISO strings
 * (lexical = chronological, timezone-immune), so no call site can reintroduce a midnight/timezone
 * drift by forgetting to normalize a timestamp. This is the form the bid-closing gates use.
 */
export function isLateBidByDate(submittedAt: string, closingDate: string): boolean {
  return submittedAt.slice(0, 10) > closingDate.slice(0, 10);
}

/** Closing on a holiday/weekend extends to the next working day. */
export function effectiveClosingDate(planned: DateInput, cal: WorkingCalendar = IRAQ_CALENDAR): string {
  return toIso(nextWorkingDayOnOrAfter(planned, cal));
}

/** A single bid is acceptable iff the bid period was ≥ 21 days (15.3). */
export function singleBidAcceptable(bidCount: number, bidPeriodDays: number): { ok: boolean; clause: '15.3' } {
  if (bidCount !== 1) return { ok: true, clause: '15.3' };
  return { ok: bidPeriodDays >= 21, clause: '15.3' };
}

/* ---------- Eligibility (10.4) ---------- */

export interface VendorFlags {
  suspended?: boolean;
  blacklisted?: boolean;
  inDispute?: boolean;
}

export function vendorEligible(flags: VendorFlags): { ok: boolean; reasons: string[]; clause: '10.4' } {
  const reasons: string[] = [];
  if (flags.suspended) reasons.push('suspended');
  if (flags.blacklisted) reasons.push('blacklisted');
  if (flags.inDispute) reasons.push('in-dispute');
  return { ok: reasons.length === 0, reasons, clause: '10.4' };
}

/** One bid per bidder — returns the ids that appear more than once. */
export function duplicateBidders(bidderIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const id of bidderIds) {
    if (seen.has(id)) dups.add(id);
    seen.add(id);
  }
  return [...dups];
}

/**
 * Refusal to sign (14.3): ban up to 12 months, forfeit bid bond,
 * award passes to the next-ranked bidder, PCLD notified.
 */
export function refusalToSign(currentRank: number): {
  banMonthsMax: 12;
  forfeitBidBond: true;
  awardToRank: number;
  notify: 'PCLD';
  clause: '14.3';
} {
  return {
    banMonthsMax: 12,
    forfeitBidBond: true,
    awardToRank: currentRank + 1,
    notify: 'PCLD',
    clause: '14.3',
  };
}
