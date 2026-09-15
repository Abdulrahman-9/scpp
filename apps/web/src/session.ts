/**
 * Mock session — placeholder for Azure AD (MSAL) + 2FA.
 * Stores the role-scoped session the README requires (user, role, operator scope).
 *
 * The session carries the server's own role vocabulary. It used to carry a parallel
 * two-value union that every consumer re-mapped with `role === 'roc-admin' ? … : …`,
 * which silently funnelled any third role into the operator branch.
 */

/**
 * The server's role universe (mirrors apps/api/src/auth/auth.types.ts — same seven identifiers,
 * same order). `JMC_APPROVER` was added 2026-08-20 (client request 19ب): the ق1 ladder already
 * named اللجنة المشتركة as the ط2 approving body, and this is the seat that holds it.
 */
export type ApiRole =
  | 'SUPER_ADMIN' | 'MDOC_ADMIN' | 'JMC_APPROVER' | 'EVALUATION' | 'AUDITOR'
  | 'OPERATOR_ADMIN' | 'OPERATOR_USER';

/**
 * The universe as data, in LADDER order — the one list `normalizeRole` validates against.
 * The order is the governance hierarchy (platform → parent company → joint committee → committees
 * → audit → operator), which is what every role column, chip row and card grid renders in.
 */
export const API_ROLES: readonly ApiRole[] = [
  'SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER',
];

/**
 * Retired role identifiers → their current name. `ROC_ADMIN` became `MDOC_ADMIN` on
 * 2026-08-20 (client decision ق2): the parent company is «شركة نفط الوسط» / Midland Oil
 * Company. Reads are tolerant so a session persisted before the rename still authorizes and a
 * historical audit row still renders a role name; writes only ever emit the current vocabulary.
 * This map is the ONLY place the retired identifier survives outside migration history.
 */
export const RETIRED_ROLES: Readonly<Record<string, ApiRole>> = { ROC_ADMIN: 'MDOC_ADMIN' };

/**
 * A stored/legacy role string as its current identifier — `null` when it names no role at all,
 * so an unknown value fails closed instead of being cast into the union.
 */
export function normalizeRole(role: string): ApiRole | null {
  const current = RETIRED_ROLES[role] ?? role;
  return (API_ROLES as readonly string[]).includes(current) ? (current as ApiRole) : null;
}

/** Company-scoped roles (mirrors apps/api/src/auth/scope.ts — only these two are scoped). */
export const isOperatorRole = (r: ApiRole): boolean => r === 'OPERATOR_ADMIN' || r === 'OPERATOR_USER';

/** The only roles the server will mint a session for (auth LoginDto `@IsIn`). */
export const API_LOGINABLE_ROLES = ['OPERATOR_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER'] as const;
export type ApiLoginableRole = (typeof API_LOGINABLE_ROLES)[number];
export const isApiLoginable = (r: ApiRole): r is ApiLoginableRole =>
  (API_LOGINABLE_ROLES as readonly ApiRole[]).includes(r);

export interface Session {
  name: string;
  role: ApiRole;
  /** immutable Azure object id — the only safe way to bind a session to an account */
  oid: string;
  company?: string;
  companyId?: string;
}

/**
 * Demo sign-in identities. Each `oid` must match a seeded account in `seedState()`
 * (pinned by apps/web/test/capabilities.test.ts) so the session resolves to a real user.
 */
export interface DemoIdentity {
  role: ApiRole;
  oid: string;
  name: string;
  /**
   * ل1 — the i18n key naming this seat on the sign-in screen, carried BY the mandate.
   *
   * The picker used to be three hand-written `<option>`s while this list held four identities, so
   * the joint-committee seat existed in every layer of the product except the one door into it:
   * the ط2 gate could be described on screen and never exercised (§2-ز ل1). Hanging the label on
   * the identity makes that class of drift impossible — a seat added here arrives at the picker
   * with its own name, and a seat removed leaves with it.
   */
  labelKey: string;
  company?: string;
  companyId?: string;
}

export const DEMO_IDENTITIES: DemoIdentity[] = [
  { role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', labelKey: 'login.roleOperator', company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha' },
  { role: 'MDOC_ADMIN', oid: 'oid-roc-01', name: 'د. سارة الجبوري', labelKey: 'login.roleMdoc' },
  // the ط2 seat (request 19ب) — without a way to hold it, the joint committee's gate could be
  // described on screen but never exercised, which is the one thing this section may not do
  { role: 'JMC_APPROVER', oid: 'oid-jmc-01', name: 'م. رافد الدليمي', labelKey: 'login.roleJmc' },
  { role: 'SUPER_ADMIN', oid: 'oid-super-01', name: 'م. مصطفى الكرخي', labelKey: 'login.roleSuper' },
];

// v2: `oid` became required. A v1 blob would deserialize with oid === undefined and
// silently fail every account lookup, so the key was bumped rather than migrated.
// v3: the role vocabulary changed (ROC_ADMIN → MDOC_ADMIN). Here the blob IS still usable —
// the same person, the same account, one renamed identifier — so v2 is migrated forward
// rather than discarded: dropping it would sign a working session out for a spelling change.
const KEY = 'masaar-session-v3';
const LEGACY_KEY = 'masaar-session-v2';

/** Parse + validate one stored blob. The role is normalized, so a retired identifier
 *  resolves to its current name and an unknown one invalidates the session outright —
 *  a session whose role cannot be placed must not authorize anything. */
function parseSession(raw: string): Session | null {
  // an unchecked cast is how a shape change becomes a silent runtime failure
  const s = JSON.parse(raw) as Session;
  if (!s || typeof s.oid !== 'string' || typeof s.role !== 'string') return null;
  const role = normalizeRole(s.role);
  return role ? { ...s, role } : null;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return parseSession(raw);

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const migrated = parseSession(legacy);
    // re-home under v3 (already role-normalized) and retire the old key, so the migration
    // runs once instead of on every load. A blob too broken to parse is simply dropped.
    if (migrated) saveSession(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
