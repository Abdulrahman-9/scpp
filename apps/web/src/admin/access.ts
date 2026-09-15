import { mayRatifyTier, type ApprovalTiers } from '@masaar/scpp-rules';
import { API_ROLES, isOperatorRole, normalizeRole, type ApiRole } from '../session';
import type { AuditEntry, UserAccount } from '../store';
import { COUNTED, type Capability, type CapDomain } from './capabilities';

/**
 * Derivations for the access-governance section. Everything here reads from the
 * capability register (the real @Roles surface) and the account list — never from
 * a hand-maintained permission table.
 */

/**
 * How a capability presents for one role. See the legend in the reference matrix.
 * 'conflict' is not a permission state — it is a disagreement between the specification
 * document and the code that enforces it, surfaced instead of silently resolved.
 */
export type CellState = 'yes' | 'scoped' | 'open' | 'no' | 'session' | 'conflict';

/**
 * `scoped` records the code path (loadScoped / operatorScopeWhere). It is an *effective*
 * restriction only for the two operator roles — `isOperatorScoped` is false for the four
 * platform roles, so the company filter is inert for them.
 */
export function cellState(cap: Capability, role: ApiRole): CellState {
  if (cap.guard === 'session') return 'session';
  const scopedForRole = cap.scoped && isOperatorRole(role);
  // an undecorated handler passes for every authenticated session — but operator roles
  // still only ever see their own company's rows.
  if (cap.guard === 'open') return scopedForRole ? 'scoped' : 'open';
  if (!cap.roles.includes(role)) {
    // the spec says this role holds it; the guard says otherwise. Neither is hidden.
    return cap.specGrants?.includes(role) ? 'conflict' : 'no';
  }
  return scopedForRole ? 'scoped' : 'yes';
}

/** Capabilities where the specification document and the enforced guard disagree. */
export function specConflicts(): Capability[] {
  return COUNTED.filter((c) => (c.specGrants ?? []).some((r) => !c.roles.includes(r)));
}

/** Does this role reach the capability at all (any non-'no', non-'session' state)? */
export function roleHas(cap: Capability, role: ApiRole): boolean {
  const s = cellState(cap, role);
  return s === 'yes' || s === 'scoped' || s === 'open';
}

/** Every capability this role can reach, session/infra excluded. */
export function capsForRole(role: ApiRole): Capability[] {
  return COUNTED.filter((c) => roleHas(c, role));
}

/**
 * The same question asked by capability ID — what a NAVIGATION decision needs (ل3).
 *
 * A destination is offered to a role only when the role can actually read the subject that
 * destination is about, and «can actually read» is answered here by the register that mirrors the
 * real `@Roles(...)` decorators — never by a second, hand-kept list of who sees which menu row.
 * Otherwise the sidebar and the server drift, which is the state ل3 exists to end: fourteen
 * destinations offered to a joint-committee session, several of which answer 403 and audit the
 * refusal on arrival.
 *
 * An id the register does not carry answers `false`: a permission question fails CLOSED, and the
 * accompanying test pins every declared id against the register so a typo cannot hide a
 * destination silently instead.
 */
export function roleHasCapId(id: string, role: ApiRole): boolean {
  const cap = COUNTED.find((c) => c.id === id);
  return cap ? roleHas(cap, role) : false;
}

/** Capabilities withheld from this role — the negative space that makes SoD auditable. */
export function withheldFrom(role: ApiRole): Capability[] {
  return COUNTED.filter((c) => !roleHas(c, role));
}

/** Which roles do hold a capability — used to attribute what a role cannot do. */
export function rolesHolding(cap: Capability): ApiRole[] {
  return API_ROLES.filter((r) => roleHas(cap, r));
}

/** Impactful actions: writes that are actually role-restricted. Reads and session rows never count. */
export function impactfulCount(role: ApiRole): number {
  return capsForRole(role).filter((c) => c.mutating).length;
}

export function readCount(role: ApiRole): number {
  return capsForRole(role).filter((c) => !c.mutating).length;
}

export function domainsFor(role: ApiRole): CapDomain[] {
  return [...new Set(capsForRole(role).map((c) => c.domain))];
}

/** Enabled accounts holding a capability — 0 means the capability has no live holder. */
export function holdersOf(cap: Capability, users: UserAccount[]): UserAccount[] {
  return users.filter((u) => !u.disabled && roleHas(cap, u.role));
}

/** Enabled accounts per role — drives the "who holds this today" affordance. */
export function holdersOfRole(role: ApiRole, users: UserAccount[]): UserAccount[] {
  return users.filter((u) => !u.disabled && u.role === role);
}

/**
 * Governance roles with no enabled holder. Every call against such a role is refused 403 and
 * audited ROLE_REFUSED — an operational defect, not an empty set.
 *
 * `JMC_APPROVER` belongs here for the sharpest reason of the five: it is the ONLY body whose
 * signature clears the ط2 band, so an empty joint committee does not merely idle a role — it
 * stops every 5–10M award in the platform. The KPI must be able to say that.
 */
export const GOVERNANCE_ROLES: ApiRole[] = ['SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR'];

export function orphanRoles(users: UserAccount[]): ApiRole[] {
  return GOVERNANCE_ROLES.filter((r) => holdersOfRole(r, users).length === 0);
}

export function orphanRoleCount(users: UserAccount[]): number {
  return orphanRoles(users).length;
}

/**
 * Would this change strand a governance role with zero enabled holders? Answered *before*
 * the confirm button, so an admin never discovers it after the fact.
 * `next` is the account's post-change shape (role/disabled already applied).
 */
export function rolesOrphanedBy(users: UserAccount[], userId: string, next: { role: ApiRole; disabled: boolean }): ApiRole[] {
  const after = users.map((u) => (u.id === userId ? { ...u, ...next } : u));
  const before = orphanRoles(users);
  return orphanRoles(after).filter((r) => !before.includes(r));
}

/**
 * i18n key suffix for `roles.names.*`.
 *
 * Widened to `string` on purpose: audit rows are append-only (8.1-e), so a row written before
 * the 2026-08-20 rename still cites `ROC_ADMIN`. `normalizeRole` resolves the retired name to
 * its current one so history renders under today's label instead of falling through to a
 * wrong role — and a name that matches nothing renders AS unknown rather than as an operator.
 */
export function roleKey(role: ApiRole | string): string {
  switch (normalizeRole(role)) {
    case 'SUPER_ADMIN': return 'superAdmin';
    case 'MDOC_ADMIN': return 'mdocAdmin';
    case 'JMC_APPROVER': return 'jmcApprover';
    case 'EVALUATION': return 'evaluation';
    case 'AUDITOR': return 'auditor';
    case 'OPERATOR_ADMIN': return 'operatorAdmin';
    case 'OPERATOR_USER': return 'operatorUser';
    default: return 'unknown';
  }
}

/** CSS modifier for `.acc-role--*`. Tolerant on the same terms as `roleKey`. */
export function roleTone(role: ApiRole | string): string {
  switch (normalizeRole(role)) {
    case 'SUPER_ADMIN': return 'super';
    case 'MDOC_ADMIN': return 'mdoc';
    // the joint committee already owns the amber band on the tier pill (.ad-tier--jmc) —
    // one body, one colour, wherever it is named
    case 'JMC_APPROVER': return 'jmc';
    case 'EVALUATION': return 'evaluation';
    case 'AUDITOR': return 'auditor';
    case 'OPERATOR_ADMIN': case 'OPERATOR_USER': return 'operator';
    default: return 'unknown';
  }
}

/**
 * Icon for a role card (Icon.tsx registry names only). The glyph carries the BODY, not the
 * seniority: the platform is a lock, the two approving bodies are check/shield-shaped acts,
 * the committees read and the operator is a company.
 */
export function roleIcon(role: ApiRole): string {
  switch (role) {
    case 'SUPER_ADMIN': return 'lock';
    case 'MDOC_ADMIN': return 'shield';
    case 'JMC_APPROVER': return 'check';
    case 'EVALUATION': return 'sliders';
    case 'AUDITOR': return 'eye';
    default: return 'building';
  }
}

/* ---------------- the three financial facts (client request 21) ---------------- */

/**
 * What every reader actually asks of a role, in the client's own three questions:
 * «يوافق حتى؟» (the top of the band its signature clears), «يشهد؟» (does it decide awards at
 * all), «نطاقه؟» (the whole platform, or one company).
 *
 * DERIVED, never authored: `approves` reads the SAME ladder the engine judges a value against and
 * the SAME rank table the ratify gate enforces, so a card can never promise an authority the
 * service would refuse. `null` means «no approval authority» — not «unlimited».
 */
export interface RoleFinancialFacts {
  /** the top of the band this role may clear, in USD — null when it clears none */
  approvesUpToUSD: number | null;
  /** true when the band it clears has no ceiling (the parent company and above) */
  approvesUnlimited: boolean;
  /** does it hold the ratify/return seat (`ratifyAward` on its @Roles list)? */
  decides: boolean;
  /** company-scoped by `operatorScopeWhere`, or platform-wide */
  scope: 'company' | 'platform';
}

export function roleFinancialFacts(role: ApiRole, tiers: ApprovalTiers): RoleFinancialFacts {
  const scope: RoleFinancialFacts['scope'] = isOperatorRole(role) ? 'company' : 'platform';
  // the seat itself is the register's answer, not a hand-kept list
  const decides = COUNTED.some((c) => c.id === 'ratifyAward' && c.roles.includes(role));
  if (!decides) return { approvesUpToUSD: null, approvesUnlimited: false, decides, scope };
  // the highest band this role's rank still clears — asked of the ladder, tier by tier
  if (mayRatifyTier(role, 'MDOC')) return { approvesUpToUSD: null, approvesUnlimited: true, decides, scope };
  if (mayRatifyTier(role, 'JMC')) return { approvesUpToUSD: tiers.jmcMaxUSD, approvesUnlimited: false, decides, scope };
  return { approvesUpToUSD: tiers.operatorMaxUSD, approvesUnlimited: false, decides, scope };
}

/**
 * Client rows write `target = email`; rows hydrated from the server may write
 * `${email}: OLD→NEW` (users.service.ts USER_ROLE_CHANGE). Match both, or the
 * "documented actions" count silently under-reports.
 */
export function matchUser(email: string) {
  return (a: AuditEntry) => a.target === email || a.target.startsWith(email + ':');
}

/**
 * The three views of «الوصول والأدوار» (request 20), in the order the question is asked. Exported
 * as the ONE list the section renders, the address whitelist validates (`useHashParams`) and the
 * tests pin — a fourth tab cannot appear in one place and be missing from another.
 */
export const ACCESS_TABS = ['accounts', 'roles', 'matrix'] as const;
export type AccessTab = (typeof ACCESS_TABS)[number];

/** Audit actions this section writes — used to filter the access trail out of the global log. */
export const ACCESS_ACTIONS = new Set([
  'CREATE_USER', 'SET_USER_ROLE', 'SET_USER_SCOPE', 'SET_USER_TWOFA', 'SET_USER_DISABLED',
]);
