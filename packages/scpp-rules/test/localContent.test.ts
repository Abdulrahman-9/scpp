import { describe, expect, it } from 'vitest';
import {
  APPROVED_ORIGINS,
  CRITICAL_MATERIALS,
  bidderOriginBlocker,
  criticalImportDocs,
  criticalOriginVerdict,
  localContentApplies,
  localContentClauseSatisfied,
  localContentStatus,
  type MaterialDeclaration,
} from '../src/localContent';

/**
 * §9 engine — the semantics the core advisor adjudicated. Each test pins one of the corrections:
 * the C8.1/C8.2 split (a document duty is not excused by a bidder's participation evidence), the
 * "من تلك المناشئ" OEM branch, the imported-first gate (domestic never rejected), and fail-closed.
 */

describe('localContentApplies (C8.1/C8.2 trigger)', () => {
  it('applies to the three scopes only when above authority', () => {
    expect(localContentApplies('DRILLING', true)).toBe(true);
    expect(localContentApplies('ENGINEERING_CONSTRUCTION', true)).toBe(true);
    expect(localContentApplies('HEAVY_MATERIALS', true)).toBe(true);
  });

  it('does not apply below authority, nor to OTHER scope', () => {
    expect(localContentApplies('DRILLING', false)).toBe(false);
    expect(localContentApplies('OTHER', true)).toBe(false);
  });
});

describe('localContentClauseSatisfied (C8.1 drafting — publish gate)', () => {
  it('is vacuously satisfied when the requirement does not apply', () => {
    expect(localContentClauseSatisfied(false, false)).toBe(true);
  });

  it('when it applies, demands the clause be affixed to the documents', () => {
    expect(localContentClauseSatisfied(true, false)).toBe(false);
    expect(localContentClauseSatisfied(true, true)).toBe(true);
  });
});

describe('localContentStatus (C8.2 participation — the split verdict)', () => {
  it('is not-required when the trigger is off', () => {
    expect(localContentStatus(false, [])).toBe('not-required');
  });

  it('is compliant when a state company participates', () => {
    expect(localContentStatus(true, [{ company: 'IDC', status: 'accepted' }])).toBe('compliant');
  });

  it('is exempt when no one participates but a documented justification is on record (C8.2)', () => {
    expect(localContentStatus(true, [{ company: 'IDC', status: 'declined', evidence: 'خطاب اعتذار موثّق من الشركة' }])).toBe('exempt');
  });

  it('is violating when it applies, none participate, and NO justification is recorded', () => {
    expect(localContentStatus(true, [{ company: 'IDC', status: 'pending' }])).toBe('violating');
    expect(localContentStatus(true, [])).toBe('violating');
  });

  it('a bidder justification does NOT make a status "compliant" — it is at most an exemption', () => {
    // participation evidence excuses missing participation, never a document duty; the strongest it
    // yields is `exempt`, never `compliant`.
    expect(localContentStatus(true, [{ company: 'IDC', status: 'declined', evidence: 'مبرر' }])).not.toBe('compliant');
  });
});

describe('criticalOriginVerdict (C8.6 — imported-first, OEM from approved, fail closed)', () => {
  it('domestic material always passes — the gate can never reject Iraqi manufacture', () => {
    expect(criticalOriginVerdict({ materialId: 'wellhead', imported: false })).toEqual({ ok: true, reason: 'domestic' });
    // even with no origin fields at all, domestic passes
    expect(criticalOriginVerdict({ materialId: 'tubing', imported: false, origin: 'China' }).ok).toBe(true);
  });

  it('imported from an approved origin passes', () => {
    expect(criticalOriginVerdict({ materialId: 'pumps-610', imported: true, origin: 'Japan' })).toEqual({ ok: true, reason: 'approved-origin' });
  });

  it('imported with an OEM authorization FROM an approved origin passes', () => {
    expect(criticalOriginVerdict({ materialId: 'turbines', imported: true, origin: 'China', oemAuthorizedFrom: 'USA' })).toEqual({ ok: true, reason: 'oem-from-approved' });
  });

  it('imported, made in China, with a CHINESE OEM authorization FAILS (the "من تلك المناشئ" fix)', () => {
    expect(criticalOriginVerdict({ materialId: 'turbines', imported: true, origin: 'China', oemAuthorizedFrom: 'China' })).toEqual({ ok: false, reason: 'unapproved-origin' });
  });

  it('imported from the MoO Vendor List passes (C8.7 alternative)', () => {
    expect(criticalOriginVerdict({ materialId: 'liners', imported: true, origin: 'India', onMooList: true })).toEqual({ ok: true, reason: 'moo-list' });
  });

  it('imported with nothing approved declared fails closed as an incomplete declaration', () => {
    expect(criticalOriginVerdict({ materialId: 'completion', imported: true })).toEqual({ ok: false, reason: 'incomplete-declaration' });
  });

  it('imported from an unapproved origin fails', () => {
    expect(criticalOriginVerdict({ materialId: 'metering', imported: true, origin: 'China' })).toEqual({ ok: false, reason: 'unapproved-origin' });
  });
});

describe('bidderOriginBlocker (C8.6 gate on SET_TECHNICAL:pass, 10.6.18)', () => {
  const clean: MaterialDeclaration[] = [
    { materialId: 'wellhead', imported: false },
    { materialId: 'pumps-610', imported: true, origin: 'Europe' },
  ];

  it('returns null when every declared material clears C8.6', () => {
    expect(bidderOriginBlocker(clean)).toBeNull();
  });

  it('returns the first failing declaration, blocking the pass', () => {
    const bad = [...clean, { materialId: 'turbines', imported: true, origin: 'China' }];
    expect(bidderOriginBlocker(bad)?.materialId).toBe('turbines');
  });
});

describe('criticalImportDocs (C8.8 — post-award required documents)', () => {
  it('demands inspection + certified origin only when imported critical materials are present', () => {
    expect(criticalImportDocs(true)).toEqual(['inspection-cert', 'origin-cert']);
    expect(criticalImportDocs(false)).toEqual([]);
  });
});

describe('reference seeds (governing values, editable via governance)', () => {
  it('approved origins are the four verbatim from §9', () => {
    expect(APPROVED_ORIGINS).toEqual(['Europe', 'Japan', 'USA', 'Canada']);
  });

  it('the critical-materials list mirrors Appendix I (17 items, unique ids)', () => {
    expect(CRITICAL_MATERIALS).toHaveLength(17);
    expect(new Set(CRITICAL_MATERIALS.map((m) => m.id)).size).toBe(17);
  });
});
