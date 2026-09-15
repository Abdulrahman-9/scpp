import type { ApprovalTier } from '@masaar/scpp-rules';

/**
 * The ONE place a tier's chart identity is written down (spec §3, «tier.ts»): its reading order,
 * its i18n key and its destination. Repeating any of them in JSX is how a legend and an arc end
 * up disagreeing about which band is which.
 */

/**
 * Ascending authority — ط1 → ط2 → ط3, fixed in every bar, ring and legend.
 * Position is the third carrier of the distinction (after the 2px separator and the printed
 * label), so this order is not a preference: reordering it would break the encoding.
 */
export const CHART_TIERS: readonly ApprovalTier[] = ['OPERATOR', 'JMC', 'MDOC'] as const;

/** The navy-ramp token per tier (tokens.css, §3-أ). Never a --status-* colour. */
export const TIER_FILL: Record<ApprovalTier, string> = {
  OPERATOR: 'var(--tier-operator)',
  JMC: 'var(--tier-jmc)',
  MDOC: 'var(--tier-mdoc)',
};

/** The tier's short name — the SAME key `TierPill` reads, so the two can never diverge. */
export function tierLabelKey(tier: ApprovalTier): string {
  return `tier.pill.${tier}`;
}

/**
 * Where a tier mark leads, or `undefined` when it leads nowhere.
 *
 * ط1 has no destination and this is not an omission: the approval chain is BY DEFINITION the
 * requests that owe a signature outside the operating company (ق1 — `approvalChain` drops
 * OPERATOR), so `#/admin/approvals?tier=OPERATOR` would land on a registry that structurally
 * cannot contain the rows the reader just clicked. A mark with no honest destination is left
 * inert rather than pointed at an approximation.
 *
 * No `pending=1` here, deliberately: a donut segment counts EVERY request in the band, decided or
 * not, so the whole band is exactly what it must open. The follow-up room's «بانتظار موافقة …»
 * tiles count only the undecided ones and therefore carry the gate — two different questions,
 * two different destinations, each holding precisely what it counted.
 */
export function tierHref(tier: ApprovalTier): string | undefined {
  return tier === 'OPERATOR' ? undefined : `#/admin/approvals?tier=${tier}`;
}
