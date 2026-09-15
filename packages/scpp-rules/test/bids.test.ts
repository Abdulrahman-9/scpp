import { describe, expect, it } from 'vitest';
import {
  bidderCounts,
  duplicateBidders,
  effectiveClosingDate,
  isLateBid,
  isLateBidByDate,
  isPriceVisible,
  lowestQualified,
  refusalToSign,
  singleBidAcceptable,
  vendorEligible,
} from '@masaar/scpp-rules';

describe('isPriceVisible — price locked until technical pass, commercial steps only (12.4.2)', () => {
  it.each([
    ['technical-opening', 'pass', false],
    ['technical-analysis', 'pass', false],
    ['commercial-opening', 'pass', true],
    ['commercial-analysis', 'pass', true],
    ['commercial-opening', 'fail', false],
    ['commercial-analysis', undefined, false],
  ] as const)('step=%s technical=%s → %s', (step, technicalResult, visible) => {
    expect(isPriceVisible(step, { technicalResult })).toBe(visible);
  });
});

describe('lowestQualified — award to lowest technically-qualified (6.6)', () => {
  it('ignores cheaper but technically failed bids', () => {
    const winner = lowestQualified([
      { id: 'A', technicalResult: 'fail', priceUSD: 3_900_000 },
      { id: 'B', technicalResult: 'pass', priceUSD: 4_620_000 },
      { id: 'C', technicalResult: 'pass', priceUSD: 4_410_000 },
    ]);
    expect(winner?.id).toBe('C');
  });

  it('returns null when nobody qualifies', () => {
    expect(lowestQualified([{ id: 'A', technicalResult: 'fail', priceUSD: 1 }])).toBeNull();
  });
});

describe('bidderCounts — derived, never stored', () => {
  it('computes applied/qualified/priced', () => {
    expect(
      bidderCounts([
        { id: 'A', technicalResult: 'pass', priceUSD: 100 },
        { id: 'B', technicalResult: 'fail' },
        { id: 'C' },
      ]),
    ).toEqual({ applied: 3, qualified: 1, priced: 1 });
  });
});

describe('late bids auto-rejected (10.6.1)', () => {
  it('one minute past closing is late', () => {
    expect(isLateBid('2026-06-10T12:01:00Z', '2026-06-10T12:00:00Z')).toBe(true);
    expect(isLateBid('2026-06-10T11:59:00Z', '2026-06-10T12:00:00Z')).toBe(false);
  });

  it('isLateBidByDate compares by calendar day, slicing internally (timezone-immune)', () => {
    expect(isLateBidByDate('2026-06-08', '2026-06-07')).toBe(true); // a day later → late
    expect(isLateBidByDate('2026-06-07', '2026-06-07')).toBe(false); // same day → on time
    // a full timestamp on the closing day is NOT late — the wrapper slices, so no midnight drift
    expect(isLateBidByDate('2026-06-07T23:00:00+03:00', '2026-06-07')).toBe(false);
  });
});

describe('closing on a holiday extends to the next working day', () => {
  it('Friday closing slides to Sunday (Iraq weekend)', () => {
    expect(effectiveClosingDate('2026-06-12')).toBe('2026-06-14');
  });
});

describe('single bid acceptable iff bid period ≥ 21 days (15.3)', () => {
  it.each([
    [1, 21, true],
    [1, 14, false],
    [3, 7, true], // rule only constrains the single-bid case
  ] as const)('bids=%d period=%d → %s', (count, period, ok) => {
    expect(singleBidAcceptable(count, period).ok).toBe(ok);
  });
});

describe('vendor eligibility (10.4)', () => {
  it('excludes suspended / blacklisted / in-dispute vendors', () => {
    expect(vendorEligible({}).ok).toBe(true);
    const r = vendorEligible({ suspended: true, inDispute: true });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(['suspended', 'in-dispute']);
  });
});

describe('one bid per bidder', () => {
  it('reports duplicates', () => {
    expect(duplicateBidders(['A', 'B', 'A', 'C', 'B'])).toEqual(['A', 'B']);
    expect(duplicateBidders(['A', 'B'])).toEqual([]);
  });
});

describe('refusal to sign (14.3)', () => {
  it('ban ≤ 12 months, forfeit bond, award to next rank, notify PCLD', () => {
    const r = refusalToSign(1);
    expect(r).toEqual({
      banMonthsMax: 12,
      forfeitBidBond: true,
      awardToRank: 2,
      notify: 'PCLD',
      clause: '14.3',
    });
  });
});
