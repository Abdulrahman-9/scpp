import { describe, expect, it } from 'vitest';
import {
  cellState,
  capsForRole,
  impactfulCount,
  orphanRoleCount,
  rolesOrphanedBy,
  matchUser,
  roleKey,
  roleTone,
  specConflicts,
} from '../src/admin/access';
import { CAPABILITIES, COUNTED, type Capability } from '../src/admin/capabilities';
import { API_ROLES, DEMO_IDENTITIES, isApiLoginable, normalizeRole, type ApiRole } from '../src/session';
import { seedState, type AuditEntry, type UserAccount } from '../src/store';

const byId = (id: string): Capability => {
  const c = CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`no capability ${id}`);
  return c;
};

/**
 * Drift guard — these numbers are rendered on screen, so they must be pinned.
 * Re-extract from apps/api/src/**\/*.controller.ts and bump CAP_REV when a controller changes.
 */
describe('capability register', () => {
  it('holds the full endpoint surface: 46 = 39 guarded + 3 open + 4 session', () => {
    // 43 → 46 on the phase-5 sweep: the three §9 local-content handlers (C8.1/C8.2/C8.6) carry
    // real @Roles decorators and were never extracted. The count is a claim about the SERVER, so
    // it may only be corrected by re-reading the controllers — which is what moved it.
    expect(CAPABILITIES).toHaveLength(46);
    expect(CAPABILITIES.filter((c) => c.guard === 'roles')).toHaveLength(39);
    expect(CAPABILITIES.filter((c) => c.guard === 'open')).toHaveLength(3);
    expect(CAPABILITIES.filter((c) => c.guard === 'session')).toHaveLength(4);
    expect(COUNTED).toHaveLength(42);
  });

  /**
   * The sweep itself, as an assertion rather than as a claim in a comment: every route the
   * register names must be distinct, and the three rows the sweep recovered must be present with
   * the decorator list they really carry (`@Roles(...OPERATOR_ROLES)` — the publish list).
   */
  it('names the three §9 local-content handlers with their real decorator list', () => {
    const lc = ['setLocalContentClause', 'setStateResponse', 'setBidderMaterials'].map(byId);
    for (const c of lc) {
      expect(c.guard).toBe('roles');
      expect(c.roles).toEqual(['OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN']);
      expect(c.scoped).toBe(true);   // loadScopedActive
      expect(c.stateGated).toBe(true);
      expect(c.domain).toBe('tenders');
    }
    // the publish row is the list they were copied from — if publish ever moves, so must these
    expect(lc.map((c) => c.roles)).toEqual(lc.map(() => byId('publishAnnouncement').roles));
  });

  it('gives every row its own route+method pair — a duplicate would mean a mis-extraction', () => {
    const keys = CAPABILITIES.map((c) => `${c.method} ${c.route}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives SUPER_ADMIN every role-guarded capability', () => {
    const missing = CAPABILITIES.filter((c) => c.guard === 'roles' && !c.roles.includes('SUPER_ADMIN'));
    expect(missing.map((c) => c.id)).toEqual([]);
  });

  it('names the three undecorated reads exactly', () => {
    expect(CAPABILITIES.filter((c) => c.guard === 'open').map((c) => c.id).sort())
      .toEqual(['getTender', 'listHolidays', 'listTenders']);
  });

  it('partitions the counted universe across seven domains', () => {
    const counts: Record<string, number> = {};
    for (const c of COUNTED) counts[c.domain] = (counts[c.domain] ?? 0) + 1;
    expect(counts).toEqual({ tenders: 20, mct: 4, contracts: 5, vendors: 6, users: 3, audit: 1, holidays: 3 });
  });

  it('has unique ids and a clause that is either empty or numeric', () => {
    expect(new Set(CAPABILITIES.map((c) => c.id)).size).toBe(46);
    // section-first, always: «§9 C8.1» is written `9-C8.1`, never `C8.1`
    for (const c of CAPABILITIES) expect(c.clause).toMatch(/^$|^\d/);
  });

  it('counts 23 of 46 capabilities with no numbered clause', () => {
    // unchanged by the sweep: all three recovered rows cite a §9 clause, so the unnumbered
    // set is exactly the one it was — the denominator moved, the gap did not widen
    expect(CAPABILITIES.filter((c) => !c.clause)).toHaveLength(23);
  });

  it('treats only writes behind a real role guard as impactful', () => {
    // authLogout is a POST but session plumbing — it must never inflate an action count
    expect(byId('authLogout').mutating).toBe(false);
    expect(byId('ratifyAward').mutating).toBe(true);
    expect(byId('listTenders').mutating).toBe(false);
  });
});

describe('cellState — the five-state rendering', () => {
  it('scopes a capability only for the two operator roles', () => {
    const ratify = byId('ratifyAward'); // scoped:true, but MDOC/SUPER are never company-limited
    expect(cellState(ratify, 'MDOC_ADMIN')).toBe('yes');
    expect(cellState(ratify, 'EVALUATION')).toBe('no');

    const create = byId('createTender'); // scoped:true and operator-facing
    expect(cellState(create, 'OPERATOR_USER')).toBe('scoped');
    expect(cellState(create, 'SUPER_ADMIN')).toBe('yes');
  });

  it('renders an undecorated read as open, but still scoped for operator roles', () => {
    const list = byId('listTenders');
    expect(cellState(list, 'AUDITOR')).toBe('open');
    expect(cellState(list, 'OPERATOR_ADMIN')).toBe('scoped');
    // holidays are open and unscoped for everyone
    expect(cellState(byId('listHolidays'), 'OPERATOR_ADMIN')).toBe('open');
  });

  it('marks session plumbing as excluded for every role', () => {
    for (const r of ['SUPER_ADMIN', 'AUDITOR', 'OPERATOR_USER'] as ApiRole[]) {
      expect(cellState(byId('authMe'), r)).toBe('session');
    }
  });
});

describe('specification vs. enforcement', () => {
  it('records the one known divergence: the spec grants user creation to the operator admin', () => {
    const conflicts = specConflicts();
    expect(conflicts.map((c) => c.id)).toEqual(['createUser']);
    expect(byId('createUser').specGrants).toEqual(['OPERATOR_ADMIN']);
  });

  it('renders the divergence as a conflict, never as a grant', () => {
    // the guard is the authority: OPERATOR_ADMIN must not count as holding it
    expect(cellState(byId('createUser'), 'OPERATOR_ADMIN')).toBe('conflict');
    expect(capsForRole('OPERATOR_ADMIN').some((c) => c.id === 'createUser')).toBe(false);
    // and the role that really holds it is unaffected
    expect(cellState(byId('createUser'), 'SUPER_ADMIN')).toBe('yes');
  });

  it('leaves every other withheld capability a plain refusal', () => {
    expect(cellState(byId('ratifyAward'), 'OPERATOR_ADMIN')).toBe('no');
  });
});

describe('role reach', () => {
  it('leaves the auditor with zero impactful actions', () => {
    expect(impactfulCount('AUDITOR')).toBe(0);
    expect(capsForRole('AUDITOR').length).toBeGreaterThan(0); // read-only, not access-less
  });

  it('separates operator admin from operator user by exactly cancel/suspend/resume', () => {
    const admin = new Set(capsForRole('OPERATOR_ADMIN').map((c) => c.id));
    const user = new Set(capsForRole('OPERATOR_USER').map((c) => c.id));
    const diff = [...admin].filter((id) => !user.has(id)).sort();
    expect(diff).toEqual(['cancelTender', 'resumeTender', 'suspendTender']);
    expect([...user].filter((id) => !admin.has(id))).toEqual([]);
  });
});

const user = (id: string, role: ApiRole, disabled = false): UserAccount => ({
  id, azureOid: `oid-${id}`, name: id, email: `${id}@masaar.iq`, role, twoFa: true, disabled,
});

describe('orphan-role detection', () => {
  it('counts governance roles with no enabled holder', () => {
    const users = [user('a', 'SUPER_ADMIN'), user('b', 'MDOC_ADMIN')];
    // JMC_APPROVER + EVALUATION + AUDITOR have nobody. The count moved from 2 to 3 on 2026-08-20
    // when the joint committee joined GOVERNANCE_ROLES — deliberately: an empty JMC stops every
    // ط2 award, which is the sharpest orphan the platform can have.
    expect(orphanRoleCount(users)).toBe(3);
  });

  it('warns before a change strands a role', () => {
    const users = [
      user('a', 'SUPER_ADMIN'), user('b', 'MDOC_ADMIN'), user('j', 'JMC_APPROVER'),
      user('c', 'EVALUATION'), user('d', 'AUDITOR'),
    ];
    expect(orphanRoleCount(users)).toBe(0);
    // disabling the only evaluation member strands EVALUATION
    expect(rolesOrphanedBy(users, 'c', { role: 'EVALUATION', disabled: true })).toEqual(['EVALUATION']);
    // moving them to auditor strands it just the same
    expect(rolesOrphanedBy(users, 'c', { role: 'AUDITOR', disabled: false })).toEqual(['EVALUATION']);
    // a no-op strands nothing
    expect(rolesOrphanedBy(users, 'c', { role: 'EVALUATION', disabled: false })).toEqual([]);
  });
});

describe('demo sign-in identities', () => {
  it('every login option resolves to a seeded account with a matching role', () => {
    const seeded = seedState().users;
    for (const id of DEMO_IDENTITIES) {
      const account = seeded.find((u) => u.azureOid === id.oid);
      expect(account, `no seeded account for ${id.oid}`).toBeDefined();
      expect(account!.role).toBe(id.role);
      expect(account!.disabled).toBe(false);
      // an operator identity must carry the company its account is scoped to
      expect(id.companyId).toBe(account!.operatorId);
    }
  });

  it('only offers API sign-in for the three roles the server LoginDto accepts', () => {
    // JMC_APPROVER joined LoginDto with the role itself (19ب): the ط2 gate is enforced against a
    // SESSION, so a seat nobody can hold would be a decorator no request could ever satisfy.
    expect(DEMO_IDENTITIES.filter((i) => isApiLoginable(i.role)).map((i) => i.role).sort())
      .toEqual(['JMC_APPROVER', 'MDOC_ADMIN', 'OPERATOR_ADMIN']);
    expect(isApiLoginable('SUPER_ADMIN')).toBe(false);
  });
});

describe('matchUser', () => {
  const row = (target: string): AuditEntry => ({ ts: '2026-07-22T10:00:00Z', action: 'SET_USER_ROLE', target });

  it('matches both the client target and the server OLD→NEW form', () => {
    // deliberately a PRE-RENAME row: written 2026-07-22 under the retired ROC_ADMIN vocabulary
    // and never rewritten (8.1-e). Matching must not depend on today's role names.
    const m = matchUser('sara.jubouri@roc.iq');
    expect(m(row('sara.jubouri@roc.iq'))).toBe(true);
    expect(m(row('sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION'))).toBe(true);
    expect(m(row('other@roc.iq'))).toBe(false);
    // a longer email that merely starts with the same local part must not match
    expect(m(row('sara.jubouri@roc.iq.example'))).toBe(false);
  });
});

/**
 * The rename is a compatibility event, not just a spelling change: sessions, accounts and audit
 * rows written before 2026-08-20 all carry `ROC_ADMIN`, and each layer must answer for it.
 */
describe('retired role vocabulary (ROC_ADMIN → MDOC_ADMIN)', () => {
  it('resolves the retired identifier and rejects one that names nothing', () => {
    expect(normalizeRole('ROC_ADMIN')).toBe('MDOC_ADMIN');
    expect(normalizeRole('MDOC_ADMIN')).toBe('MDOC_ADMIN');
    expect(normalizeRole('ROC_ADMINISTRATOR')).toBeNull();
    expect(normalizeRole('')).toBeNull();
  });

  it('renders a historical audit role under the CURRENT label, not a wrong one', () => {
    // the pre-2026-08-20 spelling must not fall through to an unrelated role
    expect(roleKey('ROC_ADMIN')).toBe('mdocAdmin');
    expect(roleTone('ROC_ADMIN')).toBe('mdoc');
    // …and a name the register never had reads AS unknown rather than as an operator
    expect(roleKey('COMMITTEE_CHAIR')).toBe('unknown');
    expect(roleTone('COMMITTEE_CHAIR')).toBe('unknown');
    // every live role still has its own key and tone, in ladder order (JMC third — 19ب)
    expect(API_ROLES.map(roleKey)).toEqual(['superAdmin', 'mdocAdmin', 'jmcApprover', 'evaluation', 'auditor', 'operatorAdmin', 'operatorUser']);
    expect(new Set(API_ROLES.map(roleTone)).size).toBe(6); // the two operator roles share one tone
  });

  it('leaves no retired identifier in the live register', () => {
    expect(CAPABILITIES.flatMap((c) => [...c.roles, ...(c.specGrants ?? [])]).filter((r) => !API_ROLES.includes(r))).toEqual([]);
    expect(seedState().users.filter((u) => !API_ROLES.includes(u.role))).toEqual([]);
  });
});
