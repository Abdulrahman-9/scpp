import { describe, expect, it } from 'vitest';
import { IRAQ_CALENDAR } from '@masaar/working-days';
import {
  dateRangeInverted, inDateRange, inValueRange, rangeInverted,
} from '../src/registry/filters';
import {
  ARCHIVE_VIEWS, hashParam, isAmountParam, isIsoDateParam, SCOPE_KEYS,
} from '../src/registry/useHashParams';
import {
  buildCsv, formatActiveFilters, reportStamp, type FilterLabels, type ReportColumn, type StampWords,
} from '../src/registry/report';
import {
  contractScheduleRows, scheduleKpis, scheduleStatusOf, tenderScheduleRows,
} from '../src/admin/scheduleDerive';
import {
  bandCounts, capacityBand, contractsWon, primaryScope, tendersBidOn, vendorProfiles,
} from '../src/admin/vendorReport';
import { seedState, type State, type Tender } from '../src/store';

/**
 * Phase 4 — filters, the export stamp, time compliance and the vendor report.
 *
 * These are the pure halves: what a filter ACCEPTS at its boundary, what the stamp SAYS, and what
 * the two new derivations compute. The rendered halves (a filter actually landing rows, a screen
 * actually printing the stamp) live in phase4Screens.test.tsx — a predicate that is right in
 * isolation and wired to the wrong field typechecks perfectly.
 */

const TIERS = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 };

/* ------------------------------------------------------------------ */
/*  filters.ts — the two windows, and their boundaries                 */
/* ------------------------------------------------------------------ */
describe('inValueRange — inclusive at BOTH ends, like the approval ladder it sits beside', () => {
  it('includes a value sitting exactly on either bound', () => {
    expect(inValueRange(5_000_000, '5000000', '10000000')).toBe(true);
    expect(inValueRange(10_000_000, '5000000', '10000000')).toBe(true);
  });

  it('excludes a value outside the window', () => {
    expect(inValueRange(4_999_999, '5000000', '10000000')).toBe(false);
    expect(inValueRange(10_000_001, '5000000', '10000000')).toBe(false);
  });

  it('treats an empty end as UNBOUNDED, never as zero — the defect a bare Number("") would cause', () => {
    // a 0 floor would look like a working filter while excluding nothing…
    expect(inValueRange(1, '', '')).toBe(true);
    // …and a 0 ceiling would exclude the entire registry
    expect(inValueRange(999, '', '')).toBe(true);
    expect(inValueRange(999, '1000', '')).toBe(false);
    expect(inValueRange(999, '', '500')).toBe(false);
  });

  it('ignores an unparseable end rather than answering false to everything', () => {
    expect(inValueRange(100, 'abc', '')).toBe(true);
  });
});

describe('inDateRange — inclusive, on ISO strings that already proved to be real dates', () => {
  it('includes both endpoints', () => {
    expect(inDateRange('2026-04-20', '2026-04-20', '2026-05-25')).toBe(true);
    expect(inDateRange('2026-05-25', '2026-04-20', '2026-05-25')).toBe(true);
  });

  it('excludes a day on either side', () => {
    expect(inDateRange('2026-04-19', '2026-04-20', '2026-05-25')).toBe(false);
    expect(inDateRange('2026-05-26', '2026-04-20', '2026-05-25')).toBe(false);
  });

  it('leaves an open end open', () => {
    expect(inDateRange('1999-01-01', '', '2026-01-01')).toBe(true);
    expect(inDateRange('2099-01-01', '2026-01-01', '')).toBe(true);
  });
});

describe('a crossed range is NAMED, never answered with «no rows match»', () => {
  it('detects an inverted value window and an inverted date window', () => {
    expect(rangeInverted('10000000', '5000000')).toBe(true);
    expect(rangeInverted('5000000', '10000000')).toBe(false);
    expect(dateRangeInverted('2026-05-25', '2026-04-20')).toBe(true);
    expect(dateRangeInverted('2026-04-20', '2026-05-25')).toBe(false);
  });

  it('does not call a half-open window inverted', () => {
    expect(rangeInverted('', '5000000')).toBe(false);
    expect(rangeInverted('5000000', '')).toBe(false);
    expect(dateRangeInverted('', '2026-01-01')).toBe(false);
  });

  it('does not call equal ends inverted — a single-value window is legitimate', () => {
    expect(rangeInverted('5000000', '5000000')).toBe(false);
    expect(dateRangeInverted('2026-04-20', '2026-04-20')).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  the extended whitelist                                             */
/* ------------------------------------------------------------------ */
describe('the seven parameters phase 4 added to the whitelist', () => {
  const p = (s: string) => new URLSearchParams(s);

  it('accepts every §9 work scope and rejects an invented one', () => {
    for (const s of SCOPE_KEYS) expect(hashParam(p(`scope=${s}`), 'scope')).toBe(s);
    expect(hashParam(p('scope=SPACE_MINING'), 'scope')).toBe('');
  });

  it('accepts the three archive views and rejects anything else', () => {
    for (const a of ARCHIVE_VIEWS) expect(hashParam(p(`arch=${a}`), 'arch')).toBe(a);
    expect(hashParam(p('arch=deleted'), 'arch')).toBe('');
  });

  it('accepts a real SCPP method id and refuses one outside the registry of methods', () => {
    expect(hashParam(p('method=1'), 'method')).toBe('1');
    // an id no method carries would filter every row away — the empty screen the whitelist prevents
    expect(hashParam(p('method=99'), 'method')).toBe('');
  });

  it('validates the money ends by SHAPE — a plain, non-negative amount', () => {
    expect(isAmountParam('5000000')).toBe(true);
    expect(isAmountParam('0')).toBe(true);
    expect(isAmountParam('1250.50')).toBe(true);
    expect(isAmountParam('-1')).toBe(false);
    expect(isAmountParam('5,000,000')).toBe(false); // grouping is display, never a URL contract
    expect(isAmountParam('1e9')).toBe(false);
    expect(isAmountParam('abc')).toBe(false);
    expect(hashParam(p('vmin=5000000&vmax=oops'), 'vmin')).toBe('5000000');
    expect(hashParam(p('vmin=5000000&vmax=oops'), 'vmax')).toBe('');
  });

  it('validates the date ends against the CALENDAR, not just the shape', () => {
    expect(isIsoDateParam('2026-04-20')).toBe(true);
    // the shape test alone would accept these — round-tripping through Date is what rejects them
    expect(isIsoDateParam('2026-02-31')).toBe(false);
    expect(isIsoDateParam('2026-13-01')).toBe(false);
    expect(isIsoDateParam('20260420')).toBe(false);
    expect(hashParam(p('from=2026-02-31'), 'from')).toBe('');
    expect(hashParam(p('to=2026-05-25'), 'to')).toBe('2026-05-25');
  });
});

/* ------------------------------------------------------------------ */
/*  the stamp                                                          */
/* ------------------------------------------------------------------ */
const WORDS: StampWords = {
  filters: 'الفلاتر النشطة',
  none: 'بلا فلاتر',
  rows: 'عدد الصفوف',
  generated: 'تاريخ الإصدار',
  scope: 'النطاق',
};

describe('formatActiveFilters — the one reader of a filter set', () => {
  const labels: FilterLabels = {
    op: { label: 'الشركة', value: (v) => (v === 'op-alwaha' ? 'الواحة' : v) },
    status: { label: 'الحالة', value: (v) => (v === 'delayed' ? 'متأخرة' : v) },
    vmin: { label: 'القيمة من' },
  };

  it('prints the dimensions in DECLARATION order, not in URL order', () => {
    const p = new URLSearchParams('status=delayed&op=op-alwaha');
    expect(formatActiveFilters(p, 'ar', labels)).toBe('الشركة: الواحة · الحالة: متأخرة');
  });

  it('returns an empty clause when nothing narrows the registry', () => {
    expect(formatActiveFilters(new URLSearchParams(), 'ar', labels)).toBe('');
  });

  it('skips a parameter with no declared label — a stamp never prints machine keys', () => {
    expect(formatActiveFilters(new URLSearchParams('mystery=7'), 'ar', labels)).toBe('');
  });

  it('groups a bare numeric value through fmtCount, so the Latin-digit law holds centrally', () => {
    expect(formatActiveFilters(new URLSearchParams('vmin=5000000'), 'ar', labels))
      .toBe('القيمة من: 5,000,000');
  });

  it('prints the value ALONE when the label is empty — how a flag reads in Arabic', () => {
    const flag: FilterLabels = { pending: { label: '', value: () => 'بانتظار المصادقة فقط' } };
    expect(formatActiveFilters(new URLSearchParams('pending=1'), 'ar', flag))
      .toBe('بانتظار المصادقة فقط');
  });

  it('treats an empty value as absent rather than as a filter on the empty string', () => {
    expect(formatActiveFilters(new URLSearchParams('op='), 'ar', labels)).toBe('');
  });
});

describe('reportStamp — what was covered, what was removed, how much survived', () => {
  const labels: FilterLabels = { op: { label: 'الشركة', value: () => 'الواحة' } };

  it('states «بلا فلاتر» rather than dropping the clause on an unnarrowed surface', () => {
    expect(reportStamp({
      params: new URLSearchParams(), labels, lang: 'ar', rows: 12, today: '2026-08-20', words: WORDS,
    })).toBe('الفلاتر النشطة: بلا فلاتر · عدد الصفوف: 12 · تاريخ الإصدار: 2026-08-20');
  });

  it('leads with the scope clause when the surface names one', () => {
    expect(reportStamp({
      params: new URLSearchParams('op=op-alwaha'), labels, lang: 'ar',
      rows: 3, today: '2026-08-20', words: WORDS, scope: 'المحفظة كلها',
    })).toBe('النطاق: المحفظة كلها · الفلاتر النشطة: الشركة: الواحة · عدد الصفوف: 3 · تاريخ الإصدار: 2026-08-20');
  });

  it('groups the row count with Latin digits in both languages', () => {
    const en = reportStamp({
      params: new URLSearchParams(), labels, lang: 'en', rows: 1234, today: '2026-08-20',
      words: { ...WORDS, filters: 'Active filters', none: 'No filters', rows: 'Rows', generated: 'Generated' },
    });
    expect(en).toBe('Active filters: No filters · Rows: 1,234 · Generated: 2026-08-20');
  });
});

describe('buildCsv — the stamp rides above the header, and nothing else moved', () => {
  interface Row { name: string }
  const cols: ReportColumn<Row>[] = [{ key: 'name', label: 'name', value: (r) => r.name }];

  it('writes the stamp as ONE quoted cell on the first line, header intact below it', () => {
    const csv = buildCsv(cols, [{ name: 'a' }], 'الفلاتر النشطة: بلا فلاتر · عدد الصفوف: 1');
    expect(csv.split('\n')).toEqual([
      '"الفلاتر النشطة: بلا فلاتر · عدد الصفوف: 1"',
      '"name"',
      '"a"',
    ]);
  });

  it('is unchanged when no stamp is supplied — the batch-1 contract still holds', () => {
    expect(buildCsv(cols, [{ name: 'a' }])).toBe('"name"\n"a"');
  });

  it('escapes a quote inside the stamp like any other cell', () => {
    expect(buildCsv(cols, [], 'a "b"').split('\n')[0]).toBe('"a ""b"""');
  });
});

/* ------------------------------------------------------------------ */
/*  scheduleDerive — client request 10                                 */
/* ------------------------------------------------------------------ */
const CAL = IRAQ_CALENDAR;

/** A tender skeleton whose only interesting property is its stage plan. */
function tenderWith(stages: { key: string; plannedTo?: string; actualTo?: string }[]): Tender {
  return {
    id: 't-x', code: 'X-000', title: { ar: 'س', en: 'x' }, budgetCode: 'B', estimatedValueUSD: 1,
    methodId: 1, createdOn: '2026-01-01', evaluationStep: 0, bidders: [],
    announcement: { mode: 'public', periodDays: 21, newspapers: ['a', 'b', 'c'], lcWebsite: true, rocWebsite: true, inviteeCount: 0, inviteesPreQualified: false },
    stages: stages.map((s) => ({ ...s, uploadedDocs: [] })),
  } as Tender;
}
const withTenders = (tenders: Tender[]): State => ({ ...seedState(), tenders, contracts: [] });

describe('scheduleStatusOf — the verdict, and the one it refuses to give', () => {
  it('reads a positive deviation as late and a negative one as ahead', () => {
    expect(scheduleStatusOf(3, true)).toBe('late');
    expect(scheduleStatusOf(-2, true)).toBe('ahead');
    expect(scheduleStatusOf(0, true)).toBe('onTime');
  });

  it('refuses to judge a stage with no plan — «no plan» is not «no deviation»', () => {
    expect(scheduleStatusOf(0, false)).toBe('unplanned');
  });
});

describe('tenderScheduleRows — the current stage, or the last one actually closed', () => {
  it('measures the CURRENT stage of an open request, and marks the row open', () => {
    const s = withTenders([tenderWith([
      { key: 'cost', plannedTo: '2026-01-10', actualTo: '2026-01-10' },
      { key: 'approval', plannedTo: '2026-02-10' },
    ])]);
    const [row] = tenderScheduleRows(s, '2026-02-20', CAL);
    expect(row!.open).toBe(true);
    expect(row!.stage?.key).toBe('approval');
    expect(row!.plannedTo).toBe('2026-02-10');
    expect(row!.status).toBe('late');
    expect(row!.devWd).toBeGreaterThan(0);
  });

  it('falls back to the LAST CLOSED stage once every stage is closed, and says the row is not open', () => {
    const s = withTenders([tenderWith([
      { key: 'cost', plannedTo: '2026-01-10', actualTo: '2026-01-10' },
      { key: 'approval', plannedTo: '2026-02-10', actualTo: '2026-02-05' },
    ])]);
    const [row] = tenderScheduleRows(s, '2026-03-01', CAL);
    expect(row!.open).toBe(false);
    expect(row!.stage?.key).toBe('approval');
    expect(row!.status).toBe('ahead');
  });

  it('reads an unplanned current stage as unplanned, with a zero deviation that is NOT «on time»', () => {
    const s = withTenders([tenderWith([{ key: 'cost' }])]);
    const [row] = tenderScheduleRows(s, '2026-03-01', CAL);
    expect(row!.status).toBe('unplanned');
    expect(row!.devWd).toBe(0);
  });

  it('survives a request with no stages at all rather than throwing', () => {
    const s = withTenders([tenderWith([])]);
    const [row] = tenderScheduleRows(s, '2026-03-01', CAL);
    expect(row!.stage).toBeUndefined();
    expect(row!.status).toBe('unplanned');
  });
});

describe('scheduleKpis — the average never counts what it cannot measure', () => {
  it('excludes unplanned rows from the average and reports the denominator it used', () => {
    const k = scheduleKpis([
      { devWd: 4, status: 'late' },
      { devWd: -2, status: 'ahead' },
      { devWd: 0, status: 'unplanned' },
    ]);
    expect(k.measured).toBe(2);
    expect(k.avgDevWd).toBe(1); // (4 + -2) / 2 — the unplanned zero never entered the sum
    expect(k.unplanned).toBe(1);
    expect(k.late).toBe(1);
    expect(k.ahead).toBe(1);
  });

  it('answers null — not 0% — when nothing at all is measurable', () => {
    const k = scheduleKpis([{ devWd: 0, status: 'unplanned' }]);
    expect(k.avgDevWd).toBeNull();
    expect(k.measured).toBe(0);
  });
});

describe('contractScheduleRows — a second unit, normalised to one status vocabulary', () => {
  it('calls a contract behind its planned progress «late», despite the inverted sign convention', () => {
    const rows = contractScheduleRows(seedState(), '2026-08-20');
    for (const r of rows) {
      if (r.variancePct < 0) expect(r.status).toBe('late');
      if (r.variancePct > 0) expect(r.status).toBe('ahead');
    }
    expect(rows).toHaveLength(seedState().contracts.length);
  });

  it('prints a planned delivery date for every contract — signing plus its term', () => {
    for (const r of contractScheduleRows(seedState(), '2026-08-20')) {
      expect(r.plannedDeliveryOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.plannedDeliveryOn > r.contract.signedOn).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  vendorReport — client request 16 / ق6                              */
/* ------------------------------------------------------------------ */
describe('vendor specialization is DERIVED from where the entity actually competed', () => {
  const s = seedState();

  it('finds the tenders an entity bid on by the 12.4.2 name match', () => {
    const v1 = s.vendors.find((v) => v.id === 'v1')!;
    expect(tendersBidOn(s, v1).map((t) => t.code)).toEqual(['AH-DRL-0212']);
  });

  it('gives an entity that never bid an empty spread and NO assumed specialization', () => {
    const idc = s.vendors.find((v) => v.id === 'v-idc')!;
    expect(tendersBidOn(s, idc)).toHaveLength(0);
    const p = vendorProfiles(s).find((x) => x.vendor.id === 'v-idc')!;
    expect(p.bids).toBe(0);
    expect(p.primary).toBeNull();
    expect(p.scopes).toEqual({ DRILLING: 0, ENGINEERING_CONSTRUCTION: 0, HEAVY_MATERIALS: 0, OTHER: 0 });
  });

  it('reads the participation scope off the tender, so a drilling bidder shows drilling', () => {
    const p = vendorProfiles(s).find((x) => x.vendor.id === 'v1')!;
    expect(p.scopes.DRILLING).toBe(1);
    expect(p.primary).toBe('DRILLING');
  });

  it('answers null on a TIE rather than inventing a preference', () => {
    expect(primaryScope({ DRILLING: 2, ENGINEERING_CONSTRUCTION: 2, HEAVY_MATERIALS: 0, OTHER: 0 })).toBeNull();
    expect(primaryScope({ DRILLING: 0, ENGINEERING_CONSTRUCTION: 0, HEAVY_MATERIALS: 0, OTHER: 0 })).toBeNull();
    expect(primaryScope({ DRILLING: 3, ENGINEERING_CONSTRUCTION: 2, HEAVY_MATERIALS: 0, OTHER: 0 })).toBe('DRILLING');
  });
});

describe('contractsWon — the recorded key wins, the name only stands in', () => {
  const s = seedState();

  it('binds a contract by vendorId', () => {
    const v1 = s.vendors.find((v) => v.id === 'v1')!;
    expect(contractsWon(s, v1).map((c) => c.code)).toEqual(['AH-CON-0188']);
  });

  it('never double-counts: a contract carrying a vendorId is not ALSO matched by name', () => {
    const all = s.vendors.flatMap((v) => contractsWon(s, v).map((c) => c.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('attributes a contract with neither key to nobody', () => {
    // EB-CON-0176 has no vendorId and its contractor is not in the registry
    const claimed = s.vendors.flatMap((v) => contractsWon(s, v).map((c) => c.code));
    expect(claimed).not.toContain('EB-CON-0176');
  });
});

describe('the financial-capacity bands ARE the approval ladder — not data quantiles', () => {
  it('places a value on the ladder, ceilings inclusive', () => {
    expect(capacityBand(5_000_000, TIERS)).toBe('OPERATOR');
    expect(capacityBand(5_000_001, TIERS)).toBe('JMC');
    expect(capacityBand(10_000_000, TIERS)).toBe('JMC');
    expect(capacityBand(10_000_001, TIERS)).toBe('MDOC');
  });

  it('gives «awarded nothing» its own band rather than the bottom of the scale', () => {
    expect(capacityBand(0, TIERS)).toBe('none');
  });

  it('bands the seeded entities from their real awards, and the counts add up to the registry', () => {
    const s = seedState();
    const profiles = vendorProfiles(s);
    const byId = (id: string) => profiles.find((p) => p.vendor.id === id)!;
    expect(byId('v1').wonValueUSD).toBe(12_500_000);
    expect(byId('v1').band).toBe('MDOC');   // above the JMC ceiling
    expect(byId('v2').band).toBe('JMC');    // 6.8M
    expect(byId('v3').band).toBe('JMC');    // 9.2M
    expect(byId('v-idc').band).toBe('none');
    const counts = bandCounts(profiles);
    expect(counts.none + counts.OPERATOR + counts.JMC + counts.MDOC).toBe(s.vendors.length);
  });

  it('orders the report by awarded value descending — a stable, explainable order', () => {
    const values = vendorProfiles(seedState()).map((p) => p.wonValueUSD);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('keeps archived entities in the report — withdrawing an entity does not unmake its history', () => {
    const s = seedState();
    const archived = { ...s.vendors[0]!, archived: true };
    const withArchived: State = { ...s, vendors: [archived, ...s.vendors.slice(1)] };
    expect(vendorProfiles(withArchived).some((p) => p.vendor.id === archived.id)).toBe(true);
  });
});
