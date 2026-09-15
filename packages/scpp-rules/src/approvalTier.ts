/**
 * Approval ladder (client decision ق1, 2026-08-20) — WHO clears a request, by value.
 *
 * The client does not run an abstract cost cycle; it runs a named chain of approving bodies:
 *
 *   ط1  value ≤ operatorMaxUSD                 → OPERATOR — the operating company's own
 *                                                delegated authority: follow-up and audit only,
 *                                                no external approval act.
 *   ط2  operatorMaxUSD < value ≤ jmcMaxUSD     → JMC — the Joint Management Committee gate.
 *   ط3  value > jmcMaxUSD                      → MDOC — the parent company (نفط الوسط) gate.
 *
 * The thresholds are passed in AS CONFIGURATION rather than derived per field — and that one
 * design choice is what let the ladder become per-operator without a line of engine code changing.
 *
 * ق1 (2026-08-20) said «one ladder for every operator», and this engine was built to it. The
 * client decision of 2026-08-25 SUPERSEDES that — «the supervisor sets the ceilings per operator»
 * — without erasing its effect: `DEFAULT_APPROVAL_TIERS` below is still the SYSTEM DEFAULT, still
 * in force for every operating company that has no approved ladder of its own. Which ladder a
 * given request is measured against is resolved by the CALLER (`resolveTiersFor` in the web
 * store, `assertTierAuthority` on the API side), because that resolution needs a State this
 * engine must not know. This function's job is unchanged: given a value and A ladder, name the
 * body that clears it.
 *
 * This is DISTINCT from the §7.1 Financial Authority, which is per-field and comes from the
 * field's Service Contract: FA answers «does this enter the cost cycle», the ladder answers
 * «whose signature clears it». A per-operator ceiling does NOT make the ladder a financial
 * authority — it is a signature ladder that happens to be scoped to a company.
 *
 * Fail closed. An absent or unusable configuration resolves to MDOC — the HIGHEST gate — for
 * the same reason §7.1 fails closed on an unresolvable authority: a request whose clearing body
 * cannot be established must not be treated as already cleared by the lowest one.
 */

export type ApprovalTier = 'OPERATOR' | 'JMC' | 'MDOC';

/** The two ceilings that define the three tiers. Seeded 5,000,000 / 10,000,000 (ق1). */
export interface ApprovalTiers {
  /** the top of the operating company's own authority (ط1 ceiling) */
  operatorMaxUSD: number;
  /** the top of the Joint Management Committee's authority (ط2 ceiling) */
  jmcMaxUSD: number;
}

/** A ladder is usable only when both ceilings are real, non-negative and correctly ordered. */
function ladderUsable(t: ApprovalTiers): boolean {
  const { operatorMaxUSD: op, jmcMaxUSD: jmc } = t;
  if (!Number.isFinite(op) || !Number.isFinite(jmc)) return false;
  if (op < 0 || jmc < 0) return false;
  // an inverted ladder (JMC ceiling below the operator's) describes no reachable JMC band —
  // it is a misconfiguration, not a two-tier ladder, so it must not silently swallow ط2.
  return jmc >= op;
}

/**
 * The approving body for a value under the given ladder. Boundaries are INCLUSIVE at the top of
 * each band, exactly as the client stated them: 5,000,000 is still the operator's, 10,000,000 is
 * still the JMC's, and one cent past either ceiling moves up a tier.
 *
 * Returns MDOC when the ladder is missing/unusable or the value itself is not a real number —
 * the conservative reading (§7.1's fail-closed discipline applied to the approval chain).
 */
export function approvalTierFor(valueUSD: number, tiers: ApprovalTiers | null | undefined): ApprovalTier {
  if (!tiers || !ladderUsable(tiers)) return 'MDOC';
  if (!Number.isFinite(valueUSD)) return 'MDOC'; // an unreadable estimate clears nothing
  if (valueUSD <= tiers.operatorMaxUSD) return 'OPERATOR';
  if (valueUSD <= tiers.jmcMaxUSD) return 'JMC';
  return 'MDOC';
}

/**
 * Does this tier need an approval act at all? ط1 is «متابعة وتدقيق فقط» — the operating company
 * already holds the authority, so there is no gate to open, only a record to keep.
 */
export function tierNeedsApproval(tier: ApprovalTier): boolean {
  return tier !== 'OPERATOR';
}

/**
 * The SYSTEM DEFAULT ladder as the client seeded it (ق1, 2026-08-20): ≤5M the operating company's
 * own, 5–10M the Joint Management Committee's, >10M نفط الوسط's.
 *
 * It lives HERE, in the engine, rather than in either app: the API service gates ratification on
 * it and the web store seeds its state from it, and two copies of a ladder are two ladders.
 *
 * Since the 2026-08-25 decision this is the FALLBACK, not the only ladder: an operating company
 * with an approved ladder of its own is measured against that instead, and every company without
 * one is measured against this. NAMED DEBT (ops/OPERATOR-TIERS-SPEC.md §9 phase 2): the server has
 * no per-operator ladder model yet and reads this constant directly, which is why the client
 * editor for per-operator ceilings is withheld in api-mode — a ceiling the server does not
 * enforce would make a disabled «صادق» button and a 403 disagree.
 */
export const DEFAULT_APPROVAL_TIERS: ApprovalTiers = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 };

/* ---------------- who may sign which band (client requests 19ب / 21) ---------------- */

/**
 * WHICH BODY a role speaks for at the ratification seat, expressed as its height on the SAME
 * ladder `approvalTierFor` reads a value against. A tier says «this band needs the joint
 * committee's signature»; this says «this session carries the joint committee's signature».
 *
 * Keyed on the role IDENTIFIERS the server's `enum Role` and the client's `ApiRole` share — one
 * vocabulary by construction since the ق2 rename — and typed `string` deliberately, so this engine
 * never takes a dependency on an authentication union it must not own.
 *
 * Only three roles appear, because only three are on the `@Roles(...)` list of
 * `POST /api/tenders/:id/ratify` and `/return`. Everything else scores below the lowest band and
 * is refused by the guard long before this function is consulted:
 *
 *   · `JMC_APPROVER` — اللجنة المشتركة. Its remit IS the ط2 band, so it clears ط1 and ط2 and
 *     stops at the JMC ceiling: past that ceiling the request left its authority by definition.
 *   · `MDOC_ADMIN`   — نفط الوسط, the parent company: the top gate, so it clears every band.
 *   · `SUPER_ADMIN`  — the platform administrator, which holds every role-guarded capability by
 *     construction (pinned in apps/web/test/capabilities.test.ts). Ranked above MDOC so that
 *     invariant needs no exception here.
 */
const RATIFYING_RANK: Readonly<Record<string, number>> = {
  JMC_APPROVER: 1,
  MDOC_ADMIN: 2,
  SUPER_ADMIN: 3,
};

/** How high a signature must reach to clear a band. ط1 needs no outside body (`tierNeedsApproval`). */
const TIER_RANK: Readonly<Record<ApprovalTier, number>> = { OPERATOR: 0, JMC: 1, MDOC: 2 };

/**
 * The height of this role's signature, or `-1` when it carries no ratifying authority at all —
 * an unknown, retired or forged name scores lowest rather than being trusted (fail closed, the
 * same discipline `approvalTierFor` applies to an unusable ladder).
 */
export function ratifyingRank(role: string): number {
  return RATIFYING_RANK[role] ?? -1;
}

/**
 * May a holder of `role` decide (ratify or return) a request in this band?
 *
 * Monotone by construction: a body that clears a band clears every band beneath it, and none
 * above it. A role with no ratifying authority clears nothing — including ط1, which opens no
 * external gate but is still a decision seat somebody must legitimately occupy.
 */
export function mayRatifyTier(role: string, tier: ApprovalTier): boolean {
  const rank = ratifyingRank(role);
  return rank >= 0 && rank >= TIER_RANK[tier];
}
