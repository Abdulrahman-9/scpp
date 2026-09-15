// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  bidClosingAt, calendarOf, defaultAnnouncementFor, emptyState, reducer, seedState, singleBidStatus,
  type Actor, type AnnouncementState, type State, type Tender,
} from '../src/store';
import { canAddBidders, selectableVendors, vendorBidEligibility } from '../src/operator/BidderAddDialog';

const ann = (publishedOn: string | undefined, periodDays: number): AnnouncementState => ({
  ...defaultAnnouncementFor(7),
  periodDays,
  ...(publishedOn ? { publishedOn } : {}),
});

/**
 * Batch 3 / Agent C — the bidder-entry quick-add.
 * Exercises the exact ADD_BIDDER payload the dialog dispatches (bare name),
 * plus the pure governance helpers the dialog gates on: 10.4 eligibility /
 * 14.3 ban and the 12.4.2 "slate is still open" affordance window.
 */

const fresh = (): State => seedState();
const TODAY = '2026-07-23';
const MDOC: Actor = { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' };

describe('ADD_BIDDER — the payload the quick-add dialog sends', () => {
  it('registers a bare-name bidder on the tender (docs/bond seeded true, no price yet)', () => {
    const s = reducer(fresh(), { type: 'ADD_BIDDER', tenderId: 't2', name: 'شركة الوركاء للمقاولات' });
    const t2 = s.tenders.find((t) => t.id === 't2')!;
    expect(t2.bidders).toHaveLength(1);
    const b = t2.bidders[0]!;
    expect(b.name).toBe('شركة الوركاء للمقاولات');
    expect(b.docsOk).toBe(true);
    expect(b.bondOk).toBe(true);
    expect(b.priceUSD).toBeUndefined(); // adding a bidder never touches prices (12.4.2)
    expect(b.technicalResult).toBeUndefined();
  });

  it('unblocks the evaluation dead-end: an empty-bidder tender gains a classifiable bidder', () => {
    expect(fresh().tenders.find((t) => t.id === 't2')!.bidders).toHaveLength(0); // CREATE_TENDER seeds []
    const s = reducer(fresh(), { type: 'ADD_BIDDER', tenderId: 't2', name: 'X' });
    expect(s.tenders.find((t) => t.id === 't2')!.bidders).toHaveLength(1);
  });

  it('appends to an existing slate, leaving the prior bidders and their order intact', () => {
    // t1's bidding has closed, so an on-time submission date is required to admit a new bidder
    const s0 = fresh();
    const onTime = bidClosingAt(s0.tenders.find((t) => t.id === 't1')!.announcement, calendarOf(s0))!;
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't1', name: 'مقدّم إضافي', submittedAt: onTime });
    const t1 = s.tenders.find((t) => t.id === 't1')!;
    expect(t1.bidders).toHaveLength(5);
    expect(t1.bidders.map((b) => b.name)).toContain('مقدّم إضافي');
    expect(t1.bidders[0]!.name).toBe('شركة الحفر العراقية'); // original first row untouched
  });
});

describe('bidClosingAt — derived bid-closing DATE (§11.3.4-e), day-granular, never stored (C2)', () => {
  const emptyCal = calendarOf(emptyState());

  it('is null before the announcement is published (no closing exists yet)', () => {
    expect(bidClosingAt(ann(undefined, 21), emptyCal)).toBeNull();
  });

  it('is the last open day: publication + (periodDays − 1), when that lands on a working day', () => {
    // period is counted from day 1 (publication): 2026-03-01 (Sun) + 2 = 2026-03-03 (Tue) → no roll
    expect(bidClosingAt(ann('2026-03-01', 3), emptyCal)).toBe('2026-03-03');
  });

  it('rolls a weekend closing forward to the next working day', () => {
    // 2026-03-01 (Sun) + (6 − 1) = 2026-03-06 (Fri, weekend) → rolls to Sun 2026-03-08
    expect(bidClosingAt(ann('2026-03-01', 6), emptyCal)).toBe('2026-03-08');
  });

  it('rolls forward when a mid-window holiday makes the closing day non-working', () => {
    // base closing is Tue 2026-03-03; marking it a holiday rolls to Wed 2026-03-04
    const cal = calendarOf({ ...emptyState(), holidays: [{ date: '2026-03-03' }] });
    expect(bidClosingAt(ann('2026-03-01', 3), cal)).toBe('2026-03-04');
  });
});

describe('singleBidStatus — §15.3 lone-bid acceptability (derived)', () => {
  const withBidders = (n: number, periodDays: number): Tender =>
    ({ bidders: Array.from({ length: n }, (_, i) => ({ id: `b${i}` })), announcement: ann('2026-05-01', periodDays) }) as Tender;

  it('flags a single bid advertised under 21 days as not acceptable', () => {
    expect(singleBidStatus(withBidders(1, 14))).toEqual({ single: true, ok: false });
  });

  it('accepts a single bid advertised for 21 days or more', () => {
    expect(singleBidStatus(withBidders(1, 21))).toEqual({ single: true, ok: true });
  });

  it('is vacuously ok when there is more than one bid', () => {
    expect(singleBidStatus(withBidders(3, 14))).toEqual({ single: false, ok: true });
  });
});

describe('ADD_BIDDER late-bid gate (10.6.1) — automatic, not opt-in', () => {
  const s0 = seedState();
  const t1 = s0.tenders.find((t) => t.id === 't1')!; // public, published → a closing that has passed
  const closing = bidClosingAt(t1.announcement, calendarOf(s0))!;

  // a minimal single tender in a fresh state, for the by-method (no public closing) cases
  const mkT = (announcement: AnnouncementState): Tender =>
    ({ id: 'tx', code: 'TX-0001', title: { ar: '', en: '' }, budgetCode: 'X', estimatedValueUSD: 1,
       methodId: announcement.mode === 'public' ? 7 : 6, createdOn: '2026-01-01', stages: [], announcement, evaluationStep: 0, bidders: [] }) as Tender;
  const stateWith = (t: Tender): State => ({ ...emptyState(), tenders: [t] });

  it('a limited tender has no public closing — a bare add is accepted (10.6.1 has no jurisdiction)', () => {
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't2', name: 'شركة بلا إعلان' });
    expect(s.tenders.find((t) => t.id === 't2')!.bidders).toHaveLength(1);
  });

  it('records submittedAt for provenance on a no-public-closing (limited) tender, with no gate', () => {
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't2', name: 'شركة موثّقة', submittedAt: '2026-06-01' });
    expect(s.tenders.find((t) => t.id === 't2')!.bidders.at(-1)!.submittedAt).toBe('2026-06-01');
  });

  it('refuses a bare add once bidding has CLOSED — a submission date becomes mandatory', () => {
    const before = t1.bidders.length;
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't1', name: 'مقدّم بلا وقت' });
    expect(s.tenders.find((t) => t.id === 't1')!.bidders).toHaveLength(before); // refused, not admitted
  });

  it('admits a bidder submitted on/before the closing date', () => {
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't1', name: 'مقدّم في الوقت', submittedAt: closing });
    const b = s.tenders.find((t) => t.id === 't1')!.bidders.at(-1)!;
    expect(b.name).toBe('مقدّم في الوقت');
    expect(b.submittedAt).toBe(closing);
  });

  it('refuses a bidder submitted after the closing date (state unchanged)', () => {
    const before = t1.bidders.length;
    const s = reducer(s0, { type: 'ADD_BIDDER', tenderId: 't1', name: 'مقدّم متأخر', submittedAt: '2027-01-01' });
    expect(s.tenders.find((t) => t.id === 't1')!.bidders).toHaveLength(before);
  });

  it('fails closed: a timestamped submission on an unpublished PUBLIC tender is refused', () => {
    const pub = stateWith(mkT(ann(undefined, 21))); // public, not yet published → no closing to validate against
    const s = reducer(pub, { type: 'ADD_BIDDER', tenderId: 'tx', name: 'مقدّم مبكّر', submittedAt: '2026-06-01' });
    expect(s.tenders[0]!.bidders).toHaveLength(0);
  });
});

describe('vendorBidEligibility — 10.4 eligibility + 14.3 ban, mirrors tenders.service.addBidder (pure)', () => {
  it('passes a clean vendor', () => {
    expect(vendorBidEligibility({}, TODAY).selectable).toBe(true);
  });

  it('blocks a suspended vendor under 10.4', () => {
    const r = vendorBidEligibility({ suspended: true }, TODAY);
    expect(r.selectable).toBe(false);
    expect(r.blocks).toEqual([{ code: 'suspended', clause: '10.4' }]);
  });

  it('tags blacklisted and in-dispute to 10.4', () => {
    expect(vendorBidEligibility({ blacklisted: true }, TODAY).blocks[0]).toEqual({ code: 'blacklisted', clause: '10.4' });
    expect(vendorBidEligibility({ inDispute: true }, TODAY).blocks[0]).toEqual({ code: 'in-dispute', clause: '10.4' });
  });

  it('blocks an active 14.3 ban but clears once it has lapsed', () => {
    const banned = vendorBidEligibility({ banUntil: '2026-11-01' }, TODAY);
    expect(banned.selectable).toBe(false);
    expect(banned.blocks).toContainEqual({ code: 'banned', clause: '14.3' });
    expect(vendorBidEligibility({ banUntil: '2026-07-01' }, TODAY).selectable).toBe(true); // ban lapsed
  });
});

describe('selectableVendors — the registry subset a bid may be entered for', () => {
  it('excludes the seed’s suspended + banned vendor (v4), keeps the eligible vendors incl. state companies', () => {
    const ids = selectableVendors(fresh().vendors, TODAY).map((v) => v.id);
    // the three private vendors plus the five state companies (C8.4 — they compete like everyone)
    expect(ids).toEqual(['v1', 'v2', 'v3', 'v-idc', 'v-scop', 'v-heesco', 'v-oec', 'v-prdc']);
    expect(ids).not.toContain('v4'); // دجلة — suspended (10.4) + banned to 2026-11-01 (14.3)
  });
});

describe('canAddBidders — the honest affordance window (12.4.2)', () => {
  it('allows adding on an active tender before the commercial envelopes open', () => {
    const s = fresh();
    expect(canAddBidders(s.tenders.find((t) => t.id === 't2')!).ok).toBe(true); // step 0
    expect(canAddBidders(s.tenders.find((t) => t.id === 't1')!).ok).toBe(true); // step 1 — technical analysis
  });

  it('closes the slate once the commercial envelopes are open (evaluationStep ≥ 2)', () => {
    const t3 = fresh().tenders.find((t) => t.id === 't3')!; // step 3 — commercial analysis
    expect(canAddBidders(t3)).toEqual({ ok: false, reason: 'commercial' });
  });

  it('closes on a ratified award and on a suspended tender', () => {
    const ratified = reducer(fresh(), { type: 'RATIFY', tenderId: 't3', by: MDOC });
    expect(canAddBidders(ratified.tenders.find((t) => t.id === 't3')!)).toEqual({ ok: false, reason: 'closed' });

    const REASON = 'documented governance suspension for audit compliance';
    const suspended = reducer(fresh(), { type: 'SUSPEND_TENDER', tenderId: 't1', reason: REASON, by: MDOC });
    expect(canAddBidders(suspended.tenders.find((t) => t.id === 't1')!)).toEqual({ ok: false, reason: 'inactive' });
  });
});
