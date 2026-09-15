// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  activeTendersOfField, fieldArchivable, liveFields, reducer, seedState, tenderIsActive,
  type Actor, type State, type Tender,
} from '../src/store';
import { selectableVendors, vendorBidEligibility } from '../src/operator/BidderAddDialog';

/**
 * Client wave 1 · phase 2 — the ARCHIVE MODEL (decision ق7: «أرشفة», never deletion).
 *
 * Two registries, two different rules, and the difference is the whole point:
 *
 *  · a FIELD may not be archived while a tender is in flight on it — hiding it would strand
 *    live procurement behind an invisible record, so the guard refuses and NAMES the count;
 *  · an ENTITY archives whatever its history — the history is immutable and stays readable on
 *    its file, so archiving only withdraws it from the lists that offer FUTURE participation.
 *
 * Every one of these actions is a governed write: a justification of at least 20 characters
 * (govReasonValid, mirroring the server's @Length(20,2000)) attributed to an Actor, self-audited
 * applied/refused exactly like its CREATE_FIELD / SET_CONTRACT_FA siblings.
 */

const SUPER: Actor = { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' };
const REASON = 'انتهى عقد خدمة الحقل ولم تعد الشركة تشغّله — سحب موثّق بكتاب 2026/311';
const REASON_2 = 'أُعيد تشغيل الحقل بموجب ملحق عقد الخدمة الجديد — كتاب 2026/402';
const SHORT = 'قصير جدًا';

/** A field with no tenders at all — the seed has three of them; QARNAYN is one. */
const IDLE_FIELD = 'f-qarnayn';
/** AHDAB carries t1, which is mid-evaluation — the field the guard must refuse. */
const BUSY_FIELD = 'f-ahdab';

const fresh = (): State => seedState();
const fieldOf = (s: State, id: string) => s.fields.find((f) => f.id === id)!;
const vendorOf = (s: State, id: string) => s.vendors.find((v) => v.id === id)!;
const lastAudit = (s: State) => s.audit[s.audit.length - 1]!;

describe('tenderIsActive — the honest in-flight predicate the archive gate reads', () => {
  const t = (extra: Partial<Tender>): Tender => ({
    ...fresh().tenders.find((x) => x.id === 't1')!, ...extra,
  });

  it('counts a tender with an open stage as in flight', () => {
    expect(tenderIsActive(t({}))).toBe(true);
  });

  it('does NOT count a documented cancellation — a cancelled request ends', () => {
    expect(tenderIsActive(t({ lifecycle: { status: 'cancelled', reason: REASON, on: '2026-08-01', by: SUPER } }))).toBe(false);
  });

  it('does NOT count a tender whose every stage is closed — signing was the last one', () => {
    expect(tenderIsActive(t({ stages: t({}).stages.map((s) => ({ ...s, actualTo: '2026-07-01' })) }))).toBe(false);
  });

  it('DOES count a suspended tender — RESUME_TENDER exists, so a pause is not an ending', () => {
    expect(tenderIsActive(t({ lifecycle: { status: 'suspended', reason: REASON, on: '2026-08-01', by: SUPER } }))).toBe(true);
  });

  it('DOES count a ratified tender whose sign stage is still open — the award is not the delivery', () => {
    expect(tenderIsActive(t({ ratification: { status: 'ratified', by: SUPER, on: '2026-08-01' } }))).toBe(true);
  });
});

describe('fieldArchivable — the gate, and the count it names to the user', () => {
  it('clears a field with no tenders', () => {
    expect(fieldArchivable(fresh(), IDLE_FIELD)).toEqual({ ok: true, activeTenders: 0 });
  });

  it('refuses a field with an in-flight tender and reports how many', () => {
    expect(activeTendersOfField(fresh(), BUSY_FIELD).map((x) => x.code)).toEqual(['AH-DRL-0212']);
    expect(fieldArchivable(fresh(), BUSY_FIELD)).toEqual({ ok: false, activeTenders: 1 });
  });

  it('clears the same field once its only tender is cancelled — the block is live work, not history', () => {
    const s = reducer(fresh(), { type: 'CANCEL_TENDER', tenderId: 't1', reason: REASON, by: SUPER });
    expect(fieldArchivable(s, BUSY_FIELD)).toEqual({ ok: true, activeTenders: 0 });
  });
});

describe('ARCHIVE_FIELD / RESTORE_FIELD — ق7 round trip, self-audited', () => {
  it('archives an idle field, flags it, and appends a documented event', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const f = fieldOf(s, IDLE_FIELD);
    expect(f.archived).toBe(true);
    expect(f.events).toHaveLength(1);
    expect(f.events![0]!.kind).toBe('archive');
    expect(f.events![0]!.reason).toBe(REASON);
  });

  it('records the act with its actor and outcome (8.1-e), keyed on the field CODE', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const row = lastAudit(s);
    expect(row).toMatchObject({ action: 'ARCHIVE_FIELD', target: 'QARNAYN', outcome: 'applied' });
    expect(row.by).toEqual(SUPER);
  });

  it('DELETES NOTHING: the field, its contract and every record around it survive archiving', () => {
    const before = fresh();
    const s = reducer(before, { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    expect(s.fields).toHaveLength(before.fields.length);
    expect(s.serviceContracts.map((c) => c.fieldId)).toContain(IDLE_FIELD);
    expect(s.tenders).toHaveLength(before.tenders.length);
  });

  it('refuses to archive a field with an in-flight tender, and AUDITS the refusal', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: BUSY_FIELD, reason: REASON, by: SUPER });
    expect(fieldOf(s, BUSY_FIELD).archived).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ action: 'ARCHIVE_FIELD', outcome: 'refused', reasonCode: 'active-tenders' });
  });

  it('refuses a justification under 20 characters — the guard runs before anything else', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: SHORT, by: SUPER });
    expect(fieldOf(s, IDLE_FIELD).archived).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ outcome: 'refused', reasonCode: 'reason-invalid' });
  });

  it('refuses a RESTORE under 20 characters too — the guard is on the act, not on the direction', () => {
    const archived = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const s = reducer(archived, { type: 'RESTORE_FIELD', fieldId: IDLE_FIELD, reason: SHORT, by: SUPER });
    expect(fieldOf(s, IDLE_FIELD).archived).toBe(true);                    // still withdrawn
    expect(fieldOf(s, IDLE_FIELD).events).toHaveLength(1);                 // no restore event invented
    expect(lastAudit(s)).toMatchObject({ action: 'RESTORE_FIELD', target: 'QARNAYN', outcome: 'refused', reasonCode: 'reason-invalid' });
    expect(s.audit).toHaveLength(archived.audit.length + 1);               // exactly one row for one attempt
  });

  it('restores an archived field, and the trail keeps BOTH acts newest-first', () => {
    const archived = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const s = reducer(archived, { type: 'RESTORE_FIELD', fieldId: IDLE_FIELD, reason: REASON_2, by: SUPER });
    const f = fieldOf(s, IDLE_FIELD);
    expect(f.archived).toBeUndefined();
    expect(f.events!.map((e) => e.kind)).toEqual(['restore', 'archive']);
    expect(lastAudit(s)).toMatchObject({ action: 'RESTORE_FIELD', outcome: 'applied' });
  });

  it('is a silent no-op on a field that is already in the target state — no event, no row', () => {
    const archived = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const again = reducer(archived, { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON_2, by: SUPER });
    expect(again).toBe(archived);
    const restoreLive = reducer(fresh(), { type: 'RESTORE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    expect(restoreLive.audit).toHaveLength(0);
  });

  it('leaves an unknown field alone rather than inventing a refusal row', () => {
    const s = fresh();
    expect(reducer(s, { type: 'ARCHIVE_FIELD', fieldId: 'f-nope', reason: REASON, by: SUPER })).toBe(s);
  });
});

describe('liveFields — what a picker that raises NEW work is allowed to offer', () => {
  it('drops archived fields and keeps every other one', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
    const live = liveFields(s.fields);
    expect(live).toHaveLength(s.fields.length - 1);
    expect(live.some((f) => f.id === IDLE_FIELD)).toBe(false);
    expect(live.some((f) => f.id === BUSY_FIELD)).toBe(true);
  });
});

/**
 * `liveFields` filters the RequestWizard's picker, but a picker is a courtesy. The law is the
 * store: a withdrawn field may not receive new procurement however the action arrives.
 */
describe('CREATE_TENDER — a withdrawn field cannot receive new work (ق7 as store law)', () => {
  const archived = () => reducer(fresh(), { type: 'ARCHIVE_FIELD', fieldId: IDLE_FIELD, reason: REASON, by: SUPER });
  const request = { type: 'CREATE_TENDER', operatorId: 'op-qarnayn', fieldId: IDLE_FIELD, title: { ar: 'حفر آبار', en: 'Well drilling' }, budgetCode: 'QR-DRL-9', estimatedValueUSD: 1_200_000, methodId: 7 } as const;

  it('accepts the request while the field is live — the guard is the archive flag, nothing else', () => {
    const s = reducer(fresh(), request);
    expect(s.tenders).toHaveLength(fresh().tenders.length + 1);
    expect(s.tenders[0]!.fieldId).toBe(IDLE_FIELD);
  });

  it('refuses it once the field is archived, and creates no tender', () => {
    const before = archived();
    const s = reducer(before, request);
    expect(s.tenders).toHaveLength(before.tenders.length);
    expect(s.tenders.some((t) => t.budgetCode === 'QR-DRL-9')).toBe(false);
    expect(s.seq).toBe(before.seq); // no code was consumed either
  });

  it('refuses by IDENTITY, so the audit wrapper appends no row for an act that never happened', () => {
    const before = archived();
    expect(reducer(before, request)).toBe(before);
    expect(reducer(before, request).audit).toHaveLength(before.audit.length);
  });

  it('accepts it again the moment the field is restored — the withdrawal was never a deletion', () => {
    const restored = reducer(archived(), { type: 'RESTORE_FIELD', fieldId: IDLE_FIELD, reason: REASON_2, by: SUPER });
    expect(reducer(restored, request).tenders).toHaveLength(restored.tenders.length + 1);
  });
});

describe('RENAME_FIELD — request 9 «إمكانية التعديل لاحقاً»', () => {
  const NEW_NAME = 'حقل القرنين النفطي';
  const RENAME_REASON = 'تصحيح التسمية بحسب كتاب دائرة العقود والتراخيص رقم 2026/77 المرفق';

  it('renames both display names and leaves the code and the owning company untouched', () => {
    const before = fieldOf(fresh(), IDLE_FIELD);
    const s = reducer(fresh(), { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: NEW_NAME, nameEn: 'Qarnayn Oil Field', reason: RENAME_REASON, by: SUPER });
    const f = fieldOf(s, IDLE_FIELD);
    expect(f.name).toBe(NEW_NAME);
    expect(f.nameEn).toBe('Qarnayn Oil Field');
    expect(f.code).toBe(before.code);
    expect(f.operatorId).toBe(before.operatorId);
  });

  it('records the before→after on the trail and the act in the audit log', () => {
    const s = reducer(fresh(), { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: NEW_NAME, reason: RENAME_REASON, by: SUPER });
    expect(fieldOf(s, IDLE_FIELD).events![0]).toMatchObject({ kind: 'rename', detail: `رقعة القرنين→${NEW_NAME}` });
    expect(lastAudit(s)).toMatchObject({ action: 'RENAME_FIELD', target: 'QARNAYN', outcome: 'applied' });
  });

  it('refuses a short justification and an empty name, each with its own reason code', () => {
    const short = reducer(fresh(), { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: NEW_NAME, reason: SHORT, by: SUPER });
    expect(fieldOf(short, IDLE_FIELD).name).toBe('رقعة القرنين');
    expect(lastAudit(short)).toMatchObject({ outcome: 'refused', reasonCode: 'reason-invalid' });

    const blank = reducer(fresh(), { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: '   ', reason: RENAME_REASON, by: SUPER });
    expect(lastAudit(blank)).toMatchObject({ outcome: 'refused', reasonCode: 'name-required' });
  });

  it('is a silent no-op when nothing actually changes — a row for a non-change is a fabrication', () => {
    const s = fresh();
    const same = reducer(s, { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: 'رقعة القرنين', nameEn: 'Qarnayn Block', reason: RENAME_REASON, by: SUPER });
    expect(same).toBe(s);
  });

  it('treats an omitted English name as CLEARING it — the dialog sends both, so absence is intent', () => {
    const s = reducer(fresh(), { type: 'RENAME_FIELD', fieldId: IDLE_FIELD, name: 'رقعة القرنين', reason: RENAME_REASON, by: SUPER });
    expect(fieldOf(s, IDLE_FIELD).nameEn).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ action: 'RENAME_FIELD', outcome: 'applied' });
  });
});

describe('ARCHIVE_VENDOR / RESTORE_VENDOR — history is immutable, so there is no history gate', () => {
  const V_REASON = 'توقّفت الشركة عن النشاط في العراق ولم تعد تُدعى للمناقصات — قرار 2026/58';

  it('archives an entity that HAS bid and HAS a contract — the field rule does not apply here', () => {
    const before = fresh();
    // v1 both bid on t1 and holds contract c1 — the richest history in the seed
    expect(before.contracts.some((c) => c.vendorId === 'v1')).toBe(true);
    const s = reducer(before, { type: 'ARCHIVE_VENDOR', vendorId: 'v1', reason: V_REASON, by: SUPER });
    expect(vendorOf(s, 'v1').archived).toBe(true);
    // …and every trace of that history is exactly where it was
    expect(s.contracts.filter((c) => c.vendorId === 'v1')).toHaveLength(1);
    expect(s.tenders.find((t) => t.id === 't1')!.bidders.map((b) => b.name)).toContain('شركة الحفر العراقية');
  });

  it('appends the documented event and self-audits with the actor, keyed on the entity name', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v1', reason: V_REASON, by: SUPER });
    expect(vendorOf(s, 'v1').events![0]).toMatchObject({ kind: 'archive', reason: V_REASON });
    expect(lastAudit(s)).toMatchObject({ action: 'ARCHIVE_VENDOR', target: 'شركة الحفر العراقية', outcome: 'applied' });
  });

  it('restores, and the trail reads restore → archive newest-first', () => {
    const archived = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v2', reason: V_REASON, by: SUPER });
    const s = reducer(archived, { type: 'RESTORE_VENDOR', vendorId: 'v2', reason: REASON_2, by: SUPER });
    expect(vendorOf(s, 'v2').archived).toBeUndefined();
    expect(vendorOf(s, 'v2').events!.map((e) => e.kind)).toEqual(['restore', 'archive']);
  });

  it('refuses a short justification', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v1', reason: SHORT, by: SUPER });
    expect(vendorOf(s, 'v1').archived).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ outcome: 'refused', reasonCode: 'reason-invalid' });
  });

  it('refuses a short justification on the RESTORE side as well, and leaves the entity withdrawn', () => {
    const archived = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v2', reason: V_REASON, by: SUPER });
    const s = reducer(archived, { type: 'RESTORE_VENDOR', vendorId: 'v2', reason: SHORT, by: SUPER });
    expect(vendorOf(s, 'v2').archived).toBe(true);
    expect(vendorOf(s, 'v2').events).toHaveLength(1);                      // no restore event invented
    expect(lastAudit(s)).toMatchObject({ action: 'RESTORE_VENDOR', target: 'Basra Energy Services', outcome: 'refused', reasonCode: 'reason-invalid' });
    expect(s.audit).toHaveLength(archived.audit.length + 1);
  });

  it('does NOT touch the existing suspension/ban trail it inherits', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v4', reason: V_REASON, by: SUPER });
    const v4 = vendorOf(s, 'v4');
    expect(v4.suspended).toBe(true);       // 10.4 flag intact
    expect(v4.banUntil).toBe('2026-11-01'); // 14.3 ban intact
    expect(v4.archived).toBe(true);
  });
});

describe('vendorBidEligibility — archived is the fourth block, and the only one that is not a sanction', () => {
  const TODAY = '2026-07-23';

  it('blocks an archived entity under `registry`, never under an SCPP article', () => {
    const r = vendorBidEligibility({ archived: true }, TODAY);
    expect(r.selectable).toBe(false);
    expect(r.blocks).toEqual([{ code: 'archived', clause: 'registry' }]);
  });

  it('stacks with the real sanctions rather than replacing them', () => {
    const r = vendorBidEligibility({ archived: true, suspended: true, banUntil: '2026-11-01' }, TODAY);
    expect(r.blocks).toEqual([
      { code: 'suspended', clause: '10.4' },
      { code: 'banned', clause: '14.3' },
      { code: 'archived', clause: 'registry' },
    ]);
  });

  it('clears the moment the entity is restored — no clause survives an administrative withdrawal', () => {
    expect(vendorBidEligibility({ archived: false }, TODAY).selectable).toBe(true);
    expect(vendorBidEligibility({}, TODAY).selectable).toBe(true);
  });
});

describe('selectableVendors — an archived entity drops out of the bidder picker', () => {
  const TODAY = '2026-07-23';

  it('removes exactly the archived entity and keeps the rest of the selectable set', () => {
    const s = reducer(fresh(), { type: 'ARCHIVE_VENDOR', vendorId: 'v2', reason: 'انسحبت الجهة من السوق العراقي بقرار موثّق 2026/58', by: SUPER });
    const ids = selectableVendors(s.vendors, TODAY).map((v) => v.id);
    expect(ids).toEqual(['v1', 'v3', 'v-idc', 'v-scop', 'v-heesco', 'v-oec', 'v-prdc']);
    expect(ids).not.toContain('v2');
  });
});

describe('CREATE_VENDOR — request 14, the registry gains an entry point', () => {
  const C_REASON = 'تسجيل جهة جديدة بناءً على طلب التأهيل المقدّم وكتاب الموافقة 2026/91';

  it('registers a named entity with its MoO membership and zeroed, unassessed scores', () => {
    const s = reducer(fresh(), { type: 'CREATE_VENDOR', vendorId: 'v-new', name: 'شركة الرافدين للخدمات', mooListed: true, reason: C_REASON, by: SUPER });
    const v = vendorOf(s, 'v-new');
    expect(v).toMatchObject({ name: 'شركة الرافدين للخدمات', mooListed: true, techScore: 0, financialScore: 0, hseScore: 0 });
    // an administrator cannot mint a state company: the five are seeded law (Article 25 / §9 C8.4)
    expect(v.isStateCompany).toBeUndefined();
    expect(lastAudit(s)).toMatchObject({ action: 'CREATE_VENDOR', target: 'شركة الرافدين للخدمات', outcome: 'applied' });
  });

  it('is immediately selectable as a bidder — a registration with no effect would be a placebo', () => {
    const s = reducer(fresh(), { type: 'CREATE_VENDOR', vendorId: 'v-new', name: 'شركة الرافدين للخدمات', mooListed: false, reason: C_REASON, by: SUPER });
    expect(selectableVendors(s.vendors, '2026-07-23').map((v) => v.id)).toContain('v-new');
  });

  it('refuses a duplicate NAME — participations are matched by name, so a twin is ambiguous', () => {
    const s = reducer(fresh(), { type: 'CREATE_VENDOR', vendorId: 'v-dup', name: 'شركة الحفر العراقية', mooListed: true, reason: C_REASON, by: SUPER });
    expect(s.vendors.filter((v) => v.name === 'شركة الحفر العراقية')).toHaveLength(1);
    expect(lastAudit(s)).toMatchObject({ outcome: 'refused', reasonCode: 'dup-name' });
  });

  it('refuses a duplicate id and a short justification, each with its own reason code', () => {
    const dupId = reducer(fresh(), { type: 'CREATE_VENDOR', vendorId: 'v1', name: 'اسم مختلف تمامًا', mooListed: false, reason: C_REASON, by: SUPER });
    expect(lastAudit(dupId)).toMatchObject({ outcome: 'refused', reasonCode: 'dup-id' });

    const short = reducer(fresh(), { type: 'CREATE_VENDOR', vendorId: 'v-new', name: 'جهة جديدة', mooListed: false, reason: SHORT, by: SUPER });
    expect(short.vendors.some((v) => v.id === 'v-new')).toBe(false);
    expect(lastAudit(short)).toMatchObject({ outcome: 'refused', reasonCode: 'reason-invalid' });
  });
});
