/**
 * The server's role universe (1:1 with Prisma `enum Role`). `MDOC_ADMIN` was `ROC_ADMIN`
 * until 2026-08-20 (client decision ق2) — the parent company is «شركة نفط الوسط» /
 * Midland Oil Company. The enum value was renamed in place, so no live row carries the
 * retired name; only historical AuditLog TEXT still cites it, and that is never rewritten.
 *
 * `JMC_APPROVER` joined on the same day (client request 19ب): the ق1 tier model already made
 * اللجنة المشتركة the approving body of the ط2 band, and until now no role could hold that seat.
 * It is an ADDITION, not a rename — no existing account changed role.
 */
export type Role = 'SUPER_ADMIN' | 'MDOC_ADMIN' | 'JMC_APPROVER' | 'EVALUATION' | 'AUDITOR' | 'OPERATOR_ADMIN' | 'OPERATOR_USER';

/** The universe as data, in ladder order — the one list `normalizeRole` validates a token's claim against. */
export const ROLES: readonly Role[] = ['SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER'];

/**
 * Retired role identifiers → their current name.
 *
 * TEMPORARY — added 2026-08-20, REMOVE after 2026-08-21. The Prisma enum value was renamed in
 * place (ق2), so no live row carries `ROC_ADMIN`; but a session JWT lives for 8h (JWT_TTL) and
 * every token minted before the deploy still claims the retired name. Read literally, such a
 * token satisfies no `@Roles(...)` set and authorizes NOTHING — an 8-hour authorization outage
 * for staff who were already signed in. Reads are therefore tolerant, exactly as the web client
 * already reads its stored session (apps/web/src/session.ts RETIRED_ROLES); writes only ever
 * emit today's vocabulary. Safe to delete once every pre-rename token has expired.
 */
export const RETIRED_ROLES: Readonly<Record<string, Role>> = { ROC_ADMIN: 'MDOC_ADMIN' };

/**
 * A role claim as its current identifier — `undefined` when it names no role at all, so an
 * unknown or forged value fails closed instead of being cast into the union.
 */
export function normalizeRole(role: string | undefined): Role | undefined {
  if (!role) return undefined;
  const current = RETIRED_ROLES[role] ?? role;
  return ROLES.includes(current as Role) ? (current as Role) : undefined;
}

/** What every authenticated request carries (decoded from the session JWT). */
export interface AuthUser {
  userId: string;
  name: string;
  role: Role;
  /** present for operator-scoped roles — the only company they may touch */
  operatorId?: string;
}

export const SESSION_COOKIE = 'masaar_session';
