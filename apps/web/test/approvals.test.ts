import { describe, expect, it } from 'vitest';
import ar from '../src/locales/ar.json';
import en from '../src/locales/en.json';
import { seedState, type State, type Tender } from '../src/store';
import { approvalChain, approvalDecisionOf, awaitingTier, ratifiedInMonth } from '../src/admin/adminDerive';

/**
 * The approval chain (client decision ق1) — the population and the reading of the «سلسلة
 * الموافقات» screen. What matters here is that the screen is DERIVED: nothing marks a tender as
 * needing approval, so moving a ceiling must re-populate the registry, an unusable ladder must
 * fail closed to the highest gate, and a tender nobody is waiting on must not be counted as
 * pending. The tier arithmetic itself is pinned in scpp-rules/test/approvalTier.test.ts.
 */

const withTiers = (s: State, operatorMaxUSD: number, jmcMaxUSD: number): State =>
  ({ ...s, approvalTiers: { operatorMaxUSD, jmcMaxUSD } });

const patch = (s: State, id: string, extra: Partial<Tender>): State =>
  ({ ...s, tenders: s.tenders.map((t) => (t.id === id ? { ...t, ...extra } : t)) });

const RATIFIED = (on: string): Tender['ratification'] => ({ status: 'ratified', by: 'د. سارة الجبوري', on });

describe('approvalChain — the tenders that owe a signature outside their own company', () => {
  it('lists only the tenders above the operating company authority, with the body that clears each', () => {
    // seed ladder 5M/10M: t1 4.20M and t2 0.85M are ط1 (no gate); t3 7.80M is JMC; t4 12.40M is MDOC
    const rows = approvalChain(seedState());
    expect(rows.map((r) => r.tender.id)).toEqual(['t3', 't4']);
    expect(rows.map((r) => r.tier)).toEqual(['JMC', 'MDOC']);
  });

  it('treats the ceiling as inclusive: a value AT the ceiling opens no gate, one dollar past it does', () => {
    const s = seedState(); // t1 = 4,200,000
    expect(approvalChain(withTiers(s, 4_200_000, 10_000_000)).map((r) => r.tender.id)).not.toContain('t1');
    const past = approvalChain(withTiers(s, 4_199_999, 10_000_000)).find((r) => r.tender.id === 't1');
    expect(past?.tier).toBe('JMC');
  });

  it('re-populates itself when a ceiling moves — no tender is edited, the ladder is', () => {
    const rows = approvalChain(withTiers(seedState(), 1_000_000, 5_000_000));
    expect(rows.map((r) => [r.tender.id, r.tier])).toEqual([
      ['t1', 'JMC'],   // 4.20M now sits above the lowered operator ceiling
      ['t3', 'MDOC'],  // 7.80M now sits above the lowered JMC ceiling
      ['t4', 'MDOC'],
    ]);
    expect(rows.map((r) => r.tender.id)).not.toContain('t2'); // 0.85M is still within ط1
  });

  it('reads an unusable ladder conservatively — every tender waits on the highest gate', () => {
    // an inverted ladder describes no reachable JMC band: it is a misconfiguration, and a request
    // whose clearing body cannot be established must not be treated as cleared by the lowest one
    const rows = approvalChain(withTiers(seedState(), 10_000_000, 1_000_000));
    expect(rows).toHaveLength(seedState().tenders.length);
    expect(rows.every((r) => r.tier === 'MDOC')).toBe(true);
  });
});

describe('approvalDecisionOf — what the waiting body has (or has not) done', () => {
  const s = seedState();

  it('is pending while no decision and no lifecycle event is recorded', () => {
    expect(approvalDecisionOf(s.tenders.find((t) => t.id === 't4')!)).toBe('pending');
  });

  it('reports the recorded ratification decision', () => {
    const ratified = patch(s, 't3', { ratification: RATIFIED('2026-08-11') });
    expect(approvalDecisionOf(ratified.tenders.find((t) => t.id === 't3')!)).toBe('ratified');
    const returned = patch(s, 't3', { ratification: { status: 'returned', by: 'x', on: '2026-08-11', notes: 'n' } });
    expect(approvalDecisionOf(returned.tenders.find((t) => t.id === 't3')!)).toBe('returned');
  });

  it('does NOT read a cancelled or suspended tender as pending — nobody is waiting on it', () => {
    const cancelled = patch(s, 't4', { lifecycle: { status: 'cancelled', reason: 'r', on: '2026-08-01', by: 'x' } });
    expect(approvalDecisionOf(cancelled.tenders.find((t) => t.id === 't4')!)).toBe('cancelled');
    const suspended = patch(s, 't4', { lifecycle: { status: 'suspended', reason: 'r', on: '2026-08-01', by: 'x' } });
    expect(approvalDecisionOf(suspended.tenders.find((t) => t.id === 't4')!)).toBe('suspended');
  });

  it('keeps the decision that was actually taken when a later suspension follows it', () => {
    const both = patch(s, 't3', {
      ratification: RATIFIED('2026-08-11'),
      lifecycle: { status: 'suspended', reason: 'r', on: '2026-08-20', by: 'x' },
    });
    expect(approvalDecisionOf(both.tenders.find((t) => t.id === 't3')!)).toBe('ratified');
  });
});

/**
 * The two follow-up-room tiles that replaced «في دورة MCT» (ق3) read this, and so does the
 * approval registry's KPI strip — one definition, so the number a manager clicks and the screen
 * it opens can never disagree.
 */
describe('awaitingTier — outstanding signatures, one band at a time', () => {
  it('counts only the band asked for', () => {
    const rows = approvalChain(seedState()); // t3 JMC 7.80M, t4 MDOC 12.40M — both undecided
    expect(awaitingTier(rows, 'JMC').map((r) => r.tender.id)).toEqual(['t3']);
    expect(awaitingTier(rows, 'MDOC').map((r) => r.tender.id)).toEqual(['t4']);
  });

  it('drops a tender the moment its body signs — the queue is what is still outstanding', () => {
    const s = patch(seedState(), 't3', { ratification: RATIFIED('2026-08-11') });
    expect(awaitingTier(approvalChain(s), 'JMC')).toEqual([]);
  });

  it('does not count a returned, cancelled or suspended tender — nobody is waiting on it', () => {
    const returned = patch(seedState(), 't3', { ratification: { status: 'returned', by: 'x', on: '2026-08-11', notes: 'n' } });
    expect(awaitingTier(approvalChain(returned), 'JMC')).toEqual([]);
    const cancelled = patch(seedState(), 't4', { lifecycle: { status: 'cancelled', reason: 'r', on: '2026-08-01', by: 'x' } });
    expect(awaitingTier(approvalChain(cancelled), 'MDOC')).toEqual([]);
  });

  it('never counts a request inside the operating company own authority (ط1 opens no gate)', () => {
    // lower the operator ceiling and t1 (4.20M) enters the JMC band — it was never «awaiting»
    // anyone before that, because it was not on the ladder at all
    const s = seedState();
    expect(awaitingTier(approvalChain(s), 'JMC').map((r) => r.tender.id)).not.toContain('t1');
    expect(awaitingTier(approvalChain(withTiers(s, 1_000_000, 5_000_000)), 'JMC').map((r) => r.tender.id)).toEqual(['t1']);
  });
});

describe('ratifiedInMonth — the «صودق هذا الشهر» count', () => {
  it('counts a ratification inside the calendar month of the given day, at either edge', () => {
    const s = patch(seedState(), 't3', { ratification: RATIFIED('2026-08-01') });
    expect(ratifiedInMonth(approvalChain(s), '2026-08-31')).toHaveLength(1);
    const end = patch(seedState(), 't3', { ratification: RATIFIED('2026-08-31') });
    expect(ratifiedInMonth(approvalChain(end), '2026-08-01')).toHaveLength(1);
  });

  it('ignores a ratification from another month', () => {
    const s = patch(seedState(), 't3', { ratification: RATIFIED('2026-07-31') });
    expect(ratifiedInMonth(approvalChain(s), '2026-08-01')).toEqual([]);
  });

  it('ignores a RETURNED decision in the same month — a return is not an approval', () => {
    const s = patch(seedState(), 't3', { ratification: { status: 'returned', by: 'x', on: '2026-08-11', notes: 'n' } });
    expect(ratifiedInMonth(approvalChain(s), '2026-08-20')).toEqual([]);
  });

  it('never counts a tender inside the operator own authority — it is not on the ladder at all', () => {
    // t1 (4.20M) is ط1: even ratified this month it is not part of the approval chain
    const s = patch(seedState(), 't1', { ratification: RATIFIED('2026-08-11') });
    expect(ratifiedInMonth(approvalChain(s), '2026-08-20')).toEqual([]);
  });
});

/**
 * The tier / decision / conformance vocabularies are looked up by INTERPOLATED key
 * (t(`tier.pill.${tier}`)), which no compiler can check: a half-added key would ship a raw
 * dotted path onto a governance screen. Both languages are pinned against the enums themselves.
 */
describe('the interpolated vocabularies exist in both languages', () => {
  const dict = { ar, en } as const;
  const at = (tree: object, path: string): unknown =>
    path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], tree);
  /** every path must resolve to a non-empty string in BOTH locales (parity is part of the guard) */
  const covers = (paths: string[]) => {
    const missing = (['ar', 'en'] as const).flatMap((lang) =>
      paths.filter((p) => typeof at(dict[lang], p) !== 'string' || (at(dict[lang], p) as string).trim() === '')
        .map((p) => `${lang}: ${p}`),
    );
    expect(missing).toEqual([]);
  };

  it('names every tier: pill label, short name, deciding body and value band', () => {
    covers(['OPERATOR', 'JMC', 'MDOC'].flatMap((t) => [`tier.pill.${t}`, `tier.name.${t}`, `tier.body.${t}`, `tier.band.${t}`]));
  });

  it('names every decision state the approval chain can render', () => {
    covers(['pending', 'ratified', 'returned', 'cancelled', 'suspended'].map((d) => `approvals.dec.${d}`));
  });

  it('defines the computation behind every status pill the registries show', () => {
    covers(['progress', 'risk', 'delayed', 'done'].map((s) => `match.status.${s}`));
  });

  /**
   * The entity trail renders t(`entity.ev_${kind}`) off the VendorEvent union, so the two kinds
   * the archive model (ق7) added are exactly the kind of half-added key that ships a raw dotted
   * path onto a governance file. The field trail is read through explicit keys, pinned with them.
   */
  it('names every governance event the two registries can render, in both languages', () => {
    covers(['suspend', 'lift', 'ban', 'scores', 'archive', 'restore'].map((k) => `entity.ev_${k}`));
    covers(['fields.archive', 'fields.restore', 'fields.rename', 'fields.archived', 'fields.chipArchived']);
    covers(['entity.archive', 'entity.restore', 'entity.archived', 'entity.archivedBanner', 'entity.add']);
    covers(['bidderadd.blockArchived']);
  });
});
