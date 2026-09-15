import { describe, expect, it } from 'vitest';
import { byName, byOid, calendarOf, defaultAnnouncementFor, emptyState, holidaysImpact, reducer, type Actor, type State, type Tender } from '../src/store';
import { deriveTasks, tenderStatus } from '../src/operator/derive';

/**
 * The dynamic working-day calendar (§11.3.4-e). Holidays are data held in the store, not code:
 * calendarOf(state) is the ONE calendar every client-side working-day computation must pass to the
 * engine. A holiday added through the store must shift every deadline exactly as it does on the
 * server (calendar.service). Because a holiday shifts every open deadline and derived closing
 * RETROACTIVELY, the add/remove actions are governance-grade: attributed to an Actor, justified,
 * and self-audited (8.1-e) — exactly like their sibling access actions.
 */

const ADMIN: Actor = { oid: 'oid-super-01', name: 'مدير النظام', role: 'SUPER_ADMIN' };
const REASON = 'عطلة رسمية موثّقة بقرار مجلس الوزراء'; // ≥ 20 chars — passes govReasonValid

// A minimal tender whose only open stage closes on `plannedTo`. currentStage() picks the first
// stage without an actualTo, and tenderStatus/deriveTasks read only that stage's plannedTo.
const mkTender = (plannedTo: string): Tender =>
  ({
    id: 't', code: 'X-PRJ-0001', title: { ar: 'اختبار', en: 'test' }, budgetCode: 'X', estimatedValueUSD: 1,
    methodId: 7, createdOn: '2026-01-01', stages: [{ key: 'cost', plannedTo, uploadedDocs: [] }],
    announcement: defaultAnnouncementFor(7), evaluationStep: 0, bidders: [],
  }) as Tender;

const withTender = (plannedTo: string): State => ({ ...emptyState(), tenders: [mkTender(plannedTo)] });
const addHoliday = (s: State, date: string) => reducer(s, { type: 'ADD_HOLIDAY', date, reason: REASON, by: ADMIN });

describe('calendarOf', () => {
  it('carries Iraq weekend (Fri/Sat) plus the holiday DATES held in state', () => {
    const cal = calendarOf({ ...emptyState(), holidays: [{ date: '2026-03-03', name: 'اختبار' }] });
    expect(cal.weekend).toEqual([5, 6]);
    expect(cal.holidays).toEqual(['2026-03-03']); // WorkingCalendar carries dates only
  });
});

describe('ADD_HOLIDAY / REMOVE_HOLIDAY reducer (governance-grade)', () => {
  it('adds, de-duplicates, and keeps the list sorted', () => {
    let s = addHoliday(emptyState(), '2026-05-01');
    s = addHoliday(s, '2026-01-01');
    s = addHoliday(s, '2026-05-01'); // duplicate → silent no-op
    expect(s.holidays).toEqual([{ date: '2026-01-01' }, { date: '2026-05-01' }]);
  });

  it('accepts a full ISO timestamp but stores the date part only', () => {
    expect(addHoliday(emptyState(), '2026-03-03T00:00:00Z').holidays).toEqual([{ date: '2026-03-03' }]);
  });

  it('stores the display name alongside the date (shown on the screen, kept out of the calendar)', () => {
    const s = reducer(emptyState(), { type: 'ADD_HOLIDAY', date: '2026-03-03', name: 'عيد الفطر', reason: REASON, by: ADMIN });
    expect(s.holidays).toEqual([{ date: '2026-03-03', name: 'عيد الفطر' }]);
    expect(calendarOf(s).holidays).toEqual(['2026-03-03']); // the engine still sees only the date
  });

  it('refuses a malformed date with an attributed, audited refusal (not a silent drop)', () => {
    const s = reducer(emptyState(), { type: 'ADD_HOLIDAY', date: 'not-a-date', reason: REASON, by: ADMIN });
    expect(s.holidays).toEqual([]);
    expect(s.audit.at(-1)).toMatchObject({ action: 'ADD_HOLIDAY', outcome: 'refused', reasonCode: 'date-invalid' });
  });

  it('refuses an under-justified change (reason < 20 chars)', () => {
    const s = reducer(emptyState(), { type: 'ADD_HOLIDAY', date: '2026-03-03', reason: 'قصير', by: ADMIN });
    expect(s.holidays).toEqual([]);
    expect(s.audit.at(-1)).toMatchObject({ action: 'ADD_HOLIDAY', outcome: 'refused', reasonCode: 'reason-invalid' });
  });

  it('removes a holiday, and a no-op remove leaves the state untouched', () => {
    const s0 = addHoliday(emptyState(), '2026-03-03');
    expect(reducer(s0, { type: 'REMOVE_HOLIDAY', date: '2026-03-03', reason: REASON, by: ADMIN }).holidays).toEqual([]);
    expect(reducer(s0, { type: 'REMOVE_HOLIDAY', date: '2026-12-31', reason: REASON, by: ADMIN })).toBe(s0);
  });

  it('records an attributed, append-only audit row for an applied change (8.1-e)', () => {
    const row = addHoliday(emptyState(), '2026-03-03').audit.at(-1)!;
    expect(row).toMatchObject({ action: 'ADD_HOLIDAY', target: '2026-03-03', outcome: 'applied' });
    expect(byName(row.by!)).toBe('مدير النظام');
    expect(byOid(row.by!)).toBe('oid-super-01');
  });
});

describe('a holiday inside the window shifts a live deadline (end-to-end)', () => {
  // 2026-03-01 is a Sunday; 2026-03-04 is the Wednesday of that same work-week. With no holidays
  // the three working days Mon/Tue/Wed sit between them → "progress". Marking Tuesday a holiday
  // leaves only two working days → the tender flips to "risk" and its task due-count drops by one.
  const today = '2026-03-01';
  const plannedTo = '2026-03-04';

  it('is progress with an empty calendar (3 working days out)', () => {
    const s = withTender(plannedTo);
    expect(tenderStatus(s.tenders[0]!, today, calendarOf(s))).toBe('progress');
    expect(deriveTasks(s, today, calendarOf(s))[0]!.dueWd).toBe(3);
  });

  it('flips to risk once a mid-window holiday is added (2 working days out)', () => {
    const s = addHoliday(withTender(plannedTo), '2026-03-03');
    expect(tenderStatus(s.tenders[0]!, today, calendarOf(s))).toBe('risk');
    expect(deriveTasks(s, today, calendarOf(s))[0]!.dueWd).toBe(2);
  });

  it('a holiday that lands on an existing weekend day changes nothing', () => {
    const s = addHoliday(withTender(plannedTo), '2026-03-07'); // Saturday
    expect(tenderStatus(s.tenders[0]!, today, calendarOf(s))).toBe('progress');
    expect(deriveTasks(s, today, calendarOf(s))[0]!.dueWd).toBe(3);
  });
});

describe('holidaysImpact — the retroactive footprint previewed before a holiday change', () => {
  // a published tender whose bid period closes Tue 2026-03-03 (publishedOn + periodDays − 1)
  const pubTender = (): Tender =>
    ({ id: 'tp', code: 'TP-0001', title: { ar: 'x', en: 'x' }, budgetCode: 'X', estimatedValueUSD: 1,
       methodId: 7, createdOn: '2026-01-01', stages: [], evaluationStep: 0, bidders: [],
       announcement: { ...defaultAnnouncementFor(7), periodDays: 3, publishedOn: '2026-03-01' } }) as Tender;
  const st = (): State => ({ ...emptyState(), tenders: [pubTender()] });

  it('lists a published tender whose closing rolls when the date is added', () => {
    expect(holidaysImpact(st(), '2026-03-03', 'add')).toEqual([{ tenderId: 'tp', code: 'TP-0001', before: '2026-03-03', after: '2026-03-04' }]);
  });

  it('is empty for a date outside every closing window', () => {
    expect(holidaysImpact(st(), '2026-03-20', 'add')).toEqual([]);
  });

  it('remove mode pulls the once-extended closing back (the retroactive-late risk)', () => {
    const withHol: State = { ...emptyState(), tenders: [pubTender()], holidays: [{ date: '2026-03-03' }] };
    expect(holidaysImpact(withHol, '2026-03-03', 'remove')).toEqual([{ tenderId: 'tp', code: 'TP-0001', before: '2026-03-04', after: '2026-03-03' }]);
  });
});
