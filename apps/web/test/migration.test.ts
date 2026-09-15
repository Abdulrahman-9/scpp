// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SEED_APPROVAL_TIERS, StoreProvider, liveFields, resolveTiersFor, seedState, tenderApprovalTier,
  useStore, type Tender,
} from '../src/store';
import { selectableVendors } from '../src/operator/BidderAddDialog';
import { clearSession, loadSession, saveSession } from '../src/session';

/**
 * KEY migration → v9 (client decision ق3, 2026-08-20). The demo universe changed IDENTITY: the
 * southern seed (Rumaila / West Qurna / Majnoon — Basra Oil Company's fields, never نفط الوسط's)
 * was replaced by the 13 real MDOC-area fields under their 12 Lead Contractors, and the state
 * root gained the global approval ladder. Every operator/field/contract id changed, so a legacy
 * blob's tenders point at fields that no longer exist and cannot be re-pointed honestly.
 *
 * What the migration therefore owes is not data preservation but LAW preservation: the
 * append-only audit log (8.1-e) survives in order and untouched, the swap is itself recorded
 * rather than performed silently, the holiday calendar (a fact about Iraq, not about the demo)
 * survives, and `seq` never moves backwards so a generated code cannot collide with one already
 * named in the preserved log.
 *
 * KEY migration → v10 (client decision ق2, same day) is the opposite kind of move: the universe
 * is UNCHANGED and only the role vocabulary was renamed (ROC_ADMIN → MDOC_ADMIN), so a v9 blob
 * must survive whole — every tender, contract, account and audit row — with the rename applied
 * to accounts only. A role is a live authorization fact and must speak today's vocabulary; an
 * audit row is history and must not be touched at all.
 */

afterEach(() => localStorage.clear());

const tender = (id: string, code: string, operatorId: string, estimatedValueUSD: number, extra: object = {}) => ({
  id, code, title: { ar: 'x', en: 'x' }, budgetCode: code.slice(0, 2), estimatedValueUSD, operatorId,
  methodId: 7, createdOn: '2026-01-01', stages: [], evaluationStep: 0, bidders: [],
  announcement: { mode: 'public', periodDays: 21, newspapers: ['', '', ''], lcWebsite: false, rocWebsite: false, inviteeCount: 0, inviteesPreQualified: false },
  ...extra,
});

/** A full v8 blob in the retired southern universe, with a governance trail worth keeping. */
const v8Blob = (extra: object = {}) => ({
  tenders: [
    tender('t1', 'RU-DRL', 'op-bec', 4_200_000, { fieldId: 'f-ru', ratification: { status: 'ratified', by: 'اسم كنص من الخادم', on: '2026-06-01' } }),
    tender('t3', 'MJ-EPC', 'op-mjn', 7_800_000, { fieldId: 'f-mj' }),
  ],
  contracts: [], vendors: [], users: [],
  audit: [
    { ts: '2026-06-01T10:00:00Z', action: 'RATIFY', target: 'RU-DRL' },
    { ts: '2026-06-02T10:00:00Z', action: 'CREATE_TENDER', target: 'MJ' },
  ],
  seq: 140,
  operators: [{ id: 'op-bec', name: 'شركة نفط البصرة' }, { id: 'op-mjn', name: 'شركة نفط ميسان' }],
  fields: [{ id: 'f-ru', name: 'الرميلة', code: 'RU', operatorId: 'op-bec' }],
  serviceContracts: [{ id: 'sc-ru', code: 'SC-RU-24', fieldId: 'f-ru', financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-01' }],
  ...extra,
});

const load = () => renderHook(() => useStore(), { wrapper: StoreProvider }).result.current.state;

describe('masaar-operator v8 → v9 migration (the universe becomes نفط الوسط)', () => {
  it('preserves the append-only audit log in order and records the swap itself', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    // the two historical rows survived the KEY bump, in order, untouched (8.1-e)
    expect(s.audit.slice(0, 2).map((a) => a.action)).toEqual(['RATIFY', 'CREATE_TENDER']);
    expect(s.audit[0]!.target).toBe('RU-DRL');
    // …and the universe replacement is appended rather than performed silently
    expect(s.audit).toHaveLength(3);
    expect(s.audit[2]!.action).toBe('SEED_MIGRATION_V9');
    expect(s.audit[2]!.target).toBe('MDOC');
    // no Actor performed it — a startup migration did, and a fabricated actor would be worse than none
    expect(s.audit[2]!.by).toBeUndefined();
  });

  it('reseeds the MDOC registry: 12 Lead Contractors, 13 fields, 13 service contracts', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    expect(s.operators).toHaveLength(12);
    expect(s.fields).toHaveLength(13);
    expect(s.serviceContracts).toHaveLength(13);
    // the retired southern records are gone — not renamed, not orphaned
    expect(s.fields.some((f) => f.code === 'RU')).toBe(false);
    expect(s.operators.some((o) => o.id === 'op-bec')).toBe(false);
    expect(s.fields.map((f) => f.code)).toContain('AHDAB');
    expect(s.tenders.map((t) => t.id)).toEqual(seedState().tenders.map((t) => t.id));
  });

  it('backfills the global approval ladder, so tiers resolve instead of failing closed to MDOC', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob()));
    const s = load();

    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
    expect(tenderApprovalTier(s, s.tenders.find((t) => t.id === 't1')!)).toBe('OPERATOR');
  });

  it('carries the holiday calendar across (a fact about Iraq, not about the demo data)', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob({ holidays: ['2026-01-01', 'garbage', { date: '2026-05-01', name: 'عيد العمال' }] })));
    const s = load();
    expect(s.holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01', name: 'عيد العمال' }]);
  });

  it('never moves seq backwards — a generated code cannot collide with one already in the log', () => {
    localStorage.setItem('masaar-operator-v8', JSON.stringify(v8Blob())); // seq 140 > the seed's 98
    expect(load().seq).toBe(140);
  });

  it('migrates a v7 blob through the same path — the oldest key is not stranded', () => {
    const v7 = {
      tenders: [tender('t1', 'RU-DRL', 'op-bec', 4_200_000)],
      contracts: [], vendors: [], users: [], seq: 6,
      audit: [{ ts: '2026-06-01T10:00:00Z', action: 'RATIFY', target: 'RU-DRL' }],
      // old shape: FA stored on the operator, no fields/serviceContracts arrays at all
      operators: [{ id: 'op-bec', name: 'شركة نفط البصرة', financialAuthorityUSD: 5_000_000 }],
    };
    localStorage.setItem('masaar-operator-v7', JSON.stringify(v7));
    const s = load();

    expect(s.audit.map((a) => a.action)).toEqual(['RATIFY', 'SEED_MIGRATION_V9']);
    expect(s.fields).toHaveLength(13);
    // the retired per-operator FA cannot survive on any operator row (§7.1 — FA lives on the contract)
    expect(s.operators.every((o) => !('financialAuthorityUSD' in o))).toBe(true);
    expect(s.seq).toBe(98); // the seed's own seq wins over the smaller legacy one
  });
});

describe('v11 blobs load as written', () => {
  it('leaves a valid v11 blob untouched rather than reseeding it', () => {
    const v11 = {
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 3,
      holidays: [{ date: '2026-03-01' }], approvalTiers: { operatorMaxUSD: 1_000_000, jmcMaxUSD: 2_000_000 },
    };
    localStorage.setItem('masaar-operator-v11', JSON.stringify(v11));
    const s = load();
    expect(s.seq).toBe(3);
    expect(s.audit).toEqual([]); // no migration row — nothing was migrated
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 1_000_000, jmcMaxUSD: 2_000_000 }); // an EDITED ladder survives
  });

  it('normalizes an early holidays: string[] blob into { date } objects on load', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 4,
      holidays: ['2026-01-01', 'garbage', '2026-05-01'],
    }));
    expect(load().holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01' }]);
  });

  it('seeds the ladder only when the blob carries NONE — an absent ceiling was never configured', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 5,
    }));
    expect(load().approvalTiers).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
  });

  // A ladder that IS stored but cannot be trusted is the opposite case: repairing it here would
  // hand back ceilings nobody configured and clear requests at the LOWEST gate on their strength.
  // It is carried through as written so `approvalTierFor` — the single judge of a ladder — fails
  // closed to ط3 MDOC, exactly what «approvals.explainFailClosed» promises the user on screen.
  it('carries a half-written ladder through so the engine fails closed instead of inventing ceilings', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 5,
      approvalTiers: { operatorMaxUSD: 'oops' },
    }));
    const s = load();
    expect(Number.isNaN(s.approvalTiers.operatorMaxUSD)).toBe(true);
    expect(Number.isNaN(s.approvalTiers.jmcMaxUSD)).toBe(true);
    expect(tenderApprovalTier(s, { estimatedValueUSD: 1_000 } as Tender)).toBe('MDOC');
  });

  it('carries an INVERTED ladder through — a JMC ceiling under the operator ceiling clears nothing', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify({
      tenders: [], contracts: [], audit: [], vendors: [], users: [],
      operators: [], fields: [], serviceContracts: [], seq: 6,
      approvalTiers: { operatorMaxUSD: 9_000_000, jmcMaxUSD: 1_000_000 },
    }));
    const s = load();
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 9_000_000, jmcMaxUSD: 1_000_000 });
    // 4.2M would sit inside a 9M operator band — but the ladder describing it is unusable
    expect(tenderApprovalTier(s, { estimatedValueUSD: 4_200_000 } as Tender)).toBe('MDOC');
  });
});

/**
 * KEY migration → v11 (client decision ق7, 2026-08-20 — the ARCHIVE MODEL). `Field` and
 * `VendorState` gained an optional `archived` flag and a documented event trail, so the store
 * shape moved and the key moves with it (execution rule 4 of ops/CLIENT-FEEDBACK-PLAN.md).
 *
 * The migration itself is a PASS-THROUGH, and that is the honest form for it: every new field is
 * optional and its absence already means «live», so a v10 record is a valid v11 record with
 * nothing rewritten. Which is exactly why no migration row is appended — SEED_MIGRATION_V9 and
 * ROLE_RENAME_V10 were recorded because those migrations really did change records; a row
 * asserting a change that never happened is the same fabrication as an unrecorded one.
 */
const v10Blob = () => ({
  tenders: [tender('t10', 'AH-DRL', 'op-alwaha', 4_200_000, { fieldId: 'f-ahdab' })],
  contracts: [], users: [acct('u1', 'MDOC_ADMIN')], seq: 311,
  vendors: [{ id: 'v1', name: 'شركة الحفر العراقية', mooListed: true, techScore: 88, financialScore: 76, hseScore: 82, events: [{ kind: 'suspend', reason: 'r', on: '2026-05-01' }] }],
  operators: [{ id: 'op-alwaha', name: 'شركة نفط الواحة الصينية' }],
  fields: [{ id: 'f-ahdab', name: 'الأحدب', code: 'AHDAB', operatorId: 'op-alwaha' }],
  serviceContracts: [{ id: 'sc-ahdab', code: 'SC-AHDAB', fieldId: 'f-ahdab', financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-31' }],
  audit: [
    { ts: '2026-08-01T10:00:00Z', action: 'CREATE_FIELD', target: 'AHDAB', outcome: 'applied', by: { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' } },
    { ts: '2026-08-02T10:00:00Z', action: 'SUSPEND_VENDOR', target: 'شركة الحفر العراقية' },
  ],
  holidays: [{ date: '2026-03-01' }], approvalTiers: { operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 },
});

describe('masaar-operator v10 → v11 migration (the archive model)', () => {
  it('preserves the append-only audit log verbatim, in order, with its attribution', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify(v10Blob()));
    const s = load();

    expect(s.audit).toHaveLength(2); // nothing appended — nothing was migrated
    expect(s.audit.map((a) => a.action)).toEqual(['CREATE_FIELD', 'SUSPEND_VENDOR']);
    expect(s.audit[0]!.by).toEqual({ oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' });
    expect(s.audit[0]!.outcome).toBe('applied');
  });

  it('keeps the universe whole — this is an additive flag, not a reseed', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify(v10Blob()));
    const s = load();

    expect(s.tenders.map((t) => t.id)).toEqual(['t10']); // the user's own tender, not the seed's
    expect(s.seq).toBe(311);
    expect(s.fields.map((f) => f.code)).toEqual(['AHDAB']);
    expect(s.serviceContracts).toHaveLength(1);
    expect(s.users.map((u) => u.role)).toEqual(['MDOC_ADMIN']);
    expect(s.holidays).toEqual([{ date: '2026-03-01' }]);
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 }); // an EDITED ladder survives
    expect(s.vendors[0]!.events).toEqual([{ kind: 'suspend', reason: 'r', on: '2026-05-01' }]); // the trail it already had
  });

  it('leaves every pre-archive record LIVE — an absent flag means live, never archived', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify(v10Blob()));
    const s = load();

    expect(s.fields.every((f) => f.archived === undefined)).toBe(true);
    expect(s.vendors.every((v) => v.archived === undefined)).toBe(true);
    // …and the pickers therefore offer exactly what they offered before the model existed
    expect(liveFields(s.fields)).toHaveLength(1);
    expect(selectableVendors(s.vendors, '2026-07-23').map((v) => v.id)).toEqual(['v1']);
  });

  it('carries a v9 blob through BOTH hops — the role rename still runs, then the flags no-op', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN')])));
    const s = load();

    expect(s.users[0]!.role).toBe('MDOC_ADMIN');           // hop one still happens
    expect(s.audit.map((a) => a.action)).toEqual(['SET_USER_ROLE', 'ROLE_RENAME_V10']);
    expect(s.fields.every((f) => f.archived === undefined)).toBe(true); // hop two adds nothing
  });

  it('prefers a live v11 blob over a stale v10 one', () => {
    localStorage.setItem('masaar-operator-v10', JSON.stringify(v10Blob()));
    localStorage.setItem('masaar-operator-v11', JSON.stringify({ ...v10Blob(), seq: 999 }));
    expect(load().seq).toBe(999);
  });
});

/**
 * KEY migration → v12 (design-finish D1, 2026-08-30 — the STAGE DEVIATION RECORD). `StageState`
 * gained the optional `actualFrom` and `devReason` the closing wizard collects, so the store
 * shape moved and the key moves with it. Same wholesale pass-through as v10 → v11: both fields
 * are optional and absent means «not recorded», so nothing is rewritten and nothing is appended.
 */
describe('masaar-operator v11 → v12 migration (the stage deviation record)', () => {
  const v11WithClosedStage = () => ({
    ...v10Blob(),
    tenders: [tender('t11', 'AH-DRL', 'op-alwaha', 4_200_000, {
      fieldId: 'f-ahdab',
      stages: [{ key: 'cost', plannedFrom: '2026-05-01', plannedTo: '2026-05-07', actualTo: '2026-05-09', uploadedDocs: ['stage-report'] }],
    })],
  });

  it('carries a v11 blob through whole — the closed stage survives verbatim, nothing is appended', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify(v11WithClosedStage()));
    const s = load();

    expect(s.tenders.map((t) => t.id)).toEqual(['t11']);
    expect(s.audit).toHaveLength(2); // v10Blob's two rows — no migration row for a pass-through
    const stage = s.tenders[0]!.stages[0]!;
    expect(stage.actualTo).toBe('2026-05-09');
    // absent means NOT RECORDED — the migration must not invent a start date or a reason
    expect(stage.actualFrom).toBeUndefined();
    expect(stage.devReason).toBeUndefined();
  });

  it('keeps a recorded deviation reason when a v12 blob already carries one', () => {
    const blob = v11WithClosedStage();
    (blob.tenders[0]!.stages[0] as Record<string, unknown>).actualFrom = '2026-05-02';
    (blob.tenders[0]!.stages[0] as Record<string, unknown>).devReason = { cat: 'publisherDelay', note: 'تأخر جهة النشر عن موعد النشر المتفق عليه' };
    localStorage.setItem('masaar-operator-v12', JSON.stringify(blob));
    const s = load();

    const stage = s.tenders[0]!.stages[0]!;
    expect(stage.actualFrom).toBe('2026-05-02');
    expect(stage.devReason).toEqual({ cat: 'publisherDelay', note: 'تأخر جهة النشر عن موعد النشر المتفق عليه' });
  });

  it('prefers a live v12 blob over a stale v11 one', () => {
    localStorage.setItem('masaar-operator-v11', JSON.stringify(v11WithClosedStage()));
    localStorage.setItem('masaar-operator-v12', JSON.stringify({ ...v11WithClosedStage(), seq: 1234 }));
    expect(load().seq).toBe(1234);
  });
});

/**
 * KEY migration → v13 (client decision 2026-08-25 — PER-OPERATOR APPROVAL LADDERS). The state root
 * gained `operatorTiers`, an optional map of ceilings approved for one operating company.
 *
 * Another wholesale pass-through in the v11/v12 mould: an absent map means «every company is on the
 * system default», which is precisely what a v12 blob meant, so nothing is rewritten and nothing is
 * appended. What is NOT like its predecessors is why the key moved at all — see the store comment:
 * an OLD build reading a v13 blob would not see the map and would measure a company that holds an
 * approved ladder against the default instead, which is a silent authority downgrade rather than a
 * display gap. The bump is the isolation, and these tests hold it to that.
 */
describe('masaar-operator v12 → v13 migration (per-operator approval ladders)', () => {
  const v12Blob = () => ({
    ...v10Blob(),
    tenders: [tender('t12', 'AH-DRL', 'op-alwaha', 4_200_000, { fieldId: 'f-ahdab' })],
  });

  it('carries a v12 blob through whole — every record survives, operatorTiers is empty, nothing is appended', () => {
    localStorage.setItem('masaar-operator-v12', JSON.stringify(v12Blob()));
    const s = load();

    expect(s.tenders.map((t) => t.id)).toEqual(['t12']);
    expect(s.operators.map((o) => o.id)).toEqual(['op-alwaha']);
    expect(s.seq).toBe(v12Blob().seq);
    // the absence of an override IS the migration: no company had one, so all are on the default
    expect(s.operatorTiers).toEqual({});
    // the blob's OWN default ladder rides through untouched — v13 adds a layer above it,
    // it does not reset it to seed
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 });
    // NO migration row: a v12 blob and a v13 blob describe the same authorities, and a row
    // claiming a change that never happened is the same fabrication as an unrecorded one
    expect(s.audit).toHaveLength(2);
    expect(s.audit.map((r) => r.action)).not.toContain('SEED_MIGRATION_V9');
  });

  it('carries an APPROVED per-operator ladder through a v13 blob verbatim', () => {
    localStorage.setItem('masaar-operator-v13', JSON.stringify({
      ...v12Blob(),
      operatorTiers: { 'op-alwaha': { operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 } },
    }));
    const s = load();
    expect(s.operatorTiers['op-alwaha']).toEqual({ operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 });
    // and the resolution really uses it: 4.20M is ط1 on the default and ط3 under this ladder
    expect(resolveTiersFor(s, 'op-alwaha')).toEqual({ operatorMaxUSD: 1_000_000, jmcMaxUSD: 3_000_000 });
    expect(tenderApprovalTier(s, s.tenders[0]!)).toBe('MDOC');
  });

  it('loads a STRUCTURALLY BROKEN stored ladder exactly as written, and the engine fails closed on it', () => {
    localStorage.setItem('masaar-operator-v13', JSON.stringify({
      ...v12Blob(),
      // a string ceiling is corrupt CONFIGURATION, not an absent one — repairing it from the
      // default here would clear this company's requests at the lowest gate on a ladder nobody
      // approved, which is the exact failure the fail-closed reading exists to prevent
      operatorTiers: { 'op-alwaha': { operatorMaxUSD: 'nine', jmcMaxUSD: 3_000_000 } },
    }));
    const s = load();
    expect(Number.isNaN(s.operatorTiers['op-alwaha']!.operatorMaxUSD)).toBe(true);
    expect(s.operatorTiers['op-alwaha']!.jmcMaxUSD).toBe(3_000_000);
    // NOT silently completed from the seed, and not read at the lowest gate: MDOC, the highest
    expect(s.operatorTiers['op-alwaha']).not.toEqual(SEED_APPROVAL_TIERS);
    expect(tenderApprovalTier(s, s.tenders[0]!)).toBe('MDOC');
  });

  it('normalizes only the SHAPE of the map — a non-object map and non-ladder entries name nothing', () => {
    localStorage.setItem('masaar-operator-v13', JSON.stringify({ ...v12Blob(), operatorTiers: 'nope' }));
    expect(load().operatorTiers).toEqual({});
    localStorage.clear();
    localStorage.setItem('masaar-operator-v13', JSON.stringify({ ...v12Blob(), operatorTiers: { 'op-alwaha': 7 } }));
    expect(load().operatorTiers).toEqual({});
  });

  it('prefers a live v13 blob over a stale v12 one', () => {
    localStorage.setItem('masaar-operator-v12', JSON.stringify(v12Blob()));
    localStorage.setItem('masaar-operator-v13', JSON.stringify({ ...v12Blob(), seq: 4321 }));
    expect(load().seq).toBe(4321);
  });

  it('composes the whole chain: a v9 blob migrates its roles AND arrives with the new field normalized', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([
      { id: 'u1', azureOid: 'oid-1', name: 'أ', email: 'a@x.iq', role: 'ROC_ADMIN', twoFa: true, disabled: false },
    ])));
    const s = load();
    expect(s.users[0]!.role).toBe('MDOC_ADMIN'); // v10's rename still applied
    expect(s.operatorTiers).toEqual({});          // v13's field normalized on the way through
    expect(s.tenders.map((t) => t.id)).toEqual(['t9']);
  });
});

/** A v9 blob: the CURRENT universe, written under the retired role vocabulary. */
const v9Blob = (users: object[]) => ({
  tenders: [tender('t9', 'AH-DRL', 'op-alwaha', 4_200_000, { fieldId: 'f-ahdab' })],
  contracts: [], vendors: [], users, seq: 210,
  operators: [{ id: 'op-alwaha', name: 'شركة نفط الواحة الصينية' }],
  fields: [{ id: 'f-ahdab', name: 'الأحدب', code: 'AHDAB', operatorId: 'op-alwaha' }],
  serviceContracts: [{ id: 'sc-ahdab', code: 'SC-AHDAB', fieldId: 'f-ahdab', financialAuthorityUSD: 5_000_000, signedOn: '2024-01-01', expiresOn: '2031-01-31' }],
  audit: [{ ts: '2026-08-01T10:00:00Z', action: 'SET_USER_ROLE', target: 'sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION' }],
  holidays: [{ date: '2026-03-01' }], approvalTiers: { operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 },
});

const acct = (id: string, role: string) => ({ id, azureOid: `oid-${id}`, name: id, email: `${id}@mdoc.iq`, role, twoFa: true, disabled: false });

describe('masaar-operator v9 → v10 migration (the role vocabulary becomes MDOC)', () => {
  it('renames the live authorization fact — an account keeps every capability it held', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN'), acct('u5', 'EVALUATION')])));
    const s = load();

    expect(s.users.map((u) => u.role)).toEqual(['MDOC_ADMIN', 'EVALUATION']);
    // identity is untouched: the same accounts, not replacements
    expect(s.users.map((u) => u.id)).toEqual(['u3', 'u5']);
  });

  it('keeps the universe whole — this is a rename, not a reseed', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN')])));
    const s = load();

    expect(s.tenders.map((t) => t.id)).toEqual(['t9']); // the user's own tender, not the seed's
    expect(s.seq).toBe(210);
    expect(s.operators).toHaveLength(1);
    expect(s.holidays).toEqual([{ date: '2026-03-01' }]);
    expect(s.approvalTiers).toEqual({ operatorMaxUSD: 3_000_000, jmcMaxUSD: 9_000_000 }); // an EDITED ladder survives
  });

  it('never rewrites history: the pre-rename audit row survives verbatim, and the rename is appended', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u3', 'ROC_ADMIN')])));
    const s = load();

    // 8.1-e: the row said ROC_ADMIN truthfully on the day it was written — it stays that way
    expect(s.audit[0]!.target).toBe('sara.jubouri@roc.iq: ROC_ADMIN→EVALUATION');
    expect(s.audit).toHaveLength(2);
    expect(s.audit[1]!.action).toBe('ROLE_RENAME_V10');
    expect(s.audit[1]!.target).toBe('MDOC_ADMIN');
    expect(s.audit[1]!.by).toBeUndefined(); // a startup migration, not an Actor
  });

  it('records nothing when nothing was renamed — a row for a change that never happened is a fabrication', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u5', 'EVALUATION')])));
    expect(load().audit).toHaveLength(1);
  });

  it('leaves an unrecognizable role alone rather than guessing one', () => {
    localStorage.setItem('masaar-operator-v9', JSON.stringify(v9Blob([acct('u9', 'COMMITTEE_CHAIR')])));
    const s = load();
    expect(s.users[0]!.role).toBe('COMMITTEE_CHAIR');
    expect(s.audit).toHaveLength(1); // nothing renamed → nothing recorded
  });
});

/**
 * The session key moves v2 → v3 for the same rename. Unlike v1 → v2 (a shape change that made
 * old blobs unusable) this one is migrated, not discarded: signing a working session out over a
 * spelling change is a worse failure than carrying it forward.
 */
describe('masaar-session v2 → v3 migration', () => {
  afterEach(() => clearSession());

  it('carries a pre-rename session forward with the retired role resolved', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'د. سارة الجبوري', role: 'ROC_ADMIN', oid: 'oid-roc-01' }));
    const s = loadSession();

    expect(s).toEqual({ name: 'د. سارة الجبوري', role: 'MDOC_ADMIN', oid: 'oid-roc-01' });
    // re-homed under v3 and the old key retired, so the migration runs once
    expect(JSON.parse(localStorage.getItem('masaar-session-v3')!).role).toBe('MDOC_ADMIN');
    expect(localStorage.getItem('masaar-session-v2')).toBeNull();
  });

  it('keeps the operator scope across the migration — a scoped session must not widen', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'م. أحمد', role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha' }));
    expect(loadSession()!.companyId).toBe('op-alwaha');
  });

  it('refuses a session whose role names nothing — an unplaceable role must not authorize', () => {
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'x', role: 'COMMITTEE_CHAIR', oid: 'oid-x' }));
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem('masaar-session-v2')).toBeNull(); // and it is not left to retry forever
  });

  it('prefers a live v3 session over a stale v2 one', () => {
    saveSession({ name: 'current', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
    localStorage.setItem('masaar-session-v2', JSON.stringify({ name: 'stale', role: 'ROC_ADMIN', oid: 'oid-roc-01' }));
    expect(loadSession()!.name).toBe('current');
  });
});
