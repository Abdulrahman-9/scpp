import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  approvalTierFor,
  awardVerdict,
  checkAnnouncement,
  contractFinancialAuthority,
  DEFAULT_APPROVAL_TIERS,
  detectSplitRisk,
  effectiveClosingDate,
  isLateBidByDate,
  mayRatifyTier,
  isPriceVisible,
  lowestQualified,
  bidderOriginBlocker,
  criticalImportDocs,
  localContentApplies,
  mctCycleStatus,
  METHODS,
  singleBidAcceptable,
  stageCanClose,
  suggestMethod,
  vendorEligible,
  type LocalContentScope,
  type MaterialDeclaration,
  type AnnouncementMode,
  type EvaluationStep,
} from '@masaar/scpp-rules';
import { addCalendarDays } from '@masaar/working-days';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { isOperatorScoped, operatorScopeWhere } from '../auth/scope.js';
import type { CompleteStageDto, CreateTenderDto } from './dto.js';
import { presentTender } from './tender.presenter.js';

const iso = (d: Date | null | undefined): string | undefined => (d ? d.toISOString().slice(0, 10) : undefined);

const METHOD_ENUM: Record<number, string> = {
  1: 'SOLE_SOURCE',
  2: 'LOW_VALUE',
  3: 'FAST_TRACK',
  4: 'DIRECT',
  5: 'RFP',
  6: 'LIMITED',
  7: 'PUBLIC',
  8: 'TWO_PHASED',
};

const EVAL_STEPS: readonly EvaluationStep[] = ['technical-opening', 'technical-analysis', 'commercial-opening', 'commercial-analysis'];

const REQUIRED_DOCS: Record<string, string[]> = {
  announce: ['announcement-copy'],
  'tech-open': ['opening-minutes'],
  'tech-analysis': ['evaluation-report'],
  'comm-open': ['opening-minutes'],
  'comm-analysis': ['evaluation-report'],
};
const requiredDocsFor = (k: string) => REQUIRED_DOCS[k] ?? ['stage-report'];

@Injectable()
export class TendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly calendar: CalendarService,
  ) {}

  private static readonly FULL_INCLUDE = {
    stages: { orderBy: { order: 'asc' as const }, include: { documents: true } },
    announcement: true,
    bidders: { include: { materials: true } }, // §9 C8.6 — per-bidder origin declarations
    mct: true,
    ratification: true,
    stateResponses: true, // §9 C8.2 — documented state-company responses
  };

  private async loadScoped(user: AuthUser, id: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: TendersService.FULL_INCLUDE,
    });
    if (!tender) throw new NotFoundException('Tender not found');
    if (isOperatorScoped(user) && tender.operatorId !== user.operatorId) {
      throw new ForbiddenException('Out of company scope');
    }
    return tender;
  }

  /** loadScoped, but refuses when the tender is CANCELLED/SUSPENDED — every mutation gates on this.
   *  (Prisma always sets `status` via its default; a missing status is treated as ACTIVE.) */
  private async loadScopedActive(user: AuthUser, id: string) {
    const tender = await this.loadScoped(user, id);
    if (tender.status && tender.status !== 'ACTIVE') throw new BadRequestException(`Tender is ${tender.status.toLowerCase()}`);
    return tender;
  }

  /** loadScoped + fairness redaction — the shape every read/mutation returns to the client. */
  private async presented(user: AuthUser, id: string) {
    return presentTender(await this.loadScoped(user, id), user);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.tender.findMany({
      where: operatorScopeWhere(user),
      include: TendersService.FULL_INCLUDE,
      orderBy: { createdOn: 'desc' },
    });
    return rows.map((t) => presentTender(t, user));
  }

  get(user: AuthUser, id: string) {
    return this.presented(user, id);
  }

  async create(user: AuthUser, dto: CreateTenderDto) {
    const suggestion = suggestMethod({
      estimatedValueUSD: dto.estimatedValueUSD,
      soleSourceCase: dto.soleSourceCase as never,
      specializedOrEmergency: dto.specializedOrEmergency,
      technicallyComplex: dto.technicallyComplex,
      hasPreQualifiedList: dto.hasPreQualifiedList,
      hasRecentQualifiedBidders: dto.hasRecentQualifiedBidders,
    });

    let methodId = suggestion.method.id;
    if (dto.methodIdOverride && dto.methodIdOverride !== suggestion.method.id) {
      // override requires a justification — refused otherwise (mirrors the UI guard, now binding)
      if (!dto.overrideJustification?.trim()) {
        throw new BadRequestException('Override requires a justification');
      }
      if (!METHODS.some((m) => m.id === dto.methodIdOverride)) throw new BadRequestException('Unknown method');
      methodId = dto.methodIdOverride;
    }

    const operatorId = user.operatorId;
    if (!operatorId) throw new ForbiddenException('Only operator users create requests');

    // the field decides the authority (§7.1) — load it with its contract, and gate access.
    const field = await this.prisma.field.findUnique({ where: { id: dto.fieldId }, include: { serviceContract: true } });
    if (!field || field.operatorId !== operatorId) throw new ForbiddenException('Field is not in your operating scope');
    const fa = contractFinancialAuthority(
      field.serviceContract ? { ...field.serviceContract, financialAuthorityUSD: Number(field.serviceContract.financialAuthorityUSD) } : null,
    );
    // fail closed (§7.1: authority «shall be obtained before an award») — no contract, no creation.
    if (fa == null) throw new BadRequestException('The field has no effective Service Contract — Financial Authority is unresolvable');

    // anti-splitting (7.2): group at the OPERATOR + budget code (a cross-field split under one
    // budget is the evasion the field-scoped view would miss), and measure against the MINIMUM
    // contract FA among the fields in the group — the conservative "appropriate FA". Advisory
    // only ("لغرض التهرّب حصراً" is intent a threshold cannot prove — we warn, never block).
    const existing = await this.prisma.tender.findMany({ where: { operatorId, budgetCode: dto.budgetCode } });
    const groupFieldIds = [...new Set([dto.fieldId, ...existing.map((t) => t.fieldId)])];
    const groupContracts = await this.prisma.serviceContract.findMany({ where: { fieldId: { in: groupFieldIds } } });
    const groupFaList = groupContracts
      .map((c) => contractFinancialAuthority({ ...c, financialAuthorityUSD: Number(c.financialAuthorityUSD) }))
      .filter((n): n is number => n != null);
    const groupFa = groupFaList.length ? Math.min(...groupFaList) : 0;
    const spansMultipleFields = groupFieldIds.length > 1;
    const splitRisk = detectSplitRisk(
      [
        ...existing.map((t) => ({ id: t.code, budgetCode: t.budgetCode, estimatedValueUSD: Number(t.estimatedValueUSD), raisedOn: t.createdOn.toISOString().slice(0, 10) })),
        { id: 'NEW', budgetCode: dto.budgetCode, estimatedValueUSD: dto.estimatedValueUSD, raisedOn: new Date().toISOString().slice(0, 10) },
      ],
      groupFa,
    ).filter((g) => g.requestIds.includes('NEW'));

    const seq = (await this.prisma.tender.count()) + 99;
    const code = `${dto.budgetCode.slice(0, 2).toUpperCase()}-PRJ-${String(seq).padStart(4, '0')}`;
    const stageKeys = this.stageKeysFor(methodId);
    // optional per-stage planned dates from the request wizard (only for real stage keys)
    const planByKey = new Map((dto.stagePlan ?? []).map((p) => [p.key, p]));

    const tender = await this.prisma.tender.create({
      data: {
        code,
        titleAr: dto.titleAr,
        titleEn: dto.titleEn,
        budgetCode: dto.budgetCode,
        estimatedValueUSD: dto.estimatedValueUSD,
        method: METHOD_ENUM[methodId] as never,
        scope: (dto.scope ?? 'OTHER') as never, // §9 work scope — drives C8.1/C8.2 with above-authority
        overrideJustification: dto.overrideJustification?.trim() || null,
        operatorId,
        fieldId: dto.fieldId,
        stages: {
          create: stageKeys.map((key, order) => {
            const p = planByKey.get(key);
            return {
              key,
              order,
              ...(p?.plannedFrom ? { plannedFrom: new Date(p.plannedFrom) } : {}),
              ...(p?.plannedTo ? { plannedTo: new Date(p.plannedTo) } : {}),
            };
          }),
        },
        ...(dto.estimatedValueUSD > fa
          ? { mct: { create: { notifiedOn: new Date(), lcEstimateUSD: dto.estimatedValueUSD } } }
          : {}),
      },
    });

    await this.audit.record(user.userId, 'CREATE_TENDER', tender.code);
    if (splitRisk.length > 0) {
      await this.audit.record(user.userId, 'SPLIT_RISK_FLAGGED', `${tender.code} (7.2)`);
    }
    // a single budget code spanning two fields of one operator is itself an anomaly (miscoding or evasion)
    if (spansMultipleFields) {
      await this.audit.record(user.userId, 'BUDGET_SPANS_FIELDS', `${tender.code}: ${dto.budgetCode} (7.2)`);
    }
    return { tender, suggestion, splitRisk };
  }

  async publishAnnouncement(user: AuthUser, id: string) {
    const tender = await this.loadScopedActive(user, id);
    const a = tender.announcement;
    if (!a) throw new BadRequestException('No announcement configured');
    if (a.publishedOn) return presentTender(tender, user); // idempotent

    const result = checkAnnouncement({
      mode: a.mode.toLowerCase() as AnnouncementMode,
      periodDays: a.periodDays,
      newspapers: a.newspapers,
      publishedOnLcWebsite: a.lcWebsite,
      publishedOnRocWebsite: a.rocWebsite,
      inviteeCount: a.inviteeCount,
      inviteesPreQualified: a.inviteesPreQualified,
    });
    if (!result.ok) {
      // refused attempt is still audited (8.1-e)
      await this.audit.record(user.userId, 'PUBLISH_REFUSED', tender.code);
      throw new BadRequestException({ message: 'Pre-publish checks failed', checks: result.checks });
    }
    // §9 C8.1 — when the state-company requirement applies (above authority in a covered scope), the
    // tender documents must carry the 20% participation clause before publication (a drafting duty).
    // Only a covered scope with the clause NOT yet affixed can refuse — resolve authority only then.
    const scope = (tender.scope ?? 'OTHER') as LocalContentScope;
    if (scope !== 'OTHER' && !tender.localContentClauseAffixed) {
      const field = await this.prisma.field.findUnique({ where: { id: tender.fieldId }, include: { serviceContract: true } });
      const fa = contractFinancialAuthority(field?.serviceContract ? { ...field.serviceContract, financialAuthorityUSD: Number(field.serviceContract.financialAuthorityUSD) } : null);
      const aboveFA = fa == null || Number(tender.estimatedValueUSD) > fa; // fail closed
      if (localContentApplies(scope, aboveFA)) {
        await this.audit.record(user.userId, 'PUBLISH_REFUSED', `${tender.code} (§9 C8.1)`);
        throw new BadRequestException({ message: 'The 20% local-content clause must be affixed to the documents before publication', clause: 'C8.1' });
      }
    }
    await this.prisma.announcement.update({ where: { tenderId: id }, data: { publishedOn: new Date() } });
    await this.audit.record(user.userId, 'PUBLISH_ANNOUNCEMENT', tender.code);
    return this.presented(user, id);
  }

  async setPrice(user: AuthUser, id: string, bidderId: string, priceUSD: number) {
    const tender = await this.loadScopedActive(user, id);
    const bidder = tender.bidders.find((b) => b.id === bidderId);
    if (!bidder) throw new NotFoundException('Bidder not found');

    const step = EVAL_STEPS[Math.min(Math.max(tender.evaluationStep, 0), 3)]!;
    // price column locked until technical pass + commercial step (12.4.2) — binding here
    if (!isPriceVisible(step, { technicalResult: bidder.technicalResult?.toLowerCase() as 'pass' | 'fail' | undefined })) {
      await this.audit.record(user.userId, 'SET_PRICE_REFUSED', `${tender.code}/${bidderId}`);
      throw new ForbiddenException('Price locked: bidder not technically qualified or not in a commercial step (12.4.2)');
    }
    await this.prisma.bidder.update({ where: { id: bidderId }, data: { priceUSD } });
    await this.audit.record(user.userId, 'SET_PRICE', `${tender.code}/${bidderId}`);
    return this.presented(user, id);
  }

  async completeStage(user: AuthUser, id: string, dto: CompleteStageDto) {
    const tender = await this.loadScopedActive(user, id);
    const stage = tender.stages.find((s) => s.key === dto.stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) return presentTender(tender, user); // already closed

    const uploaded = stage.documents.map((d) => d.kind);
    // §9 C8.8 — a tender whose AWARDED bidder declared imported critical materials cannot close its
    // `sign` stage without the ministry-body inspection and certified-origin documents (10.6.17/19).
    const winner = lowestQualified(tender.bidders.map((b) => ({ id: b.id, technicalResult: b.technicalResult?.toLowerCase() as 'pass' | 'fail' | undefined, priceUSD: b.priceUSD == null ? undefined : Number(b.priceUSD) })));
    const relevant = winner ? tender.bidders.filter((b) => b.id === winner.id) : tender.bidders;
    const hasImportedCritical = relevant.some((b) => (b.materials ?? []).some((m) => m.imported));
    const required = [...requiredDocsFor(stage.key), ...(stage.key === 'sign' && hasImportedCritical ? criticalImportDocs(true) : [])];
    const gate = stageCanClose(required, uploaded);
    if (!gate.ok) {
      await this.audit.record(user.userId, 'COMPLETE_STAGE_REFUSED', tender.code);
      throw new BadRequestException({ message: 'Stage cannot close without required documents', missing: gate.missing });
    }
    // D1 — the deviation reason is category + detail as ONE record: one half alone is neither
    // classifiable nor explained, so it is refused rather than half-stored.
    if ((dto.devReasonCat == null) !== (dto.devReasonNote == null)) {
      throw new BadRequestException('devReason requires both category and note');
    }
    await this.prisma.stage.update({
      where: { id: stage.id },
      data: {
        actualTo: new Date(dto.actualTo),
        ...(dto.actualFrom ? { actualFrom: new Date(dto.actualFrom) } : {}),
        ...(dto.devReasonCat ? { devReasonCat: dto.devReasonCat, devReasonNote: dto.devReasonNote } : {}),
      },
    });
    await this.audit.record(user.userId, 'COMPLETE_STAGE', `${tender.code}/${stage.key}`);
    return this.presented(user, id);
  }

  /** Current (first not-yet-closed) stage. */
  private currentStageKey(stages: { key: string; order: number; actualTo: Date | null }[]): string | undefined {
    return [...stages].sort((a, b) => a.order - b.order).find((s) => !s.actualTo)?.key;
  }

  /* ---- intra-stage editor mutations (the detail screen edits; not SCPP-gated) ---- */

  async planStage(user: AuthUser, id: string, stageKey: string, plannedFrom?: string, plannedTo?: string) {
    const tender = await this.loadScopedActive(user, id);
    const stage = tender.stages.find((s) => s.key === stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) throw new BadRequestException('Closed stage cannot be re-planned');
    await this.prisma.stage.update({
      where: { id: stage.id },
      data: {
        ...(plannedFrom ? { plannedFrom: new Date(plannedFrom) } : {}),
        ...(plannedTo ? { plannedTo: new Date(plannedTo) } : {}),
      },
    });
    return this.presented(user, id);
  }

  async patchAnnouncement(user: AuthUser, id: string, patch: Record<string, unknown>) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.announcement) throw new BadRequestException('No announcement');
    if (tender.announcement.publishedOn) throw new BadRequestException('Published announcement is locked');
    const data: Record<string, unknown> = { ...patch };
    if (typeof patch.mode === 'string') data.mode = patch.mode.toUpperCase();
    await this.prisma.announcement.update({ where: { tenderId: id }, data });
    return this.presented(user, id);
  }

  async setEvalStep(user: AuthUser, id: string, step: number) {
    await this.loadScopedActive(user, id);
    await this.prisma.tender.update({ where: { id }, data: { evaluationStep: Math.min(Math.max(step, 0), 3) } });
    return this.presented(user, id);
  }

  async addBidder(user: AuthUser, id: string, name: string, vendorId?: string, submittedAt?: string) {
    const tender = await this.loadScopedActive(user, id);
    if (vendorId) {
      // 10.4 eligibility gate — suspended/blacklisted/in-dispute or an active 14.3 ban is refused
      const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor) throw new NotFoundException('Vendor not found');
      const elig = vendorEligible({ suspended: vendor.suspended, blacklisted: vendor.blacklisted, inDispute: vendor.inDispute });
      const banned = !!vendor.banUntil && vendor.banUntil > new Date();
      if (!elig.ok || banned) {
        await this.audit.record(user.userId, 'ADD_BIDDER_REFUSED', `${tender.code}/${vendorId} (10.4)`);
        throw new ForbiddenException({ message: 'Vendor not eligible', reasons: [...elig.reasons, ...(banned ? ['banned (14.3)'] : [])], clause: '10.4' });
      }
    }
    // late-bid gate (10.6.1) — mirrors the client reducer. The closing is derived per method:
    //   • a closing exists → a recorded submission after it is late; once the window has CLOSED a
    //     submission date is mandatory (the gate must be automatic, not bypassable by omission).
    //   • no closing on a PUBLIC method → awaited publication, a timestamped bid can't be validated.
    //   • no closing by method (limited/direct) → recorded for provenance, no gate (10.6.1 n/a).
    const closing = await this.bidClosingAt(tender.announcement);
    const sub = submittedAt?.slice(0, 10);
    const refuseLate = async () => {
      await this.audit.record(user.userId, 'ADD_BIDDER_REFUSED', `${tender.code}/${name} (10.6.1)`);
      throw new ForbiddenException({ message: 'Late bid', clause: '10.6.1' });
    };
    if (closing != null) {
      if (sub) {
        if (isLateBidByDate(sub, closing)) await refuseLate();
      } else if (new Date().toISOString().slice(0, 10) > closing) {
        await refuseLate(); // bidding has closed — a submission date is required to admit a bid
      }
    } else if (tender.announcement?.mode === 'PUBLIC' && sub) {
      await refuseLate(); // announced method, not yet published — nothing to validate against
    }
    await this.prisma.bidder.create({
      data: { tenderId: id, name, docsOk: true, bondOk: true, ...(vendorId ? { vendorId } : {}), ...(sub ? { submittedAt: new Date(sub) } : {}) },
    });
    await this.audit.record(user.userId, 'ADD_BIDDER', `${tender.code}/${name}`);
    return this.presented(user, id);
  }

  /** The derived bid-closing DATE (§11.3.4-e) for a published announcement — day-granular (10.6.1
   *  is a date rule), the last open day being publishedOn + (periodDays − 1), rolled past a
   *  weekend/holiday to the next working day. Null before publication. */
  private async bidClosingAt(announcement: { publishedOn: Date | null; periodDays: number } | null): Promise<string | null> {
    if (!announcement?.publishedOn) return null;
    const planned = addCalendarDays(announcement.publishedOn.toISOString().slice(0, 10), Math.max(announcement.periodDays - 1, 0));
    return effectiveClosingDate(planned, await this.calendar.getCalendar());
  }

  async setTechnical(user: AuthUser, id: string, bidderId: string, result: 'pass' | 'fail') {
    const tender = await this.loadScopedActive(user, id);
    const bidder = tender.bidders.find((b) => b.id === bidderId);
    if (!bidder) throw new NotFoundException('Bidder not found');
    // §9 C8.6 (10.6.18) — a bidder cannot be marked technically qualified while any imported critical
    // material in its declarations fails the origin gate. Mirrors the client reducer; 'fail' is free.
    if (result === 'pass') {
      const decls: MaterialDeclaration[] = (bidder.materials ?? []).map((m) => ({ materialId: m.materialId, imported: m.imported, origin: m.origin ?? undefined, oemAuthorizedFrom: m.oemAuthorizedFrom ?? undefined, onMooList: m.onMooList }));
      if (bidderOriginBlocker(decls)) {
        await this.audit.record(user.userId, 'SET_TECHNICAL_REFUSED', `${tender.code}/${bidderId} (10.6.18)`);
        throw new BadRequestException({ message: 'An imported critical material fails the approved-origin gate', clause: '10.6.18' });
      }
    }
    await this.prisma.bidder.update({ where: { id: bidderId }, data: { technicalResult: result.toUpperCase() as 'PASS' | 'FAIL' } });
    return this.presented(user, id);
  }

  /**
   * §9 C8.1 — record the operator's attestation that the tender documents carry the 20%
   * participation clause. Mirrors the client reducer's guards (store.tsx SET_LC_CLAUSE), in order:
   *   (a) only a tender the requirement REACHES has a clause to affix — attesting on a tender §9
   *       does not reach would fabricate a compliance record, so it is refused (attempt audited);
   *   (b) once published the documents are in the market: a correction is a corrective
   *       announcement, never a retroactive flip of the attestation publication was gated on;
   *   (c) an identical value writes nothing and audits nothing — an attestation restated is not
   *       a new governance act.
   * The reducer refuses silently (its call sites gate the control); the API refuses LOUDLY with
   * the audited attempt, which is the established idiom here (publishAnnouncement, setPrice).
   */
  async setLocalContentClause(user: AuthUser, id: string, affixed: boolean) {
    const tender = await this.loadScopedActive(user, id);

    // (a) does §9 reach this tender? Resolve authority only for a covered scope — an OTHER-scope
    // tender can never be reached, so no field/contract query is needed to know that.
    const scope = (tender.scope ?? 'OTHER') as LocalContentScope;
    let applies = false;
    if (scope !== 'OTHER') {
      const field = await this.prisma.field.findUnique({ where: { id: tender.fieldId }, include: { serviceContract: true } });
      const fa = contractFinancialAuthority(field?.serviceContract ? { ...field.serviceContract, financialAuthorityUSD: Number(field.serviceContract.financialAuthorityUSD) } : null);
      const aboveFA = fa == null || Number(tender.estimatedValueUSD) > fa; // fail closed, as at publish
      applies = localContentApplies(scope, aboveFA);
    }
    if (!applies) {
      await this.audit.record(user.userId, 'SET_LC_CLAUSE_REFUSED', `${tender.code} (§9 C8.1 does not apply)`);
      throw new BadRequestException({ message: 'The 20% participation requirement does not apply to this tender — there is no clause to attest', clause: 'C8.1' });
    }

    // (b) published documents are already in the market
    if (tender.announcement?.publishedOn) {
      await this.audit.record(user.userId, 'SET_LC_CLAUSE_REFUSED', `${tender.code} (already published)`);
      throw new BadRequestException({ message: 'The announcement is published — the clause attestation can no longer be changed', clause: 'C8.1' });
    }

    // (c) no change → no write, no audit row
    if (tender.localContentClauseAffixed === affixed) return presentTender(tender, user);

    await this.prisma.tender.update({ where: { id }, data: { localContentClauseAffixed: affixed } });
    await this.audit.record(user.userId, 'SET_LC_CLAUSE', `${tender.code} (${affixed ? 'affixed' : 'withdrawn'})`);
    return this.presented(user, id);
  }

  /** §9 C8.2 — record a state company's response (governed: a documented reason ≥20 chars). A
   *  `declined` response carries the reason as the evidence that makes non-participation lawful. */
  async setStateResponse(user: AuthUser, id: string, company: string, status: string, reason: string) {
    const tender = await this.loadScopedActive(user, id);
    if (!reason || reason.trim().length < 20) throw new BadRequestException('A documented reason (≥20 chars) is required');
    const evidence = status === 'declined' ? reason.trim() : null;
    await this.prisma.stateCompanyResponse.upsert({
      where: { tenderId_company: { tenderId: id, company } },
      create: { tenderId: id, company, status: status.toUpperCase() as never, evidence, by: user.name, byUserId: user.userId },
      update: { status: status.toUpperCase() as never, evidence, by: user.name, byUserId: user.userId },
    });
    await this.audit.record(user.userId, 'SET_STATE_RESPONSE', `${tender.code}/${company}`);
    return this.presented(user, id);
  }

  /** §9 C8.6 — replace a bidder's per-material origin declarations (read by the technical-eval gate). */
  async setBidderMaterials(user: AuthUser, id: string, bidderId: string, materials: MaterialDeclaration[]) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.bidders.some((b) => b.id === bidderId)) throw new NotFoundException('Bidder not found');
    await this.prisma.$transaction([
      this.prisma.bidderMaterialDeclaration.deleteMany({ where: { bidderId } }),
      this.prisma.bidderMaterialDeclaration.createMany({
        data: materials.map((m) => ({ bidderId, materialId: m.materialId, imported: m.imported, origin: m.origin ?? null, oemAuthorizedFrom: m.oemAuthorizedFrom ?? null, onMooList: m.onMooList ?? false })),
      }),
    ]);
    await this.audit.record(user.userId, 'SET_BIDDER_MATERIALS', `${tender.code}/${bidderId}`);
    return this.presented(user, id);
  }

  async toggleDoc(user: AuthUser, id: string, stageKey: string, doc: string) {
    const tender = await this.loadScopedActive(user, id);
    const stage = tender.stages.find((s) => s.key === stageKey);
    if (!stage) throw new NotFoundException('Stage not found');
    if (stage.actualTo) throw new BadRequestException('Closed stage');
    const existing = stage.documents.find((d) => d.kind === doc);
    if (existing) {
      await this.prisma.document.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.document.create({ data: { stageId: stage.id, kind: doc, fileUrl: `mock://${doc}` } });
    }
    return this.presented(user, id);
  }

  /**
   * The ق1 ladder as an AUTHORITY gate: does this session's body reach the band this request sits
   * in? Refused with 403 and audited (8.1-e), because an attempt to sign somebody else's band is
   * exactly the act the trail exists to preserve.
   *
   * Checked BEFORE the merits (already-decided, stage, §15.3, the ±20% band): whether the caller
   * may decide at all precedes what the decision would be — and a body with no authority here must
   * not learn the award figures by probing the endpoint.
   *
   * ── THE AUTHORITATIVE LADDER ────────────────────────────────────────────────────────────────
   * `DEFAULT_APPROVAL_TIERS` IS the server's own ladder, not a borrowed default: this gate reads
   * it directly, so what it says is what a request is actually judged against. There is no server
   * tiers model and no endpoint that moves the two ceilings, so this constant is the whole of the
   * server's persisted source — it has nothing else to read.
   *
   * The client reads `state.approvalTiers` (apps/web/src/store.tsx), seeded from `SEED_APPROVAL_TIERS`
   * which is a re-export of this same constant. TODAY the two are the same object, so the button and
   * the 403 can never disagree. That equality is an INVARIANT, not a coincidence, and it is pinned:
   *   · apps/api/test/tenders.service.spec.ts — «the ladder this gate reads is the engine's»
   *   · apps/web/test/jmcRole.test.ts        — SEED_APPROVAL_TIERS === DEFAULT_APPROVAL_TIERS
   *
   * NAMED DEBT (ops/CLIENT-FEEDBACK-PLAN.md, phase 1 — ONE debt, two halves): the day a governed
   * action lets an admin move the ceilings, the client's ladder becomes editable state while this
   * gate still reads a constant, and they diverge. Whoever lands that action must move BOTH sites —
   * this one and store.tsx SEED_APPROVAL_TIERS — or the drift alarms above will fail, which is
   * exactly what they are for.
   */
  private async assertTierAuthority(
    user: AuthUser,
    tender: { code: string; estimatedValueUSD?: unknown },
    act: 'RATIFY' | 'RETURN_WITH_NOTES',
  ) {
    // an unreadable estimate resolves to MDOC — the highest gate (approvalTierFor fails closed)
    const tier = approvalTierFor(Number(tender.estimatedValueUSD), DEFAULT_APPROVAL_TIERS);
    if (mayRatifyTier(user.role, tier)) return;
    await this.audit.record(user.userId, `${act}_REFUSED`, `${tender.code} (tier ${tier})`);
    throw new ForbiddenException({
      message: `This decision belongs to the ${tier} tier and your role does not reach it`,
      tier,
    });
  }

  async ratify(user: AuthUser, id: string) {
    const tender = await this.loadScopedActive(user, id);
    await this.assertTierAuthority(user, tender, 'RATIFY');
    const existing = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
    if (existing) throw new BadRequestException('Already decided');
    if (this.currentStageKey(tender.stages) !== 'ratify') {
      throw new BadRequestException('Tender is not at the ratification stage');
    }
    // §15.3 hard block — a lone bid advertised under 21 days may NOT be awarded; the remedy is to
    // re-advertise, not to ratify. Refused (audited) before the award band is even considered.
    if (tender.announcement && !singleBidAcceptable(tender.bidders.length, tender.announcement.periodDays).ok) {
      await this.audit.record(user.userId, 'RATIFY_REFUSED', `${tender.code} (15.3)`);
      throw new BadRequestException({ message: 'A single bid needs a ≥21-day advertising period to be acceptable', clause: '15.3' });
    }
    // the ±20% award band is binding at ratification (6.9.3), on the accredited estimate (6.9)
    await this.assertAwardBand(user, tender);
    // store BOTH the mutable display name and the immutable identity (the JWT principal) —
    // attribution never rides on a name that can later change.
    const r = await this.prisma.ratification.create({ data: { tenderId: id, status: 'RATIFIED', by: user.name, byUserId: user.userId } });
    await this.audit.record(user.userId, 'RATIFY', tender.code);
    return r;
  }

  /** Refuse ratification when the MCT cycle is unresolved or the lowest qualified bid breaches ±20% (6.9.1/6.9.2/6.9.3). */
  private async assertAwardBand(
    user: AuthUser,
    tender: {
      code: string;
      estimatedValueUSD: unknown;
      mct: { notifiedOn: Date; meetingHeldOn: Date | null; agreementReachedOn: Date | null; lcEstimateUSD: unknown; mctEstimateUSD: unknown | null; agreedEstimateUSD: unknown | null } | null;
      bidders: { id: string; technicalResult: string | null; priceUSD: unknown }[];
    },
  ) {
    const today = new Date().toISOString().slice(0, 10);
    let accredited = Number(tender.estimatedValueUSD);
    if (tender.mct) {
      const m = tender.mct;
      const status = mctCycleStatus({
        notifiedOn: iso(m.notifiedOn)!,
        meetingHeldOn: iso(m.meetingHeldOn),
        agreementReachedOn: iso(m.agreementReachedOn),
        asOf: today,
        calendar: await this.calendar.getCalendar(),
      });
      if (status.prevailingEstimate === 'PENDING') {
        await this.audit.record(user.userId, 'RATIFY_REFUSED', `${tender.code} (6.9)`);
        throw new BadRequestException('MCT cost cycle is still pending — award cannot be ratified (6.9)');
      }
      accredited =
        status.prevailingEstimate === 'AGREED' && m.agreedEstimateUSD != null ? Number(m.agreedEstimateUSD)
        : status.prevailingEstimate === 'MCT' && m.mctEstimateUSD != null ? Number(m.mctEstimateUSD)
        : Number(m.lcEstimateUSD);
    }
    const lowest = lowestQualified(
      tender.bidders.map((b) => ({ id: b.id, technicalResult: b.technicalResult?.toLowerCase() as 'pass' | 'fail' | undefined, priceUSD: b.priceUSD == null ? undefined : Number(b.priceUSD) })),
    );
    if (lowest?.priceUSD != null && accredited > 0) {
      const verdict = awardVerdict(lowest.priceUSD, accredited);
      if (verdict.action !== 'award') {
        await this.audit.record(user.userId, 'RATIFY_REFUSED', `${tender.code} (${verdict.clause})`);
        throw new BadRequestException({ message: verdict.en, clause: verdict.clause, deltaPct: verdict.deltaPct });
      }
    }
  }

  async returnWithNotes(user: AuthUser, id: string, notes: string) {
    const tender = await this.loadScopedActive(user, id);
    // returning with notes is the SAME seat as ratifying — a refusal to approve is a decision on
    // the file, so it answers to the same band authority rather than being the unguarded way in.
    await this.assertTierAuthority(user, tender, 'RETURN_WITH_NOTES');
    const existing = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
    if (existing) throw new BadRequestException('Already decided');
    if (!notes.trim()) throw new BadRequestException('Notes are required to return');
    if (this.currentStageKey(tender.stages) !== 'ratify') {
      throw new BadRequestException('Tender is not at the ratification stage');
    }
    const r = await this.prisma.ratification.create({ data: { tenderId: id, status: 'RETURNED', by: user.name, byUserId: user.userId, notes: notes.trim() } });
    await this.audit.record(user.userId, 'RETURN_WITH_NOTES', tender.code);
    return r;
  }

  /* ---- MCT cost cycle mutations (6.9.1 / 6.9.2 / 6.9.4) ---- */

  async recordMctMeeting(user: AuthUser, id: string, meetingHeldOn: string) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.mct) throw new NotFoundException('Tender is not in the MCT cycle');
    if (tender.mct.meetingHeldOn) throw new BadRequestException('Meeting already recorded');
    if (meetingHeldOn < iso(tender.mct.notifiedOn)!) throw new BadRequestException('Meeting cannot precede the notification');
    const status = mctCycleStatus({ notifiedOn: iso(tender.mct.notifiedOn)!, meetingHeldOn, asOf: meetingHeldOn, calendar: await this.calendar.getCalendar() });
    await this.prisma.mctCase.update({ where: { tenderId: id }, data: { meetingHeldOn: new Date(meetingHeldOn) } });
    await this.audit.record(user.userId, 'MCT_MEETING_RECORDED', `${tender.code}${status.meetingOnTime === false ? ' (late — LC prevails, 6.9.2)' : ''}`);
    return this.presented(user, id);
  }

  async recordMctAgreement(user: AuthUser, id: string, agreementReachedOn: string, agreedEstimateUSD: number) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.mct) throw new NotFoundException('Tender is not in the MCT cycle');
    if (!tender.mct.meetingHeldOn) throw new BadRequestException('Record the meeting first');
    // an agreement is only valid if the cycle actually resolves to AGREED (meeting on time, within 21 WD)
    const status = mctCycleStatus({
      notifiedOn: iso(tender.mct.notifiedOn)!,
      meetingHeldOn: iso(tender.mct.meetingHeldOn),
      agreementReachedOn,
      asOf: agreementReachedOn,
      calendar: await this.calendar.getCalendar(),
    });
    if (status.prevailingEstimate !== 'AGREED') {
      await this.audit.record(user.userId, 'MCT_AGREEMENT_REFUSED', `${tender.code} (${status.clause ?? '6.9.1'})`);
      throw new BadRequestException('Agreement out of the 6.9.1/6.9.2 window — it cannot prevail');
    }
    await this.prisma.mctCase.update({ where: { tenderId: id }, data: { agreementReachedOn: new Date(agreementReachedOn), agreedEstimateUSD } });
    await this.audit.record(user.userId, 'MCT_AGREEMENT_RECORDED', tender.code);
    return this.presented(user, id);
  }

  async setMctEstimate(user: AuthUser, id: string, mctEstimateUSD: number) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.mct) throw new NotFoundException('Tender is not in the MCT cycle');
    if (tender.mct.agreedEstimateUSD != null) throw new BadRequestException('Agreement already reached — MCT estimate is fixed');
    await this.prisma.mctCase.update({ where: { tenderId: id }, data: { mctEstimateUSD } });
    await this.audit.record(user.userId, 'MCT_ESTIMATE_SET', tender.code);
    return this.presented(user, id);
  }

  async notifyMctFinal(user: AuthUser, id: string) {
    const tender = await this.loadScopedActive(user, id);
    if (!tender.mct) throw new NotFoundException('Tender is not in the MCT cycle');
    const ratification = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
    if (ratification?.status !== 'RATIFIED') {
      await this.audit.record(user.userId, 'MCT_FINAL_NOTIFY_REFUSED', tender.code);
      throw new BadRequestException('Final value is notified only after ratification (6.9.4)');
    }
    if (tender.mct.finalValueNotified) return this.presented(user, id); // idempotent
    await this.prisma.mctCase.update({ where: { tenderId: id }, data: { finalValueNotified: true } });
    await this.audit.record(user.userId, 'MCT_FINAL_NOTIFIED', `${tender.code} (6.9.4)`);
    return this.presented(user, id);
  }

  /* ---- tender governance (cancel / suspend / resume) — documented, never deleted ---- */

  async changeStatus(user: AuthUser, id: string, to: 'CANCELLED' | 'SUSPENDED' | 'ACTIVE', justification: string) {
    const tender = await this.loadScoped(user, id); // status changes act on non-active tenders too
    if (to === 'CANCELLED') {
      const contract = await this.prisma.contract.findUnique({ where: { tenderId: id } });
      const ratified = await this.prisma.ratification.findUnique({ where: { tenderId: id } });
      if (contract || ratified?.status === 'RATIFIED') {
        await this.audit.record(user.userId, 'TENDER_CANCEL_REFUSED', tender.code);
        throw new BadRequestException('An awarded tender cannot be cancelled');
      }
      if (tender.status === 'CANCELLED') throw new BadRequestException('Already cancelled');
    }
    if (to === 'SUSPENDED' && tender.status !== 'ACTIVE') throw new BadRequestException('Only an active tender can be suspended');
    if (to === 'ACTIVE' && tender.status !== 'SUSPENDED') throw new BadRequestException('Only a suspended tender can be resumed');

    await this.prisma.tender.update({ where: { id }, data: { status: to, statusReason: justification, statusChangedOn: new Date(), statusChangedBy: user.name, statusChangedByUserId: user.userId } });
    const action = to === 'CANCELLED' ? 'TENDER_CANCEL' : to === 'SUSPENDED' ? 'TENDER_SUSPEND' : 'TENDER_RESUME';
    await this.audit.record(user.userId, action, `${tender.code}: ${justification.slice(0, 80)}`);
    return this.presented(user, id);
  }

  private stageKeysFor(methodId: number): string[] {
    const ALL = ['cost', 'approval', 'preq', 'announce', 'invite', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
    switch (methodId) {
      case 7:
        return ALL.filter((k) => k !== 'preq' && k !== 'invite');
      case 6:
      case 4:
        return ALL.filter((k) => k !== 'announce');
      case 3:
        return ['cost', 'approval', 'invite', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
      case 1:
      case 2:
        return ['cost', 'approval', 'comm-analysis', 'ratify', 'sign'];
      default:
        return ALL;
    }
  }
}
