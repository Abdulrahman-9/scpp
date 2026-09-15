import { describe, expect, it } from 'vitest';
import { IRAQ_CALENDAR } from '@masaar/working-days';
import { donutGeometry, DONUT_C, DONUT_GAP } from '../src/charts/TierDonut';
import {
  activeTenders, awardedContracts, bucketRangeLabel, companyStats, complianceSeries,
  completionBuckets, contractOperatorId, contractsAtStage, progressBucketOf, SCOPES,
  scopeCountsOf, tenderPartOf, tierCountsOf,
} from '../src/admin/dashboardDerive';
import { PROGRESS_BUCKETS } from '../src/registry/useHashParams';
import { seedState, type State } from '../src/store';

/**
 * The dashboard derivations (client requests 1, 2, 5, 6, 12, 13).
 *
 * Every one of these numbers is printed on a tile or a chart that LINKS to a registry, so the
 * properties asserted here are the ones a wrong answer would show up as on screen: the parts of
 * a bar must add up to the whole it is drawn from, the buckets must partition the range, and a
 * figure that cannot be derived must be absent rather than zero.
 */

const CAL = { weekend: IRAQ_CALENDAR.weekend, holidays: [] as string[] };
const TODAY = '2026-08-20';

describe('companyStats — every operating company, with its portfolio (requests 1 + 2)', () => {
  it('returns ALL twelve companies, including the ones that have raised nothing', () => {
    const rows = companyStats(seedState(), TODAY, CAL);
    expect(rows).toHaveLength(12);
    // dropping the zero rows would tell the reader the fleet is smaller than it is
    expect(rows.filter((r) => r.tenders === 0)).toHaveLength(8);
  });

  it('orders by portfolio value descending, zero-value companies collated at the tail', () => {
    const rows = companyStats(seedState(), TODAY, CAL);
    expect(rows.slice(0, 4).map((r) => r.op.id)).toEqual(['op-cnooc', 'op-fze', 'op-alwaha', 'op-badra']);
    expect(rows.slice(4).every((r) => r.valueUSD === 0)).toBe(true);
    const values = rows.map((r) => r.valueUSD);
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('splits each company into active + completed + halted, and the three ALWAYS add up', () => {
    for (const r of companyStats(seedState(), TODAY, CAL)) {
      expect(r.parts.active + r.parts.completed + r.parts.halted).toBe(r.tenders);
    }
  });

  it('counts a suspended request as halted, never as active — it has an open stage but no work', () => {
    const s = seedState();
    s.tenders[0]!.lifecycle = { status: 'suspended', reason: 'اختبار', on: TODAY, by: 'tester' };
    expect(tenderPartOf(s.tenders[0]!)).toBe('halted');
    const alwaha = companyStats(s, TODAY, CAL).find((r) => r.op.id === 'op-alwaha')!;
    expect(alwaha.parts).toEqual({ active: 0, completed: 0, halted: 1 });
  });

  it('counts the fields each company holds — GeoJade holds the two that make 13 fit under 12 companies', () => {
    const rows = companyStats(seedState(), TODAY, CAL);
    expect(rows.find((r) => r.op.id === 'op-geojade')!.fields).toBe(2);
    expect(rows.reduce((s, r) => s + r.fields, 0)).toBe(13);
  });

  it('counts late requests with the same predicate `?status=delayed` filters by', () => {
    // t2 (Badra) is the seeded deviation story: its `cost` stage closed nine days late and
    // `approval` has been open past its 2026-06-20 plan
    const rows = companyStats(seedState(), TODAY, CAL);
    expect(rows.find((r) => r.op.id === 'op-badra')!.late).toBe(1);
    expect(rows.find((r) => r.op.id === 'op-cnooc')!.late).toBe(0);
  });

  it('attributes a contract ONLY through its originating tender — an unlinked one belongs to nobody', () => {
    const seed = seedState();
    // every seeded contract is honestly unlinked, so no company may claim one
    expect(seed.contracts.every((c) => contractOperatorId(seed, c) === undefined)).toBe(true);
    expect(companyStats(seed, TODAY, CAL).every((r) => r.contracts === 0)).toBe(true);

    const linked: State = { ...seed, contracts: seed.contracts.map((c) => (c.id === 'c1' ? { ...c, tenderId: 't1' } : c)) };
    const alwaha = companyStats(linked, TODAY, CAL).find((r) => r.op.id === 'op-alwaha')!;
    expect(alwaha.contracts).toBe(1);
    expect(alwaha.contractValueUSD).toBe(12_500_000);
  });
});

describe('scopeCountsOf — project types per company (request 2)', () => {
  it('places every seeded tender in its recorded §9 scope', () => {
    const s = seedState();
    expect(scopeCountsOf(s.tenders)).toEqual({
      DRILLING: 1, ENGINEERING_CONSTRUCTION: 2, HEAVY_MATERIALS: 0, OTHER: 1,
    });
  });

  it('partitions exactly — the four buckets sum to the number of tenders, for every company', () => {
    for (const r of companyStats(seedState(), TODAY, CAL)) {
      expect(SCOPES.reduce((sum, k) => sum + r.scopes[k], 0)).toBe(r.tenders);
    }
  });

  it('reads a tender with no recorded scope as OTHER, the same default CREATE_TENDER applies', () => {
    const s = seedState();
    delete s.tenders[0]!.scope;
    expect(scopeCountsOf(s.tenders).OTHER).toBe(2);
  });
});

describe('tierCountsOf — the ladder split behind the donut', () => {
  it('splits the seeded portfolio across the three bands and sums to the whole', () => {
    const s = seedState();
    const counts = tierCountsOf(s, s.tenders);
    // 4.20M + 0.85M inside the 5M ceiling · 7.80M at the JMC gate · 12.40M past it
    expect(counts).toEqual({ OPERATOR: 2, JMC: 1, MDOC: 1 });
    expect(counts.OPERATOR + counts.JMC + counts.MDOC).toBe(s.tenders.length);
  });

  it('excludes cancelled requests from the in-flight split (the public home page reads this)', () => {
    const s = seedState();
    s.tenders[3]!.lifecycle = { status: 'cancelled', reason: 'اختبار', on: TODAY, by: 'tester' };
    expect(activeTenders(s).map((t) => t.id)).not.toContain('t4');
    expect(tierCountsOf(s, activeTenders(s)).MDOC).toBe(0);
  });
});

describe('donutGeometry — the ring arithmetic (§3-ج)', () => {
  it('reproduces the specification worked example to the printed precision', () => {
    const { segs } = donutGeometry([50, 30, 20]);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    expect(r2(segs[0]!.len)).toBe(166.65);
    expect(r2(segs[1]!.len)).toBe(98.79);
    expect(r2(segs[2]!.len)).toBe(64.86);
    expect(r2(segs[0]!.offset)).toBe(-0);
    expect(r2(segs[1]!.offset)).toBe(-169.65);
    expect(r2(segs[2]!.offset)).toBe(-271.43);
  });

  it('drops the gap when ONE band holds everything — a full ring must not show a slit', () => {
    const { segs, total } = donutGeometry([7, 0, 0]);
    expect(total).toBe(7);
    expect(segs[0]!.len).toBeCloseTo(DONUT_C, 6);
    expect(segs[0]!.fraction).toBe(1);
  });

  it('gives a zero band zero length, so the caller emits no arc for it', () => {
    const { segs } = donutGeometry([4, 0, 4]);
    expect(segs[1]!.len).toBe(0);
    // and the band AFTER the empty one still starts in its true place
    expect(segs[2]!.offset).toBeCloseTo(-DONUT_C * 0.5, 6);
  });

  it('draws nothing at all from an empty portfolio instead of dividing by zero', () => {
    const { total, segs } = donutGeometry([0, 0, 0]);
    expect(total).toBe(0);
    expect(segs.map((s) => s.len)).toEqual([0, 0, 0]);
    expect(segs.every((s) => s.fraction === 0)).toBe(true);
  });

  it('keeps every arc inside the circumference, gap included', () => {
    // the last three are the tiny-segment cases: at a share under ~0.884% the naive
    // `C·fraction − gap` is zero or negative, and the partition must still hold after the bump
    for (const values of [[1, 1, 1], [200, 1, 1], [0, 1, 0], [5, 5, 0], [400, 1, 1], [999, 1, 0], [5000, 3, 1]]) {
      const { segs } = donutGeometry(values);
      for (const s of segs) expect(s.len).toBeLessThanOrEqual(DONUT_C);
      const drawn = segs.filter((s) => s.value > 0);
      if (drawn.length > 1) expect(segs.reduce((a, s) => a + s.len, 0)).toBeCloseTo(DONUT_C - drawn.length * DONUT_GAP, 6);
    }
  });

  /**
   * The defect this rule exists to kill: a band holding real requests drew NO arc while the
   * legend beside it printed its count. The ring said «none» and the list said «one», about the
   * same rows — and the reader has no way to tell which of the two is lying.
   */
  it('gives a band too small to survive the gap a visible arc anyway', () => {
    const { segs } = donutGeometry([400, 1, 1]);
    // C·(1/402) ≈ 0.84, so the naive formula lands at −2.16 and the caller drew nothing
    expect(DONUT_C * (1 / 402) - DONUT_GAP).toBeLessThan(0);
    expect(segs[1]!.len).toBe(2);
    expect(segs[2]!.len).toBe(2);
    // and the lender pays for it, so the ring still closes on itself exactly
    expect(segs.reduce((a, s) => a + s.len, 0)).toBeCloseTo(DONUT_C - 3 * DONUT_GAP, 6);
  });

  it('never bumps a band that holds nothing — zero stays zero and draws no dot', () => {
    const { segs } = donutGeometry([400, 0, 1]);
    expect(segs[1]!.len).toBe(0);
    expect(segs[2]!.len).toBe(2);
    expect(segs.reduce((a, s) => a + s.len, 0)).toBeCloseTo(DONUT_C - 2 * DONUT_GAP, 6);
  });

  it('positions every band from the DRAWN lengths, so each gap stays the same width', () => {
    const { segs } = donutGeometry([400, 1, 1]);
    // the bumped band starts exactly one gap after the first arc ends — not at its true fraction,
    // which would have the following arcs overlap the space the bump borrowed
    expect(-segs[1]!.offset).toBeCloseTo(segs[0]!.len + DONUT_GAP, 6);
    expect(-segs[2]!.offset).toBeCloseTo(segs[0]!.len + segs[1]!.len + 2 * DONUT_GAP, 6);
    // the last arc plus its gap closes the circle
    expect(-segs[2]!.offset + segs[2]!.len + DONUT_GAP).toBeCloseTo(DONUT_C, 6);
  });
});

describe('completion buckets — the histogram cut (§3-د, request 12)', () => {
  it('is half-open below and closed at the top, so 100% lands INSIDE the last bucket', () => {
    expect(progressBucketOf(0)).toBe('0-25');
    expect(progressBucketOf(24.9)).toBe('0-25');
    expect(progressBucketOf(25)).toBe('25-50');
    expect(progressBucketOf(49)).toBe('25-50');
    expect(progressBucketOf(50)).toBe('50-75');
    expect(progressBucketOf(74)).toBe('50-75');
    expect(progressBucketOf(75)).toBe('75-100');
    expect(progressBucketOf(100)).toBe('75-100');
  });

  it('partitions the portfolio exactly — every contract in one bucket, none in two', () => {
    const s = seedState();
    const buckets = completionBuckets(s.contracts);
    expect(buckets.map((b) => b.key)).toEqual(['0-25', '25-50', '50-75', '75-100']);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(s.contracts.length);
  });

  it('places the seeded contracts by their closed stages (3/7, 2/7, 3/7, 5/7)', () => {
    const counts = Object.fromEntries(completionBuckets(seedState().contracts).map((b) => [b.key, b.count]));
    expect(counts).toEqual({ '0-25': 0, '25-50': 3, '50-75': 1, '75-100': 0 });
  });

  it('returns four zero buckets for an empty registry rather than nothing to draw', () => {
    expect(completionBuckets([]).map((b) => b.count)).toEqual([0, 0, 0, 0]);
  });

  /**
   * The buckets are half-open below, so `min + 25` is a value the NEXT bucket holds. Printing
   * «0-25%» and «25-50%» side by side claims 25% twice; the honest label is the last percentage
   * inside. One definition, read by the histogram column, its aria sentence and the registry chip.
   */
  it('labels each bucket by the last percentage it actually holds, never by its exclusive top', () => {
    expect(PROGRESS_BUCKETS.map(bucketRangeLabel)).toEqual(['0–24', '25–49', '50–74', '75–100']);
    expect(completionBuckets([]).map((b) => [b.min, b.max])).toEqual([[0, 24], [25, 49], [50, 74], [75, 100]]);
    // and the label boundary agrees with the placement rule: 25 belongs to the SECOND bucket
    expect(progressBucketOf(24)).toBe('0-25');
    expect(progressBucketOf(25)).toBe('25-50');
  });
});

describe('contractsAtStage + awardedContracts (requests 6 + 13)', () => {
  it('counts the contracts parked at one lifecycle stage — the tile and its `?stage=` registry', () => {
    expect(contractsAtStage(seedState(), 'execute').map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(contractsAtStage(seedState(), 'mobilize').map((c) => c.id)).toEqual(['c2']);
  });

  it('reports the awarded portfolio with completed + in-execution adding up to the whole', () => {
    const a = awardedContracts(seedState());
    expect(a.count).toBe(4);
    expect(a.valueUSD).toBe(12_500_000 + 6_800_000 + 9_200_000 + 3_400_000);
    expect(a.completed + a.inExecution).toBe(a.count);
    expect(a.completed).toBe(0); // no seeded contract has closed its final stage
  });

  it('reads an empty store as honest zeroes, never as a placeholder', () => {
    const empty: State = { ...seedState(), contracts: [] };
    expect(awardedContracts(empty)).toEqual({ count: 0, valueUSD: 0, completed: 0, inExecution: 0 });
  });
});

describe('complianceSeries — one independent measurement per month (§3-هـ)', () => {
  it('yields a point only for months that actually closed a stage', () => {
    const points = complianceSeries(seedState(), TODAY);
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.every((p) => p.closed > 0)).toBe(true);
    expect(points.map((p) => p.month)).toEqual([...points.map((p) => p.month)].sort());
  });

  it('never reads the future: a stage planned beyond `today` cannot be judged yet', () => {
    // 2026-06-14 is t4's only closed stage; asking as of 2026-06-30 must not pull July or later in
    const points = complianceSeries(seedState(), '2026-06-30');
    expect(points.every((p) => p.month <= '2026-06')).toBe(true);
  });

  it('refuses to invent a series from a store with nothing closed — the caller then draws nothing', () => {
    const bare: State = { ...seedState(), tenders: [] };
    expect(complianceSeries(bare, TODAY)).toEqual([]);
  });

  it('keeps every point inside 0–100', () => {
    for (const p of complianceSeries(seedState(), TODAY)) {
      expect(p.pct).toBeGreaterThanOrEqual(0);
      expect(p.pct).toBeLessThanOrEqual(100);
    }
  });
});
