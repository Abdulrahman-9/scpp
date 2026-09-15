import type {
  AnnouncementMode,
} from '@masaar/scpp-rules';
import type {
  AnnouncementState,
  AuditEntry,
  BidderState,
  ContractStageKey,
  ContractState,
  GuaranteeState,
  MctState,
  RatificationState,
  StageState,
  Tender,
  TenderLifecycle,
  UserAccount,
  VendorState,
} from '../store';
import type { ApiRole } from '../session';
import type {
  ApiAnnouncement,
  ApiAudit,
  ApiBidder,
  ApiContract,
  ApiMct,
  ApiMethod,
  ApiStage,
  ApiUser,
  ApiTender,
  ApiVendor,
  Num,
} from './types';

const num = (v: Num | null | undefined): number => (v == null ? 0 : typeof v === 'number' ? v : Number(v));
const date = (v: string | null | undefined): string | undefined => (v ? v.slice(0, 10) : undefined);

const METHOD_ID: Record<ApiMethod, number> = {
  SOLE_SOURCE: 1,
  LOW_VALUE: 2,
  FAST_TRACK: 3,
  DIRECT: 4,
  RFP: 5,
  LIMITED: 6,
  PUBLIC: 7,
  TWO_PHASED: 8,
};

function mapStage(s: ApiStage): StageState {
  return {
    key: s.key,
    plannedFrom: date(s.plannedFrom),
    plannedTo: date(s.plannedTo),
    actualFrom: date(s.actualFrom ?? null),
    actualTo: date(s.actualTo),
    uploadedDocs: s.documents.map((d) => d.kind),
    // D1 — both halves or nothing, the same pairing the server enforces on write
    ...(s.devReasonCat && s.devReasonNote ? { devReason: { cat: s.devReasonCat, note: s.devReasonNote } } : {}),
  };
}

function mapAnnouncement(a: ApiAnnouncement | null, methodId: number): AnnouncementState {
  const mode = (a?.mode.toLowerCase() ?? (methodId === 4 ? 'direct' : methodId === 6 ? 'limited' : 'public')) as AnnouncementMode;
  const papers = a?.newspapers ?? [];
  return {
    mode,
    periodDays: a?.periodDays ?? (mode === 'public' ? 21 : 14),
    newspapers: [papers[0] ?? '', papers[1] ?? '', papers[2] ?? ''],
    lcWebsite: a?.lcWebsite ?? false,
    rocWebsite: a?.rocWebsite ?? false,
    inviteeCount: a?.inviteeCount ?? 0,
    inviteesPreQualified: a?.inviteesPreQualified ?? false,
    publishedOn: date(a?.publishedOn),
  };
}

function mapBidder(b: ApiBidder): BidderState {
  return {
    id: b.id,
    name: b.name,
    docsOk: b.docsOk,
    bondOk: b.bondOk,
    technicalResult: b.technicalResult ? (b.technicalResult.toLowerCase() as 'pass' | 'fail') : undefined,
    priceUSD: b.priceUSD == null ? undefined : num(b.priceUSD),
    ...(b.submittedAt ? { submittedAt: b.submittedAt.slice(0, 10) } : {}),
    ...(b.materials && b.materials.length
      ? { materials: b.materials.map((m) => ({ materialId: m.materialId, imported: m.imported, origin: m.origin ?? undefined, oemAuthorizedFrom: m.oemAuthorizedFrom ?? undefined, onMooList: m.onMooList ?? false })) }
      : {}),
  };
}

function mapMct(m: ApiMct | null): MctState | undefined {
  if (!m) return undefined;
  return {
    notifiedOn: date(m.notifiedOn)!,
    meetingHeldOn: date(m.meetingHeldOn),
    agreementReachedOn: date(m.agreementReachedOn),
    lcEstimateUSD: num(m.lcEstimateUSD),
    mctEstimateUSD: m.mctEstimateUSD == null ? undefined : num(m.mctEstimateUSD),
    agreedEstimateUSD: m.agreedEstimateUSD == null ? undefined : num(m.agreedEstimateUSD),
  };
}

export function mapTender(t: ApiTender): Tender {
  const methodId = METHOD_ID[t.method];
  const ratification: RatificationState | undefined = t.ratification
    ? { status: t.ratification.status.toLowerCase() as 'ratified' | 'returned', by: t.ratification.by, on: date(t.ratification.on)!, notes: t.ratification.notes ?? undefined }
    : undefined;
  const lifecycle: TenderLifecycle | undefined =
    t.status && t.status !== 'ACTIVE'
      ? { status: t.status.toLowerCase() as 'cancelled' | 'suspended', reason: t.statusReason ?? '', on: date(t.statusChangedOn) ?? '', by: t.statusChangedBy ?? '' }
      : undefined;
  return {
    id: t.id,
    code: t.code,
    title: { ar: t.titleAr, en: t.titleEn },
    budgetCode: t.budgetCode,
    estimatedValueUSD: num(t.estimatedValueUSD),
    methodId,
    overrideJustification: t.overrideJustification ?? undefined,
    createdOn: date(t.createdOn)!,
    stages: [...t.stages].sort((a, b) => a.order - b.order).map(mapStage),
    announcement: mapAnnouncement(t.announcement, methodId),
    evaluationStep: t.evaluationStep,
    bidders: t.bidders.map(mapBidder),
    mct: mapMct(t.mct),
    ratification,
    lifecycle,
    ...(t.scope && t.scope !== 'OTHER' ? { scope: t.scope } : { scope: 'OTHER' }),
    ...(t.localContentClauseAffixed ? { localContentClauseAffixed: true } : {}),
    ...(t.stateResponses && t.stateResponses.length
      ? { stateResponses: t.stateResponses.map((r) => ({ company: r.company, status: r.status.toLowerCase() as 'accepted' | 'pending' | 'declined', ...(r.evidence ? { evidence: r.evidence } : {}) })) }
      : {}),
  };
}

export function mapContract(c: ApiContract): ContractState {
  const guarantees: GuaranteeState[] = c.guarantees.map((g) => ({
    kind: g.kind === 'BID_BOND' ? 'bid-bond' : g.kind === 'PERFORMANCE' ? 'performance' : 'advance',
    valueUSD: num(g.valueUSD),
    expiresOn: date(g.expiresOn)!,
  }));
  return {
    id: c.id,
    code: c.code,
    title: { ar: c.tender?.titleAr ?? c.code, en: c.tender?.titleEn ?? c.code },
    contractorName: c.contractorName ?? c.vendor?.name ?? '—',
    // cross-record link keys — undefined when the server relation is unset (honestly unlinked)
    tenderId: c.tenderId ?? undefined,
    vendorId: c.vendorId ?? c.vendor?.id ?? undefined,
    signedOn: date(c.signedOn) ?? '',
    valueUSD: num(c.valueUSD),
    termDays: c.termDays,
    voTotalUSD: c.vos.reduce((s, v) => s + num(v.valueUSD), 0),
    extensionDays: c.extensions.reduce((s, e) => s + e.days, 0),
    ldTotalUSD: c.lds.reduce((s, l) => s + num(l.valueUSD), 0),
    suspensionDays: 0, // not modelled server-side yet
    guarantees,
    stages: (c.stages ?? []).map((s) => ({
      key: s.key as ContractStageKey,
      plannedTo: date(s.plannedTo) ?? undefined,
      actualTo: date(s.actualTo) ?? undefined,
    })),
  };
}

export function mapVendor(v: ApiVendor): VendorState {
  return {
    id: v.id,
    name: v.name,
    mooListed: v.mooListed,
    suspended: v.suspended || undefined,
    blacklisted: v.blacklisted || undefined,
    inDispute: v.inDispute || undefined,
    banUntil: date(v.banUntil),
    banReason: v.banReason ? { ar: v.banReason, en: v.banReason } : undefined,
    techScore: v.techScore ?? 0,
    financialScore: v.financialScore ?? 0,
    hseScore: v.hseScore ?? 0,
  };
}

export function mapAudit(a: ApiAudit): AuditEntry {
  return { ts: a.ts, action: a.action, target: a.target };
}

/** The server is the authority on roles; an unknown value would be a schema drift, so it is kept as-is. */
export function mapUser(u: ApiUser): UserAccount {
  return {
    id: u.id,
    azureOid: u.azureOid,
    name: u.name,
    email: u.email,
    role: u.role as ApiRole,
    operatorId: u.operatorId ?? undefined,
    twoFa: u.twoFa,
    disabled: u.disabled,
  };
}
