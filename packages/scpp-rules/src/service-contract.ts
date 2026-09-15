/**
 * Service Contract rules (§7.1) — the Service Contract determines a field's Financial
 * Authority. Contract effectiveness and term are DERIVED, never stored (C2); every layer
 * (API, store, screens) calls these instead of inlining the predicate, so §7 validity has
 * exactly one definition.
 */

export interface ServiceContractLike {
  financialAuthorityUSD: number;
  /** ISO date 'YYYY-MM-DD' or a Date */
  signedOn: string | Date;
  expiresOn: string | Date;
  /** early termination; absent/null = never terminated */
  terminatedOn?: string | Date | null;
}

const toDate = (d: string | Date): Date => (d instanceof Date ? d : new Date(d));
/** Calendar-day string 'YYYY-MM-DD' — the app's own date unit (todayIso), timezone-free. */
const iso = (d: string | Date): string => (d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10));

/**
 * A contract is effective on a given calendar day when it is in force (signed on/before,
 * not yet expired) and not terminated as of that day. Compared as date strings — consistent
 * with `todayIso()` — so there is no expiry-day off-by-one or Baghdad-vs-UTC skew.
 */
export function serviceContractEffective(c: ServiceContractLike, asOf: Date = new Date()): boolean {
  const on = iso(asOf);
  if (iso(c.signedOn) > on) return false; // not yet in force
  if (on > iso(c.expiresOn)) return false; // expired (inclusive of the whole expiry day)
  if (c.terminatedOn != null && on >= iso(c.terminatedOn)) return false; // terminated on/after that day
  return true;
}

/** Whole years between signing and expiry — derived, for display (§7 «محدد المدة»). */
export function contractTermYears(c: ServiceContractLike): number {
  const from = toDate(c.signedOn);
  const to = toDate(c.expiresOn);
  let years = to.getUTCFullYear() - from.getUTCFullYear();
  const anniversaryPassed =
    to.getUTCMonth() > from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() >= from.getUTCDate());
  if (!anniversaryPassed) years -= 1;
  return Math.max(0, years);
}

/**
 * The Financial Authority a field's contract grants, or null when there is no authority to
 * grant (no contract, or an ineffective one). §7.1: an award «shall be obtained before» —
 * so an unresolvable FA must FAIL CLOSED at the call site, never default to a permissive figure.
 */
export function contractFinancialAuthority(c: ServiceContractLike | null | undefined, asOf: Date = new Date()): number | null {
  if (!c || !serviceContractEffective(c, asOf)) return null;
  return c.financialAuthorityUSD;
}
