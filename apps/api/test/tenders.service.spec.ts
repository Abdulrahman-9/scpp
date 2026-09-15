import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DEFAULT_APPROVAL_TIERS } from '@masaar/scpp-rules';
import { describe, expect, it, vi } from 'vitest';
import { TendersService } from '../src/tenders/tenders.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

/**
 * Server-side guard tests — the backend counterpart of the frontend store
 * breach-attempt tests. They run WITHOUT a database: Prisma is mocked, so they
 * prove the service refuses rule violations using the real @masaar/scpp-rules
 * engine, independent of any infrastructure.
 */

const MDOC: AuthUser = { userId: 'u-roc', name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' };
const OP: AuthUser = { userId: 'u-op', name: 'Operator', role: 'OPERATOR_ADMIN', operatorId: 'op1' };
/** The ط2 seat (client request 19ب) — admitted by the ratify decorator, gated by the band. */
const JMC: AuthUser = { userId: 'u-jmc', name: 'م. رافد الدليمي', role: 'JMC_APPROVER' };

function makeService(tender: unknown) {
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const prisma = {
    tender: { findUnique: vi.fn().mockResolvedValue(tender), update: vi.fn().mockResolvedValue({}) },
    announcement: { update: vi.fn().mockResolvedValue({}) },
    bidder: { update: vi.fn().mockResolvedValue({}), create: vi.fn().mockResolvedValue({}) },
    stage: { update: vi.fn().mockResolvedValue({}) },
    ratification: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    vendor: { findUnique: vi.fn().mockResolvedValue(null) },
    contract: { findUnique: vi.fn().mockResolvedValue(null) },
    mctCase: { update: vi.fn().mockResolvedValue({}) },
    // no contract on the field → contractFinancialAuthority is null → aboveFA fails CLOSED (§7.1)
    field: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const calendar = { getCalendar: vi.fn().mockResolvedValue({ weekend: [5, 6], holidays: [] }) };
  const svc = new TendersService(prisma as never, audit as never, calendar as never);
  return { svc, prisma, audit };
}

const baseStages = [
  { id: 's1', key: 'ratify', order: 9, actualTo: null, documents: [] },
];

describe('publishAnnouncement guard (11.x pre-publish checks)', () => {
  it('refuses to publish while checks fail, and audits the refusal', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1',
      stages: baseStages, bidders: [], mct: null,
      announcement: { tenderId: 't1', mode: 'LIMITED', periodDays: 14, newspapers: [], lcWebsite: false, rocWebsite: false, inviteeCount: 0, inviteesPreQualified: false, publishedOn: null },
    };
    const { svc, prisma, audit } = makeService(tender);
    await expect(svc.publishAnnouncement(MDOC, 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.announcement.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'PUBLISH_REFUSED', 'RU-1');
  });

  it('publishes when the limited-tender checks pass', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1',
      stages: baseStages, bidders: [], mct: null,
      announcement: { tenderId: 't1', mode: 'LIMITED', periodDays: 14, newspapers: [], lcWebsite: false, rocWebsite: false, inviteeCount: 2, inviteesPreQualified: true, publishedOn: null },
    };
    const { svc, prisma } = makeService(tender);
    await svc.publishAnnouncement(MDOC, 't1');
    expect(prisma.announcement.update).toHaveBeenCalledOnce();
  });
});

describe('setPrice guard (12.4.2 price lock)', () => {
  const tenderAt = (step: number, technicalResult: 'PASS' | 'FAIL' | null) => ({
    id: 't1', code: 'RU-1', operatorId: 'op1', evaluationStep: step,
    stages: baseStages, mct: null, announcement: null,
    bidders: [{ id: 'b1', technicalResult }],
  });

  it('refuses a price during the technical-analysis step', async () => {
    const { svc, prisma } = makeService(tenderAt(1, 'PASS'));
    await expect(svc.setPrice(MDOC, 't1', 'b1', 4_410_000)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.update).not.toHaveBeenCalled();
  });

  it('refuses a price for a technically failed bidder in a commercial step', async () => {
    const { svc } = makeService(tenderAt(2, 'FAIL'));
    await expect(svc.setPrice(MDOC, 't1', 'b1', 4_410_000)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a price for a qualified bidder in a commercial step', async () => {
    const { svc, prisma } = makeService(tenderAt(2, 'PASS'));
    await svc.setPrice(MDOC, 't1', 'b1', 4_410_000);
    expect(prisma.bidder.update).toHaveBeenCalledOnce();
  });
});

describe('completeStage guard (docs gate)', () => {
  it('refuses to close tech-analysis without the evaluation report', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [] }],
    };
    const { svc, prisma } = makeService(tender);
    await expect(svc.completeStage(MDOC, 't1', { stageKey: 'tech-analysis', actualTo: '2026-06-13' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('closes once the required document is uploaded', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [{ kind: 'evaluation-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await svc.completeStage(MDOC, 't1', { stageKey: 'tech-analysis', actualTo: '2026-06-13' });
    expect(prisma.stage.update).toHaveBeenCalledOnce();
  });

  // D1 — the optional deviation record: persisted whole when both halves arrive, refused when
  // one arrives alone (a category with no explanation — or the reverse — explains nothing).
  it('persists actualFrom + the paired deviation reason on the stage', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [{ kind: 'evaluation-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await svc.completeStage(MDOC, 't1', {
      stageKey: 'tech-analysis', actualTo: '2026-06-13', actualFrom: '2026-06-01',
      devReasonCat: 'publisherDelay', devReasonNote: 'تأخر جهة النشر عن الموعد المتفق عليه',
    });
    expect(prisma.stage.update).toHaveBeenCalledWith({
      where: { id: 's' },
      data: {
        actualTo: new Date('2026-06-13'),
        actualFrom: new Date('2026-06-01'),
        devReasonCat: 'publisherDelay',
        devReasonNote: 'تأخر جهة النشر عن الموعد المتفق عليه',
      },
    });
  });

  it('refuses a half reason — category and note travel together or not at all', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [{ kind: 'evaluation-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await expect(svc.completeStage(MDOC, 't1', { stageKey: 'tech-analysis', actualTo: '2026-06-13', devReasonCat: 'publisherDelay' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });
});

describe('§9 C8.6 origin gate on setTechnical (10.6.18) — the hard award-side mirror', () => {
  const bidderWith = (materials: unknown) => ({
    id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', stages: baseStages, mct: null, announcement: null,
    bidders: [{ id: 'b1', name: 'x', technicalResult: null, priceUSD: null, materials }],
  });

  it('refuses a pass while an imported critical material fails the approved-origin gate', async () => {
    const { svc, prisma, audit } = makeService(bidderWith([{ materialId: 'turbines', imported: true, origin: 'China', oemAuthorizedFrom: null, onMooList: false }]));
    await expect(svc.setTechnical(OP, 't1', 'b1', 'pass')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bidder.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_TECHNICAL_REFUSED', expect.stringContaining('10.6.18'));
  });

  it('allows a pass when the declaration clears the gate (approved origin)', async () => {
    const { svc, prisma } = makeService(bidderWith([{ materialId: 'pumps-610', imported: true, origin: 'Japan', oemAuthorizedFrom: null, onMooList: false }]));
    await svc.setTechnical(OP, 't1', 'b1', 'pass');
    expect(prisma.bidder.update).toHaveBeenCalledOnce();
  });
});

describe('§9 C8.1 clause attestation (setLocalContentClause) — mirrors the store reducer guards', () => {
  const tenderWith = (over: Record<string, unknown>) => ({
    id: 't3', code: 'MN-EPC-0305', operatorId: 'op1', status: 'ACTIVE', fieldId: 'f-mansuria',
    estimatedValueUSD: 7_800_000, stages: baseStages, bidders: [], mct: null,
    announcement: null, localContentClauseAffixed: false, scope: 'ENGINEERING_CONSTRUCTION',
    ...over,
  });

  it('refuses to attest on a tender §9 does not reach — a fabricated compliance record', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({ scope: 'OTHER' }));
    await expect(svc.setLocalContentClause(OP, 't3', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE_REFUSED', expect.stringContaining('C8.1'));
  });

  it('refuses once the announcement is published — no retroactive flip of the gate it passed', async () => {
    const published = { tenderId: 't3', mode: 'PUBLIC', periodDays: 23, newspapers: ['a', 'b', 'c'], lcWebsite: true, rocWebsite: true, inviteeCount: 0, inviteesPreQualified: false, publishedOn: new Date('2026-05-07') };
    const { svc, prisma, audit } = makeService(tenderWith({ announcement: published }));
    await expect(svc.setLocalContentClause(OP, 't3', true)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE_REFUSED', expect.stringContaining('published'));
  });

  it('records the attestation (audited) on an unpublished tender the requirement reaches', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({}));
    await svc.setLocalContentClause(OP, 't3', true);
    expect(prisma.tender.update).toHaveBeenCalledWith({ where: { id: 't3' }, data: { localContentClauseAffixed: true } });
    expect(audit.record).toHaveBeenCalledWith('u-op', 'SET_LC_CLAUSE', expect.stringContaining('affixed'));
  });

  it('is a silent no-op when the value is unchanged — no write, no audit row', async () => {
    const { svc, prisma, audit } = makeService(tenderWith({ localContentClauseAffixed: true }));
    await svc.setLocalContentClause(OP, 't3', true);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe('§9 C8.8 sign-stage certificates (via stageCanClose) — winner-scoped', () => {
  it('refuses to close sign without the certificates when the WINNER declared imported materials', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', mct: null, announcement: null,
      bidders: [{ id: 'w', name: 'w', technicalResult: 'PASS', priceUSD: 100, materials: [{ materialId: 'turbines', imported: true, origin: 'Japan', oemAuthorizedFrom: null, onMooList: false }] }],
      stages: [{ id: 's', key: 'sign', order: 10, actualTo: null, documents: [{ kind: 'stage-report' }] }],
    };
    const { svc, prisma } = makeService(tender);
    await expect(svc.completeStage(OP, 't1', { stageKey: 'sign', actualTo: '2026-08-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });
});

describe('ratify / return guards', () => {
  it('refuses to ratify when not at the ratification stage', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null,
      stages: [{ id: 's', key: 'tech-analysis', order: 4, actualTo: null, documents: [] }],
    };
    const { svc } = makeService(tender);
    await expect(svc.ratify(MDOC, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ratifies a tender at the ratify stage, persisting the immutable identity (byUserId) with the name', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc, prisma } = makeService(tender);
    await svc.ratify(MDOC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledOnce();
    // by = mutable display name, byUserId = the JWT principal (never a client-sent value)
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RATIFIED', by: 'د. سارة الجبوري', byUserId: 'u-roc' }),
    });
  });

  it('refuses to return without notes', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc } = makeService(tender);
    await expect(svc.returnWithNotes(MDOC, 't1', '   ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns with notes, persisting the immutable identity (byUserId)', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };
    const { svc, prisma } = makeService(tender);
    await svc.returnWithNotes(MDOC, 't1', 'إعادة تقييم البند الرابع');
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RETURNED', by: 'د. سارة الجبوري', byUserId: 'u-roc', notes: 'إعادة تقييم البند الرابع' }),
    });
  });

  it('refuses to ratify when the lowest qualified bid breaches +20% (6.9.3)', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', estimatedValueUSD: 1_000_000, mct: null, announcement: null,
      stages: baseStages, bidders: [{ id: 'b1', technicalResult: 'PASS', priceUSD: 1_300_000 }],
    };
    const { svc, prisma, audit } = makeService(tender);
    await expect(svc.ratify(MDOC, 't1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ratification.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'RATIFY_REFUSED', 'RU-1 (13.3)');
  });

  it('ratifies when the lowest qualified bid is within +20%', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', estimatedValueUSD: 1_000_000, mct: null, announcement: null,
      stages: baseStages, bidders: [{ id: 'b1', technicalResult: 'PASS', priceUSD: 1_050_000 }],
    };
    const { svc, prisma } = makeService(tender);
    await svc.ratify(MDOC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledOnce();
  });
});

/**
 * The ق1 ladder as an AUTHORITY gate on the server (client request 19ب).
 *
 * The decorator (`RATIFY_ROLES`) admits three roles to the ratification seat; this is the second
 * gate, which decides which of them may sign THIS band. Refusals are 403 and audited, and the
 * check runs before any merit guard — a body with no standing must not learn the award figures.
 */
describe('tier authority on ratify / return (ق1 ladder, request 19ب)', () => {
  const atRatify = (estimatedValueUSD: number) => ({
    id: 't1', code: 'RU-1', operatorId: 'op1', estimatedValueUSD, mct: null, announcement: null,
    stages: baseStages, bidders: [],
  });

  it('lets the joint committee ratify a ط2 award (5M < value ≤ 10M)', async () => {
    const { svc, prisma, audit } = makeService(atRatify(7_800_000));
    await svc.ratify(JMC, 't1');
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RATIFIED', by: 'م. رافد الدليمي', byUserId: 'u-jmc' }),
    });
    expect(audit.record).toHaveBeenCalledWith('u-jmc', 'RATIFY', 'RU-1');
  });

  it('refuses the joint committee on a ط3 award, and audits the attempt with the band', async () => {
    const { svc, prisma, audit } = makeService(atRatify(12_400_000));
    await expect(svc.ratify(JMC, 't1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ratification.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-jmc', 'RATIFY_REFUSED', 'RU-1 (tier MDOC)');
  });

  it('refuses it on ط3 through the RETURN door too — the same seat, the same band', async () => {
    const { svc, prisma, audit } = makeService(atRatify(12_400_000));
    await expect(svc.returnWithNotes(JMC, 't1', 'ملاحظات')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.ratification.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-jmc', 'RETURN_WITH_NOTES_REFUSED', 'RU-1 (tier MDOC)');
  });

  it('lets it return a ط2 file with notes', async () => {
    const { svc, prisma } = makeService(atRatify(7_800_000));
    await svc.returnWithNotes(JMC, 't1', 'إعادة تقييم البند الرابع');
    expect(prisma.ratification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'RETURNED', byUserId: 'u-jmc' }),
    });
  });

  it('keeps the parent company clearing every band, including the committee’s', async () => {
    for (const value of [4_200_000, 7_800_000, 12_400_000]) {
      const { svc, prisma } = makeService(atRatify(value));
      await svc.ratify(MDOC, 't1');
      expect(prisma.ratification.create).toHaveBeenCalledOnce();
    }
  });

  it('checks the band BEFORE the merits — a decided file still refuses on authority', async () => {
    const { svc, prisma, audit } = makeService(atRatify(12_400_000));
    prisma.ratification.findUnique.mockResolvedValue({ id: 'r1', status: 'RATIFIED' });
    await expect(svc.ratify(JMC, 't1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit.record).toHaveBeenCalledWith('u-jmc', 'RATIFY_REFUSED', 'RU-1 (tier MDOC)');
  });

  it('fails closed on an unreadable estimate — the highest band, so only the parent company signs', async () => {
    const { svc } = makeService({ ...atRatify(Number.NaN), estimatedValueUSD: undefined });
    await expect(svc.ratify(JMC, 't1')).rejects.toBeInstanceOf(ForbiddenException);
    const ok = makeService({ ...atRatify(Number.NaN), estimatedValueUSD: undefined });
    await ok.svc.ratify(MDOC, 't1');
    expect(ok.prisma.ratification.create).toHaveBeenCalledOnce();
  });

  /**
   * DRIFT ALARM — the server's authoritative ladder vs. the client's editable one.
   *
   * `assertTierAuthority` reads `DEFAULT_APPROVAL_TIERS` (there is no server tiers model); the web
   * store reads `state.approvalTiers`, seeded from the same constant. Today they are one ladder,
   * and the ONLY reason a disabled «صادق» button and a 403 always agree. Named debt: the governed
   * action that moves the ceilings will make the client's side genuinely mutable — this test is
   * what fails first if that lands on one side only.
   *
   * Asserted BEHAVIOURALLY, not by re-reading the constant: the boundaries are probed through the
   * real gate, so a future change that swaps in a different source is caught even if it keeps the
   * same numbers in a comment.
   */
  it('reads the ENGINE ladder, at the exact boundaries the client draws its bands on', async () => {
    const { operatorMaxUSD, jmcMaxUSD } = DEFAULT_APPROVAL_TIERS;
    // the ceilings are INCLUSIVE at the top of each band, and one cent past moves the seat up
    const jmcClears = [operatorMaxUSD, operatorMaxUSD + 0.01, jmcMaxUSD];
    for (const value of jmcClears) {
      const { svc, prisma } = makeService(atRatify(value));
      await svc.ratify(JMC, 't1');
      expect(prisma.ratification.create, `JMC should clear ${value}`).toHaveBeenCalledOnce();
    }
    const { svc } = makeService(atRatify(jmcMaxUSD + 0.01));
    await expect(svc.ratify(JMC, 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('holds the two ladders identical TODAY — the invariant the debt will end', () => {
    // the client seeds `state.approvalTiers` from this very object (store.tsx SEED_APPROVAL_TIERS).
    // Restated here so the alarm rings on the SERVER side too, where the constant is authoritative.
    expect(DEFAULT_APPROVAL_TIERS).toEqual({ operatorMaxUSD: 5_000_000, jmcMaxUSD: 10_000_000 });
  });
});

describe('addBidder eligibility gate (10.4 / 14.3)', () => {
  const tender = { id: 't1', code: 'RU-1', operatorId: 'op1', bidders: [], mct: null, announcement: null, stages: baseStages };

  it('refuses a suspended vendor and audits the refusal', async () => {
    const { svc, prisma, audit } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v9', suspended: true, blacklisted: false, inDispute: false, banUntil: null });
    await expect(svc.addBidder(MDOC, 't1', 'شركة موقوفة', 'v9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'ADD_BIDDER_REFUSED', 'RU-1/v9 (10.4)');
  });

  it('refuses a vendor under an active 14.3 ban', async () => {
    const { svc, prisma } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v9', suspended: false, blacklisted: false, inDispute: false, banUntil: new Date('2099-01-01') });
    await expect(svc.addBidder(MDOC, 't1', 'شركة محظورة', 'v9')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bidder.create).not.toHaveBeenCalled();
  });

  it('accepts an eligible vendor and records ADD_BIDDER', async () => {
    const { svc, prisma, audit } = makeService(tender);
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v1', suspended: false, blacklisted: false, inDispute: false, banUntil: null });
    await svc.addBidder(MDOC, 't1', 'شركة مؤهلة', 'v1');
    expect(prisma.bidder.create).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'ADD_BIDDER', 'RU-1/شركة مؤهلة');
  });
});

describe('tender governance (cancel / active gate)', () => {
  const active = { id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', bidders: [], mct: null, announcement: null, stages: baseStages };

  it('refuses to cancel an awarded (ratified) tender', async () => {
    const { svc, prisma, audit } = makeService(active);
    prisma.ratification.findUnique.mockResolvedValue({ status: 'RATIFIED' });
    await expect(svc.changeStatus(MDOC, 't1', 'CANCELLED', 'مبرر إلغاء موثّق كافٍ الطول لتجاوز عشرين حرفًا')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.tender.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'TENDER_CANCEL_REFUSED', 'RU-1');
  });

  it('cancels an active pre-award tender with a documented reason, recording the immutable identity', async () => {
    const { svc, prisma, audit } = makeService(active);
    await svc.changeStatus(MDOC, 't1', 'CANCELLED', 'مبرر إلغاء موثّق كافٍ الطول لتجاوز عشرين حرفًا');
    expect(prisma.tender.update).toHaveBeenCalledOnce();
    expect(prisma.tender.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: expect.objectContaining({ status: 'CANCELLED', statusChangedBy: 'د. سارة الجبوري', statusChangedByUserId: 'u-roc' }),
    });
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'TENDER_CANCEL', expect.stringContaining('RU-1:'));
  });

  it('refuses any mutation on a cancelled tender (active gate)', async () => {
    const cancelled = { ...active, status: 'CANCELLED' };
    const { svc } = makeService(cancelled);
    await expect(svc.setEvalStep(MDOC, 't1', 2)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MCT cycle mutations (6.9)', () => {
  it('records the meeting on a tender in the MCT cycle', async () => {
    const tender = {
      id: 't1', code: 'RU-1', operatorId: 'op1', status: 'ACTIVE', bidders: [], announcement: null, stages: baseStages,
      mct: { notifiedOn: new Date('2026-05-01'), meetingHeldOn: null, agreementReachedOn: null, lcEstimateUSD: 7_800_000, mctEstimateUSD: null, agreedEstimateUSD: null },
    };
    const { svc, prisma, audit } = makeService(tender);
    await svc.recordMctMeeting(MDOC, 't1', '2026-05-08');
    expect(prisma.mctCase.update).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith('u-roc', 'MCT_MEETING_RECORDED', expect.stringContaining('RU-1'));
  });
});

describe('company scope (operator isolation)', () => {
  it('forbids an operator from another company’s tender', async () => {
    const tender = { id: 't1', code: 'RU-1', operatorId: 'other-op', stages: baseStages, bidders: [], mct: null, announcement: null };
    const { svc } = makeService(tender);
    await expect(svc.get(OP, 't1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
