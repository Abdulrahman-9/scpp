import { describe, expect, it } from 'vitest';
import {
  approvalTierFor, DEFAULT_APPROVAL_TIERS, mayRatifyTier, ratifyingRank,
  tierNeedsApproval, type ApprovalTier, type ApprovalTiers,
} from '../src/approvalTier';

/**
 * The client's approval ladder (ق1, 2026-08-20). The two seeded ceilings are the ones the
 * client named in session — 5M and 10M — so the boundary cases below are the literal figures
 * an operator will type, not synthetic edges.
 */
const SEED: ApprovalTiers = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 };

describe('approvalTierFor — the three bands (ق1)', () => {
  it('ط1 — a value inside the operator authority needs no approval act', () => {
    expect(approvalTierFor(0, SEED)).toBe('OPERATOR');
    expect(approvalTierFor(850_000, SEED)).toBe('OPERATOR');
    expect(approvalTierFor(4_200_000, SEED)).toBe('OPERATOR');
  });

  it('ط2 — above the operator ceiling up to the JMC ceiling goes to the joint committee', () => {
    expect(approvalTierFor(5_000_000.01, SEED)).toBe('JMC');
    expect(approvalTierFor(7_800_000, SEED)).toBe('JMC');
  });

  it('ط3 — above the JMC ceiling goes to the parent company (MDOC)', () => {
    expect(approvalTierFor(10_000_000.01, SEED)).toBe('MDOC');
    expect(approvalTierFor(12_400_000, SEED)).toBe('MDOC');
  });
});

describe('approvalTierFor — the exact boundaries the client stated', () => {
  it('5,000,000 is still the operator’s — the ceiling is INCLUSIVE', () => {
    expect(approvalTierFor(5_000_000, SEED)).toBe('OPERATOR');
  });

  it('one cent past 5,000,000 is the JMC’s', () => {
    expect(approvalTierFor(5_000_000.01, SEED)).toBe('JMC');
  });

  it('10,000,000 is still the JMC’s — the ceiling is INCLUSIVE', () => {
    expect(approvalTierFor(10_000_000, SEED)).toBe('JMC');
  });

  it('one cent past 10,000,000 is MDOC’s', () => {
    expect(approvalTierFor(10_000_000.01, SEED)).toBe('MDOC');
  });
});

describe('approvalTierFor — fail closed on a ladder that cannot be trusted', () => {
  it('no configuration at all resolves to the HIGHEST gate, never the lowest', () => {
    expect(approvalTierFor(1, null)).toBe('MDOC');
    expect(approvalTierFor(1, undefined)).toBe('MDOC');
  });

  it('a non-finite ceiling is not a ladder', () => {
    expect(approvalTierFor(1, { operatorMaxUSD: Number.NaN, jmcMaxUSD: 10_000_000 })).toBe('MDOC');
    expect(approvalTierFor(1, { operatorMaxUSD: 5_000_000, jmcMaxUSD: Number.POSITIVE_INFINITY })).toBe('MDOC');
  });

  it('a negative ceiling is not a ladder', () => {
    expect(approvalTierFor(1, { operatorMaxUSD: -1, jmcMaxUSD: 10_000_000 })).toBe('MDOC');
  });

  it('an inverted ladder (JMC ceiling below the operator’s) is a misconfiguration, not a two-tier ladder', () => {
    // were this tolerated, a 4M request would read OPERATOR under a ladder whose JMC band is empty
    expect(approvalTierFor(4_000_000, { operatorMaxUSD: 5_000_000, jmcMaxUSD: 1_000_000 })).toBe('MDOC');
  });

  it('an unreadable estimate clears nothing', () => {
    expect(approvalTierFor(Number.NaN, SEED)).toBe('MDOC');
  });

  it('a degenerate but ordered ladder still works (both ceilings equal → no JMC band)', () => {
    const flat: ApprovalTiers = { operatorMaxUSD: 5_000_000, jmcMaxUSD: 5_000_000 };
    expect(approvalTierFor(5_000_000, flat)).toBe('OPERATOR');
    expect(approvalTierFor(5_000_000.01, flat)).toBe('MDOC');
  });
});

describe('tierNeedsApproval — ط1 is «متابعة وتدقيق فقط»', () => {
  it('only the two upper tiers carry an approval gate', () => {
    expect(tierNeedsApproval('OPERATOR')).toBe(false);
    expect(tierNeedsApproval('JMC')).toBe(true);
    expect(tierNeedsApproval('MDOC')).toBe(true);
  });
});

describe('DEFAULT_APPROVAL_TIERS — one ladder for both apps', () => {
  it('is the ق1 ladder the client stated, and the ceilings the boundary tests above use', () => {
    expect(DEFAULT_APPROVAL_TIERS).toEqual(SEED);
  });
});

/**
 * WHO may sign a band (client request 19ب). The ladder already said which BODY a value belongs
 * to; these say which body a ROLE speaks for — and the two are read against each other by the
 * server's ratify guard, the store reducer and the review screen alike.
 */
describe('ratifyingRank — only the ratify endpoint’s three roles carry a signature', () => {
  it('ranks the three bodies in ladder order', () => {
    expect(ratifyingRank('JMC_APPROVER')).toBe(1);
    expect(ratifyingRank('MDOC_ADMIN')).toBe(2);
    // the platform administrator holds every role-guarded capability by construction
    expect(ratifyingRank('SUPER_ADMIN')).toBeGreaterThan(ratifyingRank('MDOC_ADMIN'));
  });

  it('gives every other role no ratifying authority at all', () => {
    for (const r of ['EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER']) {
      expect(ratifyingRank(r)).toBe(-1);
    }
  });

  it('fails closed on a name that is no role — retired, forged or empty', () => {
    expect(ratifyingRank('ROC_ADMIN')).toBe(-1); // the retired spelling is resolved BEFORE this point
    expect(ratifyingRank('JMC')).toBe(-1);       // a body name is not a role identifier
    expect(ratifyingRank('')).toBe(-1);
  });
});

describe('mayRatifyTier — a body clears its own band and every band beneath it', () => {
  it('the joint committee clears ط1 and ط2 and stops at its ceiling', () => {
    expect(mayRatifyTier('JMC_APPROVER', 'OPERATOR')).toBe(true);
    expect(mayRatifyTier('JMC_APPROVER', 'JMC')).toBe(true);
    expect(mayRatifyTier('JMC_APPROVER', 'MDOC')).toBe(false);
  });

  it('the parent company clears every band, including the joint committee’s', () => {
    expect(mayRatifyTier('MDOC_ADMIN', 'OPERATOR')).toBe(true);
    expect(mayRatifyTier('MDOC_ADMIN', 'JMC')).toBe(true);
    expect(mayRatifyTier('MDOC_ADMIN', 'MDOC')).toBe(true);
  });

  it('a role with no ratifying authority clears nothing — not even ط1', () => {
    // ط1 opens no EXTERNAL gate, but it is still a decision seat somebody must legitimately hold
    for (const tier of ['OPERATOR', 'JMC', 'MDOC'] as ApprovalTier[]) {
      expect(mayRatifyTier('OPERATOR_ADMIN', tier)).toBe(false);
      expect(mayRatifyTier('AUDITOR', tier)).toBe(false);
      expect(mayRatifyTier('EVALUATION', tier)).toBe(false);
    }
  });

  it('is monotone: whatever a body clears, every higher body clears too', () => {
    const bodies = ['JMC_APPROVER', 'MDOC_ADMIN', 'SUPER_ADMIN'];
    for (const tier of ['OPERATOR', 'JMC', 'MDOC'] as ApprovalTier[]) {
      const cleared = bodies.map((b) => mayRatifyTier(b, tier));
      // once true, never false again as rank rises — no gap in the middle of the ladder
      expect(cleared.indexOf(true) === -1 || !cleared.slice(cleared.indexOf(true)).includes(false)).toBe(true);
    }
  });

  it('reads the SAME band a value resolves to, so a gate and a pill can never disagree', () => {
    // 7.8M is the seeded ط2 request; 12.4M the seeded ط3 one
    expect(mayRatifyTier('JMC_APPROVER', approvalTierFor(7_800_000, SEED))).toBe(true);
    expect(mayRatifyTier('JMC_APPROVER', approvalTierFor(12_400_000, SEED))).toBe(false);
    // and an unusable ladder resolves to MDOC — so it also closes the JMC's seat, not just the band
    expect(mayRatifyTier('JMC_APPROVER', approvalTierFor(1, null))).toBe(false);
  });
});
