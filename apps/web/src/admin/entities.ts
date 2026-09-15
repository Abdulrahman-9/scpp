import { isPriceVisible, lowestQualified } from '@masaar/scpp-rules';
import { currentStage, evalStepName, todayIso, type State, type Tender, type VendorState } from '../store';

/** Governance status of a vendor for the registry pill. */
export type VendorGovStatus = 'eligible' | 'suspended' | 'banned';

export function vendorStatus(v: VendorState, today = todayIso()): VendorGovStatus {
  if (v.banUntil && v.banUntil > today) return 'banned';
  if (v.suspended || v.blacklisted || v.inDispute) return 'suspended';
  return 'eligible';
}

export interface Participation {
  tender: Tender;
  bidderId: string;
  technicalResult?: 'pass' | 'fail';
  /** already masked per 12.4.2 — undefined when locked/not opened */
  priceUSD?: number;
  won: boolean;
  ongoing: boolean;
  currentStageKey?: string;
}

/** A vendor's history across the portfolio — bids matched by name (offline seed link). */
export function deriveParticipation(state: State, vendor: VendorState, today = todayIso()): Participation[] {
  const out: Participation[] = [];
  for (const t of state.tenders) {
    const b = t.bidders.find((x) => x.name === vendor.name);
    if (!b) continue;
    const cur = currentStage(t);
    const lowest = lowestQualified(t.bidders);
    const priceVisible = isPriceVisible(evalStepName(t.evaluationStep), b) && b.priceUSD != null;
    out.push({
      tender: t,
      bidderId: b.id,
      technicalResult: b.technicalResult,
      priceUSD: priceVisible ? b.priceUSD : undefined,
      won: t.ratification?.status === 'ratified' && lowest?.id === b.id,
      ongoing: !!cur,
      currentStageKey: cur?.key,
    });
  }
  return out;
}

export interface VendorStats {
  bids: number;
  wins: number;
  passRate: number;
  winRate: number;
}

export function vendorStats(p: Participation[]): VendorStats {
  const bids = p.length;
  const passes = p.filter((x) => x.technicalResult === 'pass').length;
  const wins = p.filter((x) => x.won).length;
  return { bids, wins, passRate: bids ? Math.round((passes / bids) * 100) : 0, winRate: bids ? Math.round((wins / bids) * 100) : 0 };
}
