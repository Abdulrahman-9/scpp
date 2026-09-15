// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSessionOrg, operatorName } from '../src/orgIdentity';
import { DEMO_IDENTITIES, saveSession, type DemoIdentity } from '../src/session';
import { seedState } from '../src/store';

/**
 * The chrome and every printed A4 report name the signed-in company through this one resolver.
 * When the demo universe was replaced (ق3), an unremapped session would have kept resolving to a
 * company that no longer exists — the resolver would fall back to the session's own label and the
 * contract chip would silently vanish. These pin the resolution in the MDOC universe instead.
 */

afterEach(() => localStorage.clear());

const signIn = (id: DemoIdentity) =>
  saveSession({ name: id.name, role: id.role, oid: id.oid, ...(id.company ? { company: id.company } : {}), ...(id.companyId ? { companyId: id.companyId } : {}) });

const opAdmin = DEMO_IDENTITIES.find((i) => i.role === 'OPERATOR_ADMIN')!;

describe('resolveSessionOrg in the MDOC universe', () => {
  it('resolves the operator sign-in to its registry company, in both languages', () => {
    signIn(opAdmin);
    const s = seedState();
    expect(resolveSessionOrg(s, 'ar').name).toBe('شركة نفط الواحة الصينية');
    expect(resolveSessionOrg(s, 'en').name).toBe('AlWaha');
  });

  it('resolves the §7.1 Service Contract chip off that company’s field, not an invented one', () => {
    signIn(opAdmin);
    // AlWaha operates AHDAB; its contract runs to the registry's own contract-end (2031-01)
    expect(resolveSessionOrg(seedState(), 'ar').contractRef).toBe('SC-AHDAB-24 · 2024–2031');
  });

  it('every demo identity carrying a company resolves to a real registry row', () => {
    const s = seedState();
    for (const id of DEMO_IDENTITIES.filter((i) => i.companyId)) {
      signIn(id);
      const org = resolveSessionOrg(s, 'ar');
      expect(org.name, `identity ${id.oid}`).toBe(operatorName(s, id.companyId, 'ar'));
      // a resolvable company in this universe always has an effective contract → a chip, never a gap
      expect(org.contractRef, `identity ${id.oid}`).toBeDefined();
    }
  });

  it('the session label is a fallback, never the source — the registry name wins', () => {
    // sign in with a stale company label from the retired southern universe
    saveSession({ name: opAdmin.name, role: opAdmin.role, oid: opAdmin.oid, company: 'شركة نفط البصرة', companyId: opAdmin.companyId });
    expect(resolveSessionOrg(seedState(), 'ar').name).toBe('شركة نفط الواحة الصينية');
  });

  it('omits the identity entirely when nothing resolves — a plausible name is the fabrication this replaces', () => {
    saveSession({ name: 'مجهول', role: 'OPERATOR_ADMIN', oid: 'oid-not-seeded' });
    expect(resolveSessionOrg(seedState(), 'ar')).toEqual({});
  });
});
