import { describe, expect, it } from 'vitest';
import {
  defaultAnnouncementFor, emptyState, reducer, seedState, tenderLocalContentApplies, tenderLocalContentStatus,
  type Actor, type MaterialDeclaration, type State, type Tender,
} from '../src/store';

/**
 * §9 wired into the store (local-mode law). The seed is the proof the advisor asked for: t3 (EPC,
 * above FA) triggers C8.1/C8.2 and carries a documented decline → it reads as a lawful EXEMPTION,
 * not a violation and not a void. The governed SET_STATE_RESPONSE records the C8.2 evidence.
 */

const fresh = (): State => seedState();
const ADMIN: Actor = { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' };
const t = (s: State, id: string): Tender => s.tenders.find((x) => x.id === id)!;
const REASON = 'اعتذار موثّق من الشركة الحكومية بكتاب رسمي رقم 2026/155';

describe('§9 seed — the exemption proof', () => {
  it('t3 (EPC above FA) triggers the requirement and reads exempt via a documented decline', () => {
    const s = fresh();
    expect(tenderLocalContentApplies(s, t(s, 't3'))).toBe(true);
    expect(tenderLocalContentStatus(s, t(s, 't3'))).toBe('exempt');
  });

  it('t2 (OTHER scope) and t1 (drilling but below its FA) are both not-required', () => {
    const s = fresh();
    expect(tenderLocalContentApplies(s, t(s, 't2'))).toBe(false);
    expect(tenderLocalContentStatus(s, t(s, 't2'))).toBe('not-required');
    // t1 is a drilling tender but 4.2M < its 5M field FA (Ahdab) → the requirement does not trigger
    expect(tenderLocalContentApplies(s, t(s, 't1'))).toBe(false);
    expect(tenderLocalContentStatus(s, t(s, 't1'))).toBe('not-required');
  });

  it('t4 (EPC above FA with an ACCEPTED state company) is the third state: compliant', () => {
    // the seed now shows all three reachable §9 states side by side — not-required (t1/t2),
    // exempt via a documented decline (t3), and genuine participation (t4)
    const s = fresh();
    expect(tenderLocalContentApplies(s, t(s, 't4'))).toBe(true);
    expect(tenderLocalContentStatus(s, t(s, 't4'))).toBe('compliant');
    // …and its documents already carry the 20% clause, so the C8.1 publish gate is satisfied
    expect(t(s, 't4').localContentClauseAffixed).toBe(true);
  });

  it('seeds the five state companies, each competing under the ordinary 10.4 gates (C8.4)', () => {
    const state = fresh().vendors.filter((v) => v.isStateCompany);
    expect(state.map((v) => v.id).sort()).toEqual(['v-heesco', 'v-idc', 'v-oec', 'v-prdc', 'v-scop']);
  });
});

describe('SET_STATE_RESPONSE — the C8.2 record', () => {
  it('an accepted participation flips the status to compliant', () => {
    const s = reducer(fresh(), { type: 'SET_STATE_RESPONSE', tenderId: 't3', company: 'IDC', status: 'accepted', reason: REASON, by: ADMIN });
    expect(tenderLocalContentStatus(s, t(s, 't3'))).toBe('compliant');
  });

  it('a pending response with no participation and no evidence is a violation', () => {
    // replace t3's documented decline with a bare pending → no evidence remains
    const s = reducer(fresh(), { type: 'SET_STATE_RESPONSE', tenderId: 't3', company: 'SCOP', status: 'pending', reason: REASON, by: ADMIN });
    expect(tenderLocalContentStatus(s, t(s, 't3'))).toBe('violating');
  });

  it('refuses to record without a documented reason (≥20 chars) — state unchanged', () => {
    const s0 = fresh();
    const s1 = reducer(s0, { type: 'SET_STATE_RESPONSE', tenderId: 't3', company: 'OEC', status: 'declined', reason: 'قصير', by: ADMIN });
    expect(s1).toBe(s0);
  });
});

describe('SET_BIDDER_MATERIALS — the C8.6 declarations', () => {
  it('attaches per-material origin declarations to a bidder', () => {
    const decls = [{ materialId: 'turbines', imported: true, origin: 'China' as string }];
    const s = reducer(fresh(), { type: 'SET_BIDDER_MATERIALS', tenderId: 't1', bidderId: 'b1-t1', materials: decls });
    expect(t(s, 't1').bidders.find((b) => b.id === 'b1-t1')!.materials).toEqual(decls);
  });
});

describe('C8.6 gate on SET_TECHNICAL (10.6.18) — the only hard award-side gate', () => {
  const withMaterials = (materials: MaterialDeclaration[]): State =>
    ({ ...emptyState(), tenders: [{ id: 'tb', code: 'TB-0001', title: { ar: '', en: '' }, budgetCode: 'X', estimatedValueUSD: 1,
       methodId: 7, createdOn: '2026-01-01', stages: [], announcement: defaultAnnouncementFor(7), evaluationStep: 0,
       bidders: [{ id: 'b1', name: 'x', docsOk: true, bondOk: true, materials }] }] } as State);
  const tech = (s: State) => s.tenders[0]!.bidders[0]!.technicalResult;

  it('refuses a pass while an imported critical material fails origin', () => {
    const s = reducer(withMaterials([{ materialId: 'turbines', imported: true, origin: 'China' }]), { type: 'SET_TECHNICAL', tenderId: 'tb', bidderId: 'b1', result: 'pass' });
    expect(tech(s)).toBeUndefined();
  });

  it('always allows a fail', () => {
    const s = reducer(withMaterials([{ materialId: 'turbines', imported: true, origin: 'China' }]), { type: 'SET_TECHNICAL', tenderId: 'tb', bidderId: 'b1', result: 'fail' });
    expect(tech(s)).toBe('fail');
  });

  it('allows a pass when every declared material clears C8.6 (approved origin + domestic)', () => {
    const s = reducer(withMaterials([{ materialId: 'pumps-610', imported: true, origin: 'Japan' }, { materialId: 'wellhead', imported: false }]), { type: 'SET_TECHNICAL', tenderId: 'tb', bidderId: 'b1', result: 'pass' });
    expect(tech(s)).toBe('pass');
  });
});

describe('C8.1 publish gate — documents must carry the 20% clause before publication', () => {
  const applies = (affixed: boolean): State =>
    ({ ...emptyState(), tenders: [{ id: 'tp', code: 'TP-0001', title: { ar: '', en: '' }, budgetCode: 'X', estimatedValueUSD: 5_000_000,
       methodId: 6, createdOn: '2026-01-01', scope: 'ENGINEERING_CONSTRUCTION', localContentClauseAffixed: affixed, stages: [], evaluationStep: 0, bidders: [],
       announcement: { mode: 'limited', periodDays: 14, newspapers: ['', '', ''], lcWebsite: false, rocWebsite: false, inviteeCount: 2, inviteesPreQualified: true } }] } as State);
  const pub = (s: State) => s.tenders[0]!.announcement.publishedOn;

  it('refuses publication while the requirement applies and the clause is not affixed', () => {
    expect(pub(reducer(applies(false), { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 'tp' }))).toBeUndefined();
  });

  it('publishes once the clause is affixed', () => {
    expect(pub(reducer(applies(true), { type: 'PUBLISH_ANNOUNCEMENT', tenderId: 'tp' }))).toBeDefined();
  });
});

describe('C8.8 sign-stage documents — post-award inspection + certified origin (via stageCanClose)', () => {
  // bidders carry (technicalResult, priceUSD) so lowestQualified resolves the WINNER at sign
  type B = { id: string; win?: boolean; imported: boolean };
  const mk = (bs: B[], docs: string[]): State =>
    ({ ...emptyState(), tenders: [{ id: 'ts', code: 'TS-0001', title: { ar: '', en: '' }, budgetCode: 'X', estimatedValueUSD: 1,
       methodId: 7, createdOn: '2026-01-01', stages: [{ key: 'sign', uploadedDocs: docs }], announcement: defaultAnnouncementFor(7), evaluationStep: 3,
       bidders: bs.map((b) => ({ id: b.id, name: b.id, docsOk: true, bondOk: true,
         technicalResult: 'pass' as const, priceUSD: b.win ? 100 : 200,
         materials: [{ materialId: 'turbines', imported: b.imported, origin: 'Japan' }] })) }] } as State);
  const close = (s: State) => reducer(s, { type: 'COMPLETE_STAGE', tenderId: 'ts', stageKey: 'sign', actualTo: '2026-08-01' }).tenders[0]!.stages[0]!.actualTo;

  it('refuses to close sign without both certificates when the WINNER declares imported materials', () => {
    expect(close(mk([{ id: 'w', win: true, imported: true }], ['stage-report']))).toBeUndefined();
  });

  it('closes sign once both certificates are uploaded', () => {
    expect(close(mk([{ id: 'w', win: true, imported: true }], ['stage-report', 'inspection-cert', 'origin-cert']))).toBeDefined();
  });

  it('does NOT demand the certificates when the WINNER is domestic but a LOSER declared imports', () => {
    // the advisor's fix — measuring "any bidder" would wrongly demand certs for a domestic award
    expect(close(mk([{ id: 'w', win: true, imported: false }, { id: 'l', imported: true }], ['stage-report']))).toBeDefined();
  });
});
