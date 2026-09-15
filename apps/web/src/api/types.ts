/** Wire shapes returned by the API (Prisma models serialized to JSON). */

export type ApiMethod = 'SOLE_SOURCE' | 'LOW_VALUE' | 'FAST_TRACK' | 'DIRECT' | 'RFP' | 'LIMITED' | 'PUBLIC' | 'TWO_PHASED';
export type Num = number | string; // Prisma Decimal serializes to string

export interface ApiStage {
  key: string;
  order: number;
  plannedFrom: string | null;
  plannedTo: string | null;
  /** D1 — optional: absent on stages closed before the deviation record existed */
  actualFrom?: string | null;
  actualTo: string | null;
  devReasonCat?: string | null;
  devReasonNote?: string | null;
  documents: { kind: string }[];
}

export interface ApiAnnouncement {
  mode: 'PUBLIC' | 'LIMITED' | 'DIRECT';
  periodDays: number;
  newspapers: string[];
  lcWebsite: boolean;
  rocWebsite: boolean;
  inviteeCount: number;
  inviteesPreQualified: boolean;
  publishedOn: string | null;
}

export interface ApiBidder {
  id: string;
  name: string;
  docsOk: boolean;
  bondOk: boolean;
  technicalResult: 'PASS' | 'FAIL' | null;
  priceUSD: Num | null;
  submittedAt?: string | null;
  materials?: { materialId: string; imported: boolean; origin?: string | null; oemAuthorizedFrom?: string | null; onMooList?: boolean }[];
}

export interface ApiMct {
  notifiedOn: string;
  meetingHeldOn: string | null;
  agreementReachedOn: string | null;
  lcEstimateUSD: Num;
  mctEstimateUSD: Num | null;
  agreedEstimateUSD: Num | null;
}

export interface ApiRatification {
  status: 'RATIFIED' | 'RETURNED';
  by: string;
  on: string;
  notes: string | null;
}

export interface ApiTender {
  id: string;
  code: string;
  titleAr: string;
  titleEn: string;
  budgetCode: string;
  estimatedValueUSD: Num;
  method: ApiMethod;
  overrideJustification: string | null;
  createdOn: string;
  evaluationStep: number;
  stages: ApiStage[];
  announcement: ApiAnnouncement | null;
  bidders: ApiBidder[];
  mct: ApiMct | null;
  ratification: ApiRatification | null;
  status?: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED';
  statusReason?: string | null;
  statusChangedOn?: string | null;
  statusChangedBy?: string | null;
  // §9 local content
  scope?: 'DRILLING' | 'ENGINEERING_CONSTRUCTION' | 'HEAVY_MATERIALS' | 'OTHER' | null;
  localContentClauseAffixed?: boolean;
  stateResponses?: { company: string; status: 'ACCEPTED' | 'PENDING' | 'DECLINED'; evidence?: string | null }[];
}

export interface ApiContract {
  id: string;
  code: string;
  valueUSD: Num;
  termDays: number;
  contractorName?: string | null;
  signedOn?: string | null;
  /** 1:1 originating tender (Contract.tenderId is @unique) — always present server-side */
  tenderId?: string | null;
  /** the awarded contractor's Vendor file — nullable when unresolved */
  vendorId?: string | null;
  vendor?: { id: string; name: string } | null;
  tender: { titleAr: string; titleEn: string } | null;
  guarantees: { kind: 'BID_BOND' | 'PERFORMANCE' | 'ADVANCE'; valueUSD: Num; expiresOn: string }[];
  vos: { valueUSD: Num }[];
  extensions: { days: number }[];
  lds: { valueUSD: Num }[];
  stages?: { key: string; plannedTo?: string | null; actualTo?: string | null }[];
}

export interface ApiVendor {
  id: string;
  name: string;
  mooListed: boolean;
  suspended: boolean;
  blacklisted: boolean;
  inDispute: boolean;
  banUntil: string | null;
  banReason: string | null;
  techScore: number | null;
  financialScore: number | null;
  hseScore: number | null;
}

export interface ApiAudit {
  ts: string;
  action: string;
  target: string;
}

export interface ApiSession {
  user: { userId: string; name: string; role: string; operatorId?: string };
}

/** Prisma `model User` over the wire (users.service.ts includes the operator's name). */
export interface ApiUser {
  id: string;
  azureOid: string;
  name: string;
  email: string;
  role: string;
  operatorId: string | null;
  twoFa: boolean;
  disabled: boolean;
  operator?: { name: string } | null;
}
