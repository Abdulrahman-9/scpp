import { approvalTierFor, type ApprovalTier, type ApprovalTiers, type LocalContentScope } from '@masaar/scpp-rules';
import type { ContractState, State, VendorState } from '../store';
import { scopeCountsOf, type ScopeCounts } from './dashboardDerive';

/**
 * Vendor report (client request 16, decision ق6) — specialization and financial capacity, both
 * DERIVED, both labelled as derivations.
 *
 * ق6 is still open: the client has not supplied the official specialization list, and the store
 * holds no `specialization` field to fill in. What it DOES hold is where each entity has actually
 * competed — the §9 work scope of every tender it bid on — and what it has actually been awarded.
 * So the report answers «ما الذي تعمل فيه هذه الجهة؟» from the record instead of from a blank
 * field, and says on its face that this is an inference awaiting the official classification. That
 * is the honest reading of a pending decision: a derivation named as one, never a guess dressed
 * as a register.
 *
 * NOTHING here is stored and nothing is estimated. A vendor that has bid on nothing gets zeroes
 * and an explicit «لا مشاركات», not an assumed specialization.
 */

/* ---------------- specialization (ق6 — derived from participation) ---------------- */

/**
 * Which tenders this entity actually bid on. 12.4.2 matches a bidder to its registry entry BY
 * NAME (the same rule `deriveParticipation` follows, and the same reason `CREATE_VENDOR` refuses a
 * duplicate name): the store has no bidder→vendor key, so the name IS the link, and inventing a
 * fuzzier one would attribute another company's work to this one.
 */
export function tendersBidOn(state: State, vendor: VendorState) {
  const name = vendor.name.trim();
  return state.tenders.filter((t) => t.bidders.some((b) => b.name.trim() === name));
}

/**
 * The contracts this entity holds. `vendorId` is the recorded link and wins outright; only when a
 * contract carries none does the contractor NAME stand in — checking both on every row would
 * double-count a contract that has both, and trusting the name over the key would let a rename
 * silently move an award between entities.
 */
export function contractsWon(state: State, vendor: VendorState): ContractState[] {
  const name = vendor.name.trim();
  return state.contracts.filter((c) => (c.vendorId ? c.vendorId === vendor.id : c.contractorName.trim() === name));
}

/**
 * Financial-capacity band, from the value of contracts actually WON.
 *
 * The bands are the client's OWN approval ladder (ق1: ≤5M operator · 5–10M JMC · >10M MDOC), not
 * quantiles cut from the current data. Two reasons, and the second is the decisive one:
 *   · these thresholds are already governed, already agreed with the client, and already the scale
 *     every other money figure in the product is read against — a fifth private scale would make
 *     «قدرة مالية عالية» mean something no document defines;
 *   · a quantile band MOVES when the data moves: the same entity would slide from «متوسطة» to
 *     «عالية» because a different company won something, which is a report that changes its verdict
 *     without any fact about the subject changing.
 * `none` is its own band — «has been awarded nothing» is a finding, not the bottom of a scale.
 *
 * د9 / س4 — IT STAYS ON THE SYSTEM DEFAULT LADDER DELIBERATELY, and this is the one surface in the
 * §7 inventory that does. Every other place that prints a ladder either describes one tender (and
 * resolves that tender's operator's ladder) or describes the system (and labels the default as the
 * default). This does neither: `wonValueUSD` is a vendor's awards AGGREGATED ACROSS OPERATORS, so
 * there is no single operator whose ladder could be resolved for it. Resolving one anyway — the
 * first operator, the largest, the most recent — would be a fabricated precision, and splitting the
 * figure per operator would answer a different question than «how large a contract has this entity
 * proven it can carry». The default ladder is the one governed scale that applies to all of them,
 * and `reports.vendorExplainBands` states this in the report itself rather than only here.
 */
export type CapacityBand = 'none' | ApprovalTier;

export function capacityBand(wonValueUSD: number, tiers: ApprovalTiers): CapacityBand {
  if (wonValueUSD <= 0) return 'none';
  return approvalTierFor(wonValueUSD, tiers);
}

export interface VendorProfile {
  vendor: VendorState;
  /** how many tenders it competed in — the denominator of the specialization */
  bids: number;
  /** its participation spread across the four §9 scopes */
  scopes: ScopeCounts;
  /** the single scope it competed in most, or null when there is no clear leader (a tie or none) */
  primary: LocalContentScope | null;
  wins: number;
  wonValueUSD: number;
  band: CapacityBand;
}

/**
 * The dominant scope, or `null`. A TIE yields null on purpose: printing one of two equal scopes as
 * «التخصص» would invent a preference the record does not contain, and «غير محدَّد» is the true
 * answer for an entity that bids evenly across two lines of work.
 */
export function primaryScope(scopes: ScopeCounts): LocalContentScope | null {
  const entries = Object.entries(scopes) as [LocalContentScope, number][];
  const max = Math.max(...entries.map(([, n]) => n));
  if (max <= 0) return null;
  const leaders = entries.filter(([, n]) => n === max);
  return leaders.length === 1 ? leaders[0]![0] : null;
}

/**
 * Every entity with its derived profile, ordered by awarded value descending and then by
 * participation — a stable, explainable order. Archived entities are INCLUDED: the report is a
 * record of what happened, and withdrawing an entity from future work does not unmake its history.
 */
export function vendorProfiles(state: State): VendorProfile[] {
  return state.vendors
    .map((vendor): VendorProfile => {
      const bid = tendersBidOn(state, vendor);
      const won = contractsWon(state, vendor);
      const scopes = scopeCountsOf(bid);
      const wonValueUSD = won.reduce((s, c) => s + c.valueUSD, 0);
      return {
        vendor,
        bids: bid.length,
        scopes,
        primary: primaryScope(scopes),
        wins: won.length,
        wonValueUSD,
        band: capacityBand(wonValueUSD, state.approvalTiers),
      };
    })
    .sort((a, b) => b.wonValueUSD - a.wonValueUSD || b.bids - a.bids);
}

/** How many entities sit in each capacity band — the report's one aggregate figure. */
export function bandCounts(profiles: readonly VendorProfile[]): Record<CapacityBand, number> {
  const out: Record<CapacityBand, number> = { none: 0, OPERATOR: 0, JMC: 0, MDOC: 0 };
  for (const p of profiles) out[p.band] += 1;
  return out;
}
