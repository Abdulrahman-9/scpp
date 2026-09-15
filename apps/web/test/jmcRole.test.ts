import { approvalTierFor, DEFAULT_APPROVAL_TIERS, mayRatifyTier } from '@masaar/scpp-rules';
import { describe, expect, it } from 'vitest';
import {
  capsForRole, impactfulCount, readCount, orphanRoles, roleFinancialFacts, roleIcon,
  roleKey, roleTone, ACCESS_TABS,
} from '../src/admin/access';
import { tierExample } from '../src/admin/adminDerive';
import { CAPABILITIES } from '../src/admin/capabilities';
import { API_ROLES, type ApiRole } from '../src/session';
import {
  enabledSuperAdmins, reducer, scopeConsistent, seedState, SEED_APPROVAL_TIERS,
  tenderApprovalTier, type Actor, type AuditEntry, type State,
} from '../src/store';

/**
 * Phase 5 — the JMC role and the tier-gated award decision (client requests 19أ/19ب/20/21).
 *
 * The one thing these tests exist to prevent: the screen claiming an authority the server would
 * refuse. Every assertion therefore reads the SAME sources the running code does — the capability
 * register (real @Roles lists), the live ladder, and the seeded directory.
 */

const JMC: Actor = { oid: 'oid-jmc-01', name: 'م. رافد الدليمي', role: 'JMC_APPROVER' };
const MDOC: Actor = { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' };
const SUPER: Actor = { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' };
const OP_ADMIN: Actor = { oid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' };

const fresh = (): State => seedState();
const tender = (s: State, id: string) => s.tenders.find((t) => t.id === id)!;
const lastRow = (s: State): AuditEntry => s.audit[s.audit.length - 1]!;

/**
 * The two seeded tenders that sit AT the ratification stage in different bands. t3 is the ط2 one
 * (MN-EPC-0305, $7.80M); t4 is ط3 ($12.40M) but parked earlier, so a ط3 tender at the ratify
 * stage is built by moving t3's value past the JMC ceiling — the tender is otherwise identical,
 * which is what isolates the VALUE as the only thing the gate reacts to.
 */
function t3At(valueUSD: number): State {
  const s = fresh();
  return { ...s, tenders: s.tenders.map((t) => (t.id === 't3' ? { ...t, estimatedValueUSD: valueUSD } : t)) };
}

/* ---------------------------------------------------------------- the gate */

describe('RATIFY — the ladder is an authority gate, not only a label (19ب)', () => {
  it('the seeded ط2 request is exactly that, so the fixtures argue from real data', () => {
    expect(tenderApprovalTier(fresh(), tender(fresh(), 't3'))).toBe('JMC');
    expect(tender(fresh(), 't3').estimatedValueUSD).toBe(7_800_000);
  });

  it('the joint committee ratifies a ط2 award, and the row is attributed to it', () => {
    const s = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: JMC });
    expect(tender(s, 't3').ratification?.status).toBe('ratified');
    expect(lastRow(s)).toMatchObject({ action: 'RATIFY', target: 'MN-EPC-0305', outcome: 'applied' });
    expect(lastRow(s).by).toEqual(JMC);
  });

  it('the joint committee is REFUSED on a ط3 award — and the attempt is recorded, not swallowed', () => {
    const s0 = t3At(12_400_000);
    const s = reducer(s0, { type: 'RATIFY', tenderId: 't3', by: JMC });
    expect(tender(s, 't3').ratification).toBeUndefined();     // the tender is untouched
    expect(lastRow(s).action).toBe('RATIFY');
    expect(lastRow(s).outcome).toBe('refused');
    expect(lastRow(s).reasonCode).toBe('tier-MDOC');           // WHY, in the band's own vocabulary
    expect(lastRow(s).by).toEqual(JMC);                        // WHO — the immutable actor
  });

  it('the parent company signs both bands — a higher body is never locked out of a lower one', () => {
    expect(tender(reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: MDOC }), 't3').ratification?.status).toBe('ratified');
    const s3 = t3At(12_400_000);
    expect(tender(reducer(s3, { type: 'RATIFY', tenderId: 't3', by: MDOC }), 't3').ratification?.status).toBe('ratified');
  });

  it('the platform administrator clears the top band too', () => {
    const s = reducer(t3At(12_400_000), { type: 'RATIFY', tenderId: 't3', by: SUPER });
    expect(tender(s, 't3').ratification?.status).toBe('ratified');
  });

  it('an operator admin is refused on EVERY band, including its own company’s ط1', () => {
    for (const [value, code] of [[4_200_000, 'tier-OPERATOR'], [7_800_000, 'tier-JMC'], [12_400_000, 'tier-MDOC']] as const) {
      const s = reducer(t3At(value), { type: 'RATIFY', tenderId: 't3', by: OP_ADMIN });
      expect(tender(s, 't3').ratification).toBeUndefined();
      expect(lastRow(s).reasonCode).toBe(code);
    }
  });

  it('authority is judged BEFORE the merits — an already-decided file still refuses on the band', () => {
    // decide it first (by a body that may), then let the wrong body try: the refusal must cite the
    // BAND, not «already decided» — a body with no standing must not learn the file's state
    let s = reducer(t3At(12_400_000), { type: 'RATIFY', tenderId: 't3', by: MDOC });
    s = reducer(s, { type: 'RATIFY', tenderId: 't3', by: JMC });
    expect(lastRow(s).reasonCode).toBe('tier-MDOC');
    expect(tender(s, 't3').ratification?.by).toEqual(MDOC); // the real decision is untouched
  });

  it('an unknown tender records nothing at all — there is no attempt to attribute', () => {
    const s0 = fresh();
    const s = reducer(s0, { type: 'RATIFY', tenderId: 'nope', by: JMC });
    expect(s).toBe(s0);
  });
});

describe('RETURN_WITH_NOTES — the same seat answers to the same band', () => {
  it('the joint committee returns a ط2 file with notes', () => {
    const s = reducer(fresh(), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: JMC, notes: 'إعادة تقييم البند الرابع' });
    expect(tender(s, 't3').ratification?.status).toBe('returned');
    expect(lastRow(s).outcome).toBe('applied');
  });

  it('returning is NOT the unguarded way into a band the body cannot sign', () => {
    const s = reducer(t3At(12_400_000), { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: JMC, notes: 'ملاحظات' });
    expect(tender(s, 't3').ratification).toBeUndefined();
    expect(lastRow(s)).toMatchObject({ action: 'RETURN_WITH_NOTES', outcome: 'refused', reasonCode: 'tier-MDOC' });
  });

  it('a merit refusal (empty notes) stays silent — nothing happened, so nothing is written', () => {
    const s0 = fresh();
    const s = reducer(s0, { type: 'RETURN_WITH_NOTES', tenderId: 't3', by: JMC, notes: '   ' });
    expect(s).toBe(s0);
  });
});

/* -------------------------------------------------------- capability register */

describe('capability register — the JMC column is the decorators, nothing more (19ب)', () => {
  const byId = (id: string) => CAPABILITIES.find((c) => c.id === id)!;

  it('adds NO endpoint: a new role is not a new row', () => {
    // The register is 46 rows since the phase-5 re-extraction (three §9 local-content handlers
    // that were always guarded and never listed — see capabilities.ts CAP_REV gt-2026-08-20c).
    // That correction is INDEPENDENT of this role: what this test pins is that JMC_APPROVER
    // itself brought no row with it, which the next assertion states positively.
    expect(CAPABILITIES).toHaveLength(46);
    expect(CAPABILITIES.filter((c) => c.guard === 'roles')).toHaveLength(39);
    // none of the three recovered rows admits the joint committee — they are operator-scoped.
    // GUARDED rows only: `authLogout`/`authMe` name every role, but they are session plumbing
    // and are excluded from every counter (guard === 'session').
    expect(CAPABILITIES.filter((c) => c.guard === 'roles' && c.roles.includes('JMC_APPROVER')))
      .toHaveLength(2);
  });

  it('names JMC_APPROVER on exactly the two rows whose @Roles list changed', () => {
    const guarded = CAPABILITIES.filter((c) => c.guard === 'roles' && c.roles.includes('JMC_APPROVER'));
    expect(guarded.map((c) => c.id).sort()).toEqual(['ratifyAward', 'returnWithNotes']);
    expect(byId('ratifyAward').roles).toEqual(['MDOC_ADMIN', 'SUPER_ADMIN', 'JMC_APPROVER']);
    expect(byId('returnWithNotes').roles).toEqual(['MDOC_ADMIN', 'SUPER_ADMIN', 'JMC_APPROVER']);
  });

  it('leaves the joint committee with 2 impactful actions and the 3 undecorated reads — no more', () => {
    expect(impactfulCount('JMC_APPROVER')).toBe(2);
    expect(readCount('JMC_APPROVER')).toBe(3);
    expect(capsForRole('JMC_APPROVER').map((c) => c.id).sort())
      .toEqual(['getTender', 'listHolidays', 'listTenders', 'ratifyAward', 'returnWithNotes']);
  });

  it('does NOT quietly widen it into contracts, vendors, users or the audit log', () => {
    const reached = new Set(capsForRole('JMC_APPROVER').map((c) => c.domain));
    expect([...reached].sort()).toEqual(['holidays', 'tenders']);
  });

  it('keeps the platform administrator’s every-guarded-capability invariant intact', () => {
    expect(CAPABILITIES.filter((c) => c.guard === 'roles' && !c.roles.includes('SUPER_ADMIN'))).toEqual([]);
  });

  it('carries the seventh role in the universe, its own key, tone and glyph', () => {
    expect(API_ROLES).toHaveLength(7);
    expect(API_ROLES[2]).toBe('JMC_APPROVER'); // ladder order: below MDOC, above the committees
    expect(roleKey('JMC_APPROVER')).toBe('jmcApprover');
    expect(roleTone('JMC_APPROVER')).toBe('jmc');
    expect(new Set(API_ROLES.map(roleIcon)).size).toBeGreaterThan(1);
  });
});

/* -------------------------------------------------- the three financial facts */

describe('role cards — the financial facts are DERIVED from the same ladder (21)', () => {
  const tiers = SEED_APPROVAL_TIERS;

  /**
   * DRIFT ALARM (client half) — the server's `assertTierAuthority` reads `DEFAULT_APPROVAL_TIERS`
   * directly and has no tiers model to read instead; this app reads `state.approvalTiers`, which is
   * editable state seeded from the same object. Identity here is what makes a disabled «صادق»
   * button and the server's 403 the same judgement. NAMED DEBT (ops/CLIENT-FEEDBACK-PLAN.md,
   * phase 1): a governed action that moves the ceilings breaks this identity — move both sites, or
   * this and apps/api/test/tenders.service.spec.ts fail together, which is the point.
   */
  it('the store’s seeded ladder IS the engine default — one ladder, two apps', () => {
    expect(SEED_APPROVAL_TIERS).toBe(DEFAULT_APPROVAL_TIERS);
    expect(seedState().approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
    // the LIVE ladder a fresh session gates on is that same object — not merely an equal copy
    expect(seedState().approvalTiers).toBe(DEFAULT_APPROVAL_TIERS);
  });

  it('the joint committee approves up to the JMC ceiling, witnesses, and is platform-scoped', () => {
    const f = roleFinancialFacts('JMC_APPROVER', tiers);
    expect(f.approvesUpToUSD).toBe(tiers.jmcMaxUSD);
    expect(f.approvesUnlimited).toBe(false);
    expect(f.decides).toBe(true);
    expect(f.scope).toBe('platform');
  });

  it('the parent company approves without a ceiling', () => {
    const f = roleFinancialFacts('MDOC_ADMIN', tiers);
    expect(f.approvesUnlimited).toBe(true);
    expect(f.approvesUpToUSD).toBeNull();
    expect(f.decides).toBe(true);
  });

  it('a role that holds no ratify seat approves NOTHING — never «unlimited» by omission', () => {
    for (const r of ['EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER'] as ApiRole[]) {
      const f = roleFinancialFacts(r, tiers);
      expect(f.decides).toBe(false);
      expect(f.approvesUnlimited).toBe(false);
      expect(f.approvesUpToUSD).toBeNull();
    }
  });

  it('marks exactly the two operator roles as company-scoped', () => {
    const scoped = API_ROLES.filter((r) => roleFinancialFacts(r, tiers).scope === 'company');
    expect(scoped).toEqual(['OPERATOR_ADMIN', 'OPERATOR_USER']);
  });

  it('a card can never promise an authority the gate would refuse', () => {
    // the property that matters: whatever ceiling a card prints, the gate agrees AT that value
    // and refuses one cent past it — asked of the engine, exactly as the ratify guard asks it
    for (const r of API_ROLES) {
      const f = roleFinancialFacts(r, tiers);
      if (!f.decides) continue;
      if (f.approvesUnlimited) {
        expect(mayRatifyTier(r, approvalTierFor(tiers.jmcMaxUSD * 10, tiers))).toBe(true);
        continue;
      }
      const ceiling = f.approvesUpToUSD!;
      expect(mayRatifyTier(r, approvalTierFor(ceiling, tiers))).toBe(true);
      expect(mayRatifyTier(r, approvalTierFor(ceiling + 0.01, tiers))).toBe(false);
    }
  });

  it('moves with the ladder — a re-ceilinged JMC band changes the card, not a literal', () => {
    const moved = { operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 };
    expect(roleFinancialFacts('JMC_APPROVER', moved).approvesUpToUSD).toBe(3_000_000);
  });
});

describe('the triad explainer draws its examples from real requests (21)', () => {
  it('names a seeded request for each band the seed actually populates', () => {
    const s = fresh();
    expect(tierExample(s, 'JMC')?.code).toBe('MN-EPC-0305');   // $7.80M
    expect(tierExample(s, 'MDOC')?.code).toBe('B7-FAC-0331');  // $12.40M
    // ط1 holds two seeded requests; the LARGEST teaches where the band ends
    expect(tierExample(s, 'OPERATOR')?.estimatedValueUSD).toBe(4_200_000);
  });

  it('returns nothing for an empty band rather than borrowing a figure from another', () => {
    const empty: State = { ...fresh(), tenders: [] };
    expect(tierExample(empty, 'JMC')).toBeUndefined();
    expect(tierExample(empty, 'MDOC')).toBeUndefined();
  });

  it('every example really belongs to the band it illustrates', () => {
    const s = fresh();
    for (const tier of ['OPERATOR', 'JMC', 'MDOC'] as const) {
      const ex = tierExample(s, tier);
      if (ex) expect(tenderApprovalTier(s, ex)).toBe(tier);
    }
  });
});

/* ------------------------------------------------------------ seed invariants */

describe('the seeded directory after 19أ + 19ب', () => {
  const users = seedState().users;

  it('carries two ENABLED joint-committee members, so the ط2 band never rests on one person', () => {
    const jmc = users.filter((u) => u.role === 'JMC_APPROVER' && !u.disabled);
    expect(jmc).toHaveLength(2);
    expect(jmc.map((u) => u.email).sort()).toEqual(['rafid.dulaimi@jmc.iq', 'suhad.azzawi@jmc.iq']);
  });

  it('scopes them to the platform, not to a company — scopeConsistent holds for every account', () => {
    for (const u of users) expect(scopeConsistent(u.role, u.operatorId)).toBe(true);
    for (const u of users.filter((x) => x.role === 'JMC_APPROVER')) expect(u.operatorId).toBeUndefined();
  });

  it('keeps the exactly-one-enabled-super-admin invariant', () => {
    expect(enabledSuperAdmins(seedState())).toBe(1);
  });

  it('withdraws the title-named auditor account by DISABLING it, never by deleting it (19أ)', () => {
    const titled = users.find((u) => u.email === 'auditor@bsa.iq')!;
    expect(titled).toBeDefined();          // still on file — withdrawal is not erasure (8.1-e)
    expect(titled.disabled).toBe(true);
    // and it carries the documented reason, newest event first
    expect(titled.events?.[0]?.kind).toBe('disable');
    expect((titled.events?.[0]?.reason ?? '').length).toBeGreaterThanOrEqual(20);
  });

  it('leaves no account whose NAME is a job title rather than a person, among the enabled', () => {
    const titleish = users.filter((u) => !u.disabled && /^(حساب|لجنة)\b/.test(u.name));
    expect(titleish).toEqual([]);
  });

  it('reports the AUDITOR role as orphaned — the true state, said out loud', () => {
    // the only auditor was the withdrawn placeholder; the KPI exists to name exactly this
    expect(orphanRoles(users)).toEqual(['AUDITOR']);
  });

  it('every seeded role is a live member of the universe', () => {
    expect(users.filter((u) => !API_ROLES.includes(u.role))).toEqual([]);
  });
});

describe('the merged section’s tab vocabulary is one list (20)', () => {
  it('names the three views, with the register first', () => {
    expect(ACCESS_TABS).toEqual(['accounts', 'roles', 'matrix']);
  });
});
