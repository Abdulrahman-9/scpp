import { describe, expect, it } from 'vitest';
import { reducer, seedState, type Actor } from '../src/store';
import { decisionQueue, lateContracts } from '../src/admin/adminDerive';

const MDOC: Actor = { oid: 'oid-roc-01', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' };

describe('decisionQueue', () => {
  it('returns only tenders parked at the ratify stage with no decision yet', () => {
    // seed: t1 is mid-evaluation, t2 barely started, t3 sits at `ratify` undecided
    expect(decisionQueue(seedState()).map((t) => t.id)).toEqual(['t3']);
  });

  it('drops a tender the moment it is ratified', () => {
    const s = reducer(seedState(), { type: 'RATIFY', tenderId: 't3', by: MDOC });
    expect(decisionQueue(s)).toEqual([]);
  });
});

describe('lateContracts', () => {
  it('returns in-delivery contracts whose actual progress trails the plan', () => {
    // by 2026-08-01 c2 (mobilization overdue) and c3 (execution overdue) are behind plan;
    // c1 and c4 keep pace, so they are excluded
    expect(lateContracts(seedState(), '2026-08-01').map((c) => c.id)).toEqual(['c2', 'c3']);
  });

  it('is empty when every contract is on or ahead of plan', () => {
    expect(lateContracts(seedState(), '2026-02-16')).toEqual([]);
  });
});
