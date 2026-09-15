import {
  approvalTierFor,
  checkAnnouncement,
  contractFinancialAuthority,
  DEFAULT_APPROVAL_TIERS,
  effectiveClosingDate,
  extensionCap,
  bidderOriginBlocker,
  criticalImportDocs,
  isLateBidByDate,
  isPriceVisible,
  liquidatedDamagesCap,
  localContentApplies,
  localContentStatus,
  lowestQualified,
  mayRatifyTier,
  performanceBondValid,
  renewalAllowed,
  singleBidAcceptable,
  stageCanClose,
  stageDeviationDays,
  suspensionCap,
  variationOrdersCap,
  type AnnouncementMode,
  type ApprovalTier,
  type ApprovalTiers,
  type EvaluationStep,
  type LocalContentScope,
  type LocalContentStatus,
  type MaterialDeclaration,
  type StateCompanyResponse,
} from '@masaar/scpp-rules';
import { addCalendarDays, IRAQ_CALENDAR, toUtcDate, type WorkingCalendar } from '@masaar/working-days';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { isApiMode } from './config';
import { api } from './api/client';
import { loadFullState, runAction, tenderIdOf } from './api/endpoints';
import { mapTender } from './api/mappers';
import type { ApiTender } from './api/types';
import { isOperatorRole, loadSession, normalizeRole, type ApiRole } from './session';

/**
 * Client-side tender store — stands in for the future API.
 * Shape mirrors the Prisma models in packages/db/schema.prisma 1:1.
 * Every mutating action re-runs the engine guard the server will run; the
 * reducer refuses state changes the SCPP rules refuse, and every action —
 * including refused attempts — lands in the append-only audit log (8.1-e).
 */

/* ---------------- types ---------------- */

export interface StageState {
  key: string;
  plannedFrom?: string;
  plannedTo?: string;
  /** actual start recorded at closing (D1) — informational; every deadline still reads actualTo */
  actualFrom?: string;
  actualTo?: string;
  uploadedDocs: string[];
  /** classified deviation reason recorded when the stage closed late (D1) — the compliance
   *  report quotes it, honouring «يظهر في تقرير الالتزام» instead of dropping the collected form */
  devReason?: { cat: string; note: string };
}

/** The closed vocabulary of deviation-reason categories (D1) — one list for the wizard chips,
 *  the reducer guard and the server DTO regex, so no surface can invent a fifth category. */
export const DEV_REASON_CATS = ['publisherDelay', 'docsCompletion', 'forceMajeure', 'internalCoord'] as const;

export interface BidderState {
  id: string;
  name: string;
  docsOk: boolean;
  bondOk: boolean;
  technicalResult?: 'pass' | 'fail';
  priceUSD?: number;
  /** when the bid was submitted (ISO) — recorded only when the entry carries it; drives the
   *  late-bid check (10.6.1). Absent = the admin vouched it arrived on time. */
  submittedAt?: string;
  /** §9 C8.6 — this bidder's per-critical-material origin declarations (drives the technical-eval gate). */
  materials?: MaterialDeclaration[];
}

export interface AnnouncementState {
  mode: AnnouncementMode;
  periodDays: number;
  newspapers: [string, string, string];
  lcWebsite: boolean;
  rocWebsite: boolean;
  inviteeCount: number;
  inviteesPreQualified: boolean;
  publishedOn?: string;
}

/** MCT cost cycle (6.9) — only present on tenders above Financial Authority. */
export interface MctState {
  notifiedOn: string;
  meetingHeldOn?: string;
  agreementReachedOn?: string;
  lcEstimateUSD: number;
  mctEstimateUSD?: number;
  agreedEstimateUSD?: number;
}

export interface Tender {
  id: string;
  code: string;
  /** the operating company that owns this request — its Service Contract sets the FA (§7) */
  operatorId?: string;
  /** the oil field this request belongs to (spec §1); FA derives from its contract (§7.1) */
  fieldId?: string;
  /** §9 work scope — with above-authority, drives the C8.1/C8.2 state-company requirement */
  scope?: LocalContentScope;
  /** C8.1 — whether the tender documents carry the 20% participation clause (publish-gate input) */
  localContentClauseAffixed?: boolean;
  /** C8.2 — documented state-company responses; a recorded justification makes non-participation lawful */
  stateResponses?: StateCompanyResponse[];
  title: { ar: string; en: string };
  budgetCode: string;
  estimatedValueUSD: number;
  methodId: number;
  overrideJustification?: string;
  createdOn: string;
  stages: StageState[];
  announcement: AnnouncementState;
  evaluationStep: number; // 0..3
  bidders: BidderState[];
  mct?: MctState;
  /** MDOC ratification decision on the award (admin side). */
  ratification?: RatificationState;
  /** Lifecycle governance (mirrors the API TenderStatus); absent = ACTIVE. */
  lifecycle?: TenderLifecycle;
}

/**
 * A governance `by` field carries the immutable Actor on rows this client wrote,
 * but a plain display-name string on rows hydrated from the API (the wire exposes
 * only the name) and on rows persisted before this identity change. Readers must
 * tolerate BOTH shapes — use `byName` / `byOid`.
 */
export type By = string | Actor;

/** Documented cancel/suspend of a tender — append-only, never a hard delete. */
export interface TenderLifecycle {
  status: 'cancelled' | 'suspended';
  reason: string;
  on: string;
  by: By;
}

export interface RatificationState {
  status: 'ratified' | 'returned';
  by: By;
  on: string;
  notes?: string;
}

export interface GuaranteeState {
  kind: 'bid-bond' | 'performance' | 'advance';
  valueUSD: number;
  expiresOn: string;
}

/** Post-award contract lifecycle stage (signing → closeout). */
export type ContractStageKey = 'sign' | 'bonds' | 'mobilize' | 'execute' | 'provisional' | 'warranty' | 'final';
export interface ContractStage {
  key: ContractStageKey;
  plannedTo?: string;
  actualTo?: string;
}

/** Append-only contract governance event. */
export interface ContractEvent {
  kind: 'vo' | 'extension' | 'ld' | 'guarantee' | 'stage' | 'suspension' | 'renewal';
  detail: string; // e.g. "$150,000", "30d", or a stage key
  on: string;
}

/** Post-award contract — the §18–§21 caps apply to it. */
export interface ContractState {
  id: string;
  code: string;
  title: { ar: string; en: string };
  contractorName: string;
  /**
   * Cross-record link keys — OPTIONAL because a legacy persisted contract (written before
   * these keys existed) or an API-hydrated contract whose relation is unset carries neither.
   * `vendorId` binds the contractor to a Vendor file; `tenderId` binds the contract to the
   * originating tender. Undefined = honestly unlinked (the UI shows an inert fallback, never
   * a fabricated link).
   */
  tenderId?: string;
  vendorId?: string;
  signedOn: string;
  valueUSD: number;
  termDays: number;
  voTotalUSD: number;
  extensionDays: number;
  ldTotalUSD: number;
  /** total days the contract has been suspended (§20.2 cap ≤25% of term) */
  suspensionDays: number;
  /** accumulated renewal years (§19.1 — each renewal ≤1 year) */
  renewalYears?: number;
  guarantees: GuaranteeState[];
  stages: ContractStage[];
  events?: ContractEvent[];
}

/** Who performed an action — bound by the immutable Azure oid, never by a display name. */
export interface Actor {
  oid: string;
  name: string;
  role: ApiRole;
}

/** Display name from a `By` field of either shape (Actor row or legacy/API string row). */
export function byName(by: By): string {
  return typeof by === 'string' ? by : by.name;
}
/** Immutable oid from a `By` field — undefined for a legacy/API string row that never carried one. */
export function byOid(by: By): string | undefined {
  return typeof by === 'string' ? undefined : by.oid;
}

/**
 * D4 — the client-side mirror of the server's `operatorScopeWhere` (apps/api/src/auth/scope.ts):
 * an operator-scoped session sees ITS OWN company's tenders only; platform roles see everything.
 * Reads the session identity the same way the request wizard does (loadSession().companyId).
 * Like the Prisma fragment `{ operatorId: user.operatorId }`, a scoped session that names no
 * company imposes no constraint rather than inventing one — the server behaves identically.
 */
export function sessionScopedTenders(state: State): Tender[] {
  const companyId = sessionScopeCompanyId();
  if (!companyId) return state.tenders;
  return state.tenders.filter((x) => x.operatorId === companyId);
}

/**
 * د15-م3 — the narrowing above, NAMED so a screen can say it out loud.
 *
 * The filter is a silent fact today: a reader on the register or the inbox sees a short list and
 * has no way to tell a company-scoped view from an empty week. The plan's answer is a visible
 * sentence, and a sentence that claims a scope must be governed by the very condition that
 * imposes it — a second copy of «is this session scoped» is how a screen comes to promise a
 * narrowing it does not have. So the condition lives HERE, once: the filter branches on it and
 * the sentence renders off it. A platform session gets `undefined` and prints no claim at all.
 */
export function sessionScopeCompanyId(): string | undefined {
  const s = loadSession();
  return s && isOperatorRole(s.role) && s.companyId ? s.companyId : undefined;
}

/**
 * Append-only — there is no action that removes or edits entries (8.1-e).
 * `by`/`outcome`/`reasonCode` are optional: rows written before the access-governance
 * section, and rows hydrated from the server, carry none of them.
 */
export interface AuditEntry {
  ts: string;
  action: string;
  target: string;
  /** actor — present only on rows this client wrote for an access action */
  by?: Actor;
  /** an attempt the guard refused is recorded, and is never byte-identical to one it allowed */
  outcome?: 'applied' | 'refused';
  /** machine-readable gate id on refusal, e.g. 'last-super' */
  reasonCode?: string;
  /**
   * The transition an APPLIED row performed, in the `OLD→NEW` shape the user trail already uses
   * (`UserEvent.detail`). Written where the target alone cannot say what moved: an operator id
   * identifies WHICH ladder was approved but not what it was before or became. Optional and
   * absent on every row that has a trail of its own to carry it.
   */
  detail?: string;
}

/** A company (mirrors Prisma `model Operator`). Financial Authority is NOT here — it is
 *  derived per field from the field's Service Contract (§7.1). See faFor(). */
export interface OperatorOrg {
  id: string;
  name: string;
  nameEn?: string;
}

/**
 * Append-only field governance event — the exact shape VendorEvent uses (kind / reason / on /
 * detail), so one trail vocabulary serves both registries. The actor is NOT repeated here: it
 * already rides on the self-written audit row, and duplicating it would give two places to
 * disagree about who acted.
 */
export interface FieldEvent {
  kind: 'rename' | 'archive' | 'restore';
  reason: string;
  on: string; // ISO date
  detail?: string; // e.g. "الأحدب→حقل الأحدب النفطي"
}

/** An oil field (spec §1 — 13 fields). Its Service Contract is the source of its FA (§7.1). */
export interface Field {
  id: string;
  name: string;
  nameEn?: string;
  code: string;
  operatorId: string;
  /**
   * Client decision ق7 (2026-08-20): a field is ARCHIVED, never deleted — its tenders, contracts
   * and audit rows exist and deleting the field would orphan them (8.1-e). Absent = live; the flag
   * only removes the field from the pickers and filters that offer FUTURE work.
   */
  archived?: boolean;
  /** documented rename/archive/restore trail (append-only) */
  events?: FieldEvent[];
}

/** Service Contract (§7.1) — one per field; determines the field's Financial Authority.
 *  Effectiveness and term are DERIVED (C2), never stored. */
export interface ServiceContract {
  id: string;
  code: string;
  fieldId: string;
  financialAuthorityUSD: number;
  signedOn: string;
  expiresOn: string;
  terminatedOn?: string;
}

/** Append-only account governance event — extends the VendorEvent shape with actor + timestamp. */
export interface UserEvent {
  kind: 'create' | 'role' | 'scope' | 'twofa' | 'disable' | 'enable' | 'refused';
  reason: string;
  on: string; // ISO date
  at: string; // full ISO timestamp — orders same-day events
  by: Actor;
  detail?: string; // e.g. "MDOC_ADMIN→EVALUATION"
}

/** 1:1 with Prisma `model User`. There is no `createdOn` — provenance comes from the create event. */
export interface UserAccount {
  id: string;
  azureOid: string;
  name: string;
  email: string;
  role: ApiRole;
  /** required for operator roles, forbidden for platform roles (users.service.ts) */
  operatorId?: string;
  twoFa: boolean;
  disabled: boolean;
  events?: UserEvent[];
}

/** Append-only vendor governance event — mirrors the API's VendorEvent (14.3).
 *  `archive`/`restore` extend it for the ق7 registry decision (client wave 1). */
export interface VendorEvent {
  kind: 'suspend' | 'lift' | 'ban' | 'scores' | 'archive' | 'restore';
  reason: string;
  on: string; // ISO date
  detail?: string; // e.g. "until 2026-11-01" or "فني 71→80"
}

export interface VendorState {
  id: string;
  name: string;
  /** an Iraqi state company (Article 25) — competes under the SAME 10.4 gates as any bidder (C8.4) */
  isStateCompany?: boolean;
  mooListed: boolean; // MoO Vendor List membership
  /**
   * Client decision ق7: archived, never deleted. Unlike a field, a vendor may be archived
   * WHATEVER its history — the history is immutable and stays readable on its file; archiving
   * only withdraws the entity from the lists that offer future participation (bidder pickers,
   * the ACTIVE registry view). It is NOT a 10.4/14.3 sanction and carries no clause.
   */
  archived?: boolean;
  suspended?: boolean;
  blacklisted?: boolean;
  inDispute?: boolean;
  banUntil?: string; // refusal-to-sign ban ≤ 12 months (14.3)
  banReason?: { ar: string; en: string };
  techScore: number;
  financialScore: number;
  hseScore: number;
  events?: VendorEvent[]; // documented governance trail
}

export interface State {
  tenders: Tender[];
  contracts: ContractState[];
  vendors: VendorState[];
  audit: AuditEntry[];
  seq: number;
  users: UserAccount[];
  /** the companies operator roles are scoped to — source of the operatorId the server demands */
  operators: OperatorOrg[];
  /** oil fields (spec §1) and their service contracts — the source of Financial Authority (§7.1) */
  fields: Field[];
  serviceContracts: ServiceContract[];
  /** admin-managed public holidays — feed the working-day calendar (§11.3.4-e). Mirrors the API's
   *  `model Holiday` ({date, name}); every working-day deadline resolves through calendarOf(). */
  holidays: Holiday[];
  /**
   * The SYSTEM DEFAULT approval ladder (client decision ق1) — the set of ceilings every operating
   * company is measured against unless one of its own has been approved, which is why it lives on
   * the state root and not on an operator or a contract.
   */
  approvalTiers: ApprovalTiers;
  /**
   * Per-operator ladder OVERRIDES (client decision 2026-08-25: «the supervisor sets the ceilings
   * per operator»), keyed on `OperatorOrg.id`. An ABSENT key is the normal case and means «this
   * company is on the system default» — never «no ladder». One optional layer above `approvalTiers`
   * rather than a ladder moved onto the operator record: ق1's default stays a single source, and
   * `resolveTiersFor` is the one place the two are read together.
   */
  operatorTiers: Record<string, ApprovalTiers>;
}

/** A public holiday: the ISO date the calendar keys on, plus a display name (e.g. "Eid al-Fitr"). */
export interface Holiday {
  date: string; // 'YYYY-MM-DD'
  name?: string;
}

/**
 * The live working-day calendar: Iraq's fixed weekend plus the admin-managed holiday DATES held in
 * state. This is the ONE source every client-side working-day computation must pass to the engine,
 * so a holiday added here shifts every deadline exactly as it does on the server (calendar.service).
 */
export function calendarOf(state: State): WorkingCalendar {
  return { weekend: IRAQ_CALENDAR.weekend, holidays: state.holidays.map((h) => h.date) };
}

/* ---------------- workflow config (app-level, not SCPP law) ---------------- */

export function defaultStageKeys(methodId: number): string[] {
  const ALL = ['cost', 'approval', 'preq', 'announce', 'invite', 'tech-open', 'tech-analysis', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
  switch (methodId) {
    case 7: // public — no pre-qualification (11.1), no invitations
      return ALL.filter((k) => k !== 'preq' && k !== 'invite');
    case 6: // limited — invitations, no public announcement
    case 4: // direct
      return ALL.filter((k) => k !== 'announce');
    case 3: // fast track — commercial bids only (11.7)
      return ['cost', 'approval', 'invite', 'comm-open', 'comm-analysis', 'ratify', 'sign'];
    case 1: // sole source
    case 2: // low-value
      return ['cost', 'approval', 'comm-analysis', 'ratify', 'sign'];
    default:
      return ALL;
  }
}

export const REQUIRED_DOCS: Record<string, string[]> = {
  announce: ['announcement-copy'],
  invite: ['announcement-copy'],
  'tech-open': ['opening-minutes'],
  'tech-analysis': ['evaluation-report'],
  'comm-open': ['opening-minutes'],
  'comm-analysis': ['evaluation-report'],
};
export const DEFAULT_DOC = 'stage-report';
export function requiredDocsFor(stageKey: string): string[] {
  return REQUIRED_DOCS[stageKey] ?? [DEFAULT_DOC];
}

const EVAL_STEPS: readonly EvaluationStep[] = ['technical-opening', 'technical-analysis', 'commercial-opening', 'commercial-analysis'];
export function evalStepName(i: number): EvaluationStep {
  return EVAL_STEPS[Math.min(Math.max(i, 0), 3)]!;
}

export function defaultAnnouncementFor(methodId: number): AnnouncementState {
  const mode: AnnouncementMode = methodId === 4 ? 'direct' : methodId === 6 ? 'limited' : 'public';
  return {
    mode,
    periodDays: mode === 'public' ? 21 : 14,
    newspapers: ['', '', ''],
    lcWebsite: false,
    rocWebsite: false,
    inviteeCount: 0,
    inviteesPreQualified: false,
  };
}

export function announcementInput(a: AnnouncementState) {
  return {
    mode: a.mode,
    periodDays: a.periodDays,
    newspapers: a.newspapers,
    publishedOnLcWebsite: a.lcWebsite,
    publishedOnRocWebsite: a.rocWebsite,
    inviteeCount: a.inviteeCount,
    inviteesPreQualified: a.inviteesPreQualified,
  };
}

/* ---------------- derived ---------------- */

/**
 * The bid-closing DATE for a PUBLISHED announcement (§11.3.4-e) — day-granular, never a timestamp:
 * 10.6.1 rejects a bid after the closing *date*, so lateness is a date comparison (matches the ISO
 * string comparison used for contract effectiveness — kills any Baghdad/UTC hour drift). The period
 * is counted from the first publication day (day 1), so the last open day is publishedOn +
 * (periodDays − 1); a weekend/holiday landing rolls forward to the next working day. Derived, never
 * stored (C2). `null` before publication — no closing exists yet. `cal` = calendarOf(state).
 */
export function bidClosingAt(a: AnnouncementState, cal: WorkingCalendar): string | null {
  if (!a.publishedOn) return null;
  return effectiveClosingDate(addCalendarDays(toUtcDate(a.publishedOn), Math.max(a.periodDays - 1, 0)), cal);
}

/**
 * §15.3 — a lone bid is acceptable only if the advertised period was ≥ 21 days. Derived from the
 * live bidder count and the announcement period; `ok` is vacuously true unless exactly one bid.
 */
export function singleBidStatus(t: Tender): { single: boolean; ok: boolean } {
  return { single: t.bidders.length === 1, ok: singleBidAcceptable(t.bidders.length, t.announcement.periodDays).ok };
}

/** §9 C8.1/C8.2 — does the state-company participation requirement apply to this tender? Uses the
 *  fail-closed authority (aboveOwnFA — a null/unresolvable FA counts as above), never a hand compare. */
export function tenderLocalContentApplies(state: State, t: Tender): boolean {
  return localContentApplies(t.scope ?? 'OTHER', aboveOwnFA(state, t));
}

/** §9 C8.2 participation status — DERIVED (C2). `violating` only when it applies, none participate,
 *  and no justification is on record; a documented decline is a lawful `exempt`, never a breach. */
export function tenderLocalContentStatus(state: State, t: Tender): LocalContentStatus {
  return localContentStatus(tenderLocalContentApplies(state, t), t.stateResponses ?? []);
}

/** §9 C8.8 — does the AWARDED bidder declare an imported critical material? At the sign stage the
 *  winner is settled (ratification precedes signing), so the certificates are demanded for the
 *  contract that will actually exist, not for a losing bid's imports. Falls back to any bidder only
 *  if a winner cannot be resolved (which does not happen after ratify). */
export function tenderHasImportedCritical(t: Tender): boolean {
  const winner = lowestQualified(t.bidders);
  const winnerFull = winner ? t.bidders.find((b) => b.id === winner.id) : undefined;
  const relevant = winnerFull ? [winnerFull] : t.bidders;
  return relevant.some((b) => (b.materials ?? []).some((m) => m.imported));
}

/** One tender whose derived bid-closing moves when a holiday is toggled. */
export interface HolidayImpact {
  tenderId: string;
  code: string;
  before: string;
  after: string;
}

/**
 * The retroactive footprint of adding/removing a holiday (§11.3.4-e): every PUBLISHED announcement
 * whose derived closing rolls when `date` is toggled. Surfacing this before the change is what makes
 * the shift honest — removing a holiday can pull a closing back, turning a bid accepted on the once-
 * extended day retroactively late. Add compares against the calendar WITHOUT the date; remove WITH it.
 */
export function holidaysImpact(state: State, date: string, mode: 'add' | 'remove'): HolidayImpact[] {
  const d = date.slice(0, 10);
  const dates = state.holidays.map((h) => h.date);
  const toggled = mode === 'add'
    ? (dates.includes(d) ? dates : [...dates, d])
    : dates.filter((x) => x !== d);
  const before = calendarOf(state);
  const after: WorkingCalendar = { weekend: IRAQ_CALENDAR.weekend, holidays: toggled };
  const out: HolidayImpact[] = [];
  for (const t of state.tenders) {
    const b = bidClosingAt(t.announcement, before);
    const a = bidClosingAt(t.announcement, after);
    if (b && a && b !== a) out.push({ tenderId: t.id, code: t.code, before: b, after: a });
  }
  return out;
}

export function currentStage(t: Tender): StageState | undefined {
  return t.stages.find((s) => !s.actualTo);
}

export function totalDeviationDays(t: Tender): number {
  return t.stages
    .filter((s) => s.actualTo && s.plannedTo)
    .reduce((sum, s) => sum + Math.max(stageDeviationDays(s.plannedTo!, s.actualTo!), 0), 0);
}

export function expectedAwardDate(t: Tender): string | undefined {
  const tos = t.stages.map((s) => s.plannedTo).filter((d): d is string => !!d);
  return tos.length ? tos.reduce((a, b) => (a > b ? a : b)) : undefined;
}

export function stageStatus(s: StageState, today: string): 'planned' | 'progress' | 'done' | 'delayed' {
  if (s.actualTo) return 'done';
  if (s.plannedTo && today > s.plannedTo) return 'delayed';
  if (s.plannedFrom && today >= s.plannedFrom) return 'progress';
  return 'planned';
}

/** True when the estimate exceeds the given authority. `faUSD` must be supplied — there is
 *  no permissive default; an unresolvable authority is handled by the callers below. */
export function isAboveFA(t: Tender, faUSD: number): boolean {
  return t.estimatedValueUSD > faUSD;
}

/**
 * The Financial Authority governing a tender, derived from its field's Service Contract (§7.1) —
 * never one global number, never per-operator. Returns null when unresolvable (no field, no
 * contract, or an ineffective one) so callers FAIL CLOSED — §7.1: authority «shall be obtained
 * before an award».
 */
export function faFor(state: State, t: Tender): number | null {
  return faForFieldId(state, t.fieldId);
}

/** The Financial Authority a field's effective Service Contract grants, or null (fail closed). */
export function faForFieldId(state: State, fieldId: string | undefined): number | null {
  const contract = state.serviceContracts.find((c) => c.fieldId === fieldId);
  return contractFinancialAuthority(contract ?? null);
}

/**
 * The fields ONE operating company owns — the company scope every operator surface reads through
 * (§10.x: a scoped account may only touch its own company). One definition, so the request wizard
 * and the tender registry cannot drift into showing different universes.
 *
 * `operatorId` is optional and an absent one resolves to NO fields, never to all of them: a
 * session that carries no company has not proven a scope, and «no scope» must fail closed to
 * nothing rather than open to the whole 13-field registry. Callers render their field control
 * only when the result is non-empty, so the surface stays honest instead of offering a filter
 * over companies the account does not belong to.
 */
export function fieldsOfOperator(state: State, operatorId: string | undefined): Field[] {
  if (!operatorId) return [];
  return state.fields.filter((f) => f.operatorId === operatorId);
}

/* ---------------- archive model (client decision ق7) ---------------- */

/**
 * Is this tender still IN FLIGHT? The predicate the archive gate reads, and it is deliberately
 * generous about what counts as live:
 *
 *  · `cancelled` — dead. A documented cancellation ends the request; nothing further is owed.
 *  · every stage closed (`currentStage` is undefined) — delivered. Signing was the last stage.
 *  · anything else — live, INCLUDING a `suspended` tender (RESUME_TENDER exists, so a pause is
 *    not an ending) and a RATIFIED one whose `sign` stage is still open (the award is made but
 *    the contract is unsigned — the field is still doing procurement work).
 *
 * Erring toward «live» is the conservative direction for an archive gate: refusing to archive a
 * field that turns out to be finished costs a click, archiving one that is mid-tender strands
 * live work behind a hidden field.
 */
export function tenderIsActive(t: Tender): boolean {
  if (t.lifecycle?.status === 'cancelled') return false;
  return !!currentStage(t);
}

/** The in-flight tenders of one field — the count the archive gate names to the user. */
export function activeTendersOfField(state: State, fieldId: string): Tender[] {
  return state.tenders.filter((t) => t.fieldId === fieldId && tenderIsActive(t));
}

/** The fields a picker may offer — archived ones are withdrawn from FUTURE work, never erased. */
export function liveFields(fields: readonly Field[]): Field[] {
  return fields.filter((f) => !f.archived);
}

/** Whether ARCHIVE_FIELD would be accepted, and the live-tender count that decides it. */
export function fieldArchivable(state: State, fieldId: string): { ok: boolean; activeTenders: number } {
  const n = activeTendersOfField(state, fieldId).length;
  return { ok: n === 0, activeTenders: n };
}

/**
 * Above its own field's FA → enters the MCT cost cycle (6.9) and MDOC witnessing (12.2.2).
 * Fail closed: an unresolvable FA is treated as above authority (the conservative reading —
 * a tender with no effective contract cannot be assumed within any authority).
 */
export function aboveOwnFA(state: State, t: Tender): boolean {
  const fa = faFor(state, t);
  return fa == null || isAboveFA(t, fa);
}

/**
 * THE LADDER THIS COMPANY IS MEASURED AGAINST — its own if one has been approved, else the system
 * default (client decision 2026-08-25, superseding ق1's «one ladder for all»).
 *
 * Deliberately NOT a copy and NOT a repair:
 *  · a company with no entry gets `state.approvalTiers` BY IDENTITY — the default is one object,
 *    and handing back a clone would create a second ladder to keep in sync;
 *  · a stored entry that is structurally wrong (non-numeric, negative, inverted) is returned AS
 *    STORED, because `approvalTierFor` is the single judge of a ladder and it fails closed to MDOC.
 *    Substituting the default here would hand back a ladder nobody approved and clear requests at
 *    the LOWEST gate on the strength of it — the same reasoning `normTiers` documents for loads.
 *  · a tender with no operator (`!operatorId`) reads the default, which is today's behaviour
 *    verbatim: an unowned request cannot borrow another company's ceilings.
 */
export function resolveTiersFor(state: State, operatorId?: string): ApprovalTiers {
  return (operatorId && state.operatorTiers[operatorId]) || state.approvalTiers;
}

/** Operators that carry an approved ladder of their own AND exist in the registry. An entry left
 *  behind for a company that is no longer registered is inert: it names nothing, so it is counted
 *  nowhere and shown nowhere (a registry figure must resolve to a row a reader can open). */
export function operatorsWithOwnTiers(state: State): string[] {
  return state.operators.filter((o) => state.operatorTiers[o.id]).map((o) => o.id);
}

/**
 * Which body clears this request — read off THIS TENDER'S OPERATOR'S ladder, never a literal.
 *
 * This is the ONE point at which the per-operator ladder enters the derivation. Every consumer —
 * the RATIFY/RETURN authority gate in the reducer, `approvalChain`, `awaitingTier`/`tierExample`,
 * the dashboard counters, both tier filters, the tender file — already routes through here, so
 * each of them inherits the resolution without a line of its own. A screen that teaches itself
 * the ladder separately is the drift this function exists to prevent.
 *
 * Distinct from `aboveOwnFA`: FA (§7.1, per field) decides whether the cost cycle opens; the
 * ladder decides whose signature the award needs. A tender can be within its field's FA and
 * still sit in the operator band, or above FA and land in either upper band — the two questions
 * have different inputs and must not be collapsed. A per-operator CEILING does not change that:
 * `operatorTiers` is a signature ladder scoped to a company, never a financial authority for it
 * (the retired `SET_OPERATOR_FA` is not revived by this — see ops/OPERATOR-TIERS-SPEC.md §0).
 */
export function tenderApprovalTier(state: State, t: Tender): ApprovalTier {
  return approvalTierFor(t.estimatedValueUSD, resolveTiersFor(state, t.operatorId));
}

/** Resolve the accredited estimate per the prevailing rule (6.9.1 / 6.9.2 / agreed). */
export function accreditedEstimate(m: MctState, prevailing: 'AGREED' | 'LC' | 'MCT' | 'PENDING'): number {
  if (prevailing === 'AGREED' && m.agreedEstimateUSD != null) return m.agreedEstimateUSD;
  if (prevailing === 'MCT' && m.mctEstimateUSD != null) return m.mctEstimateUSD;
  return m.lcEstimateUSD;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------------- actions ---------------- */

export type Action =
  | {
      type: 'CREATE_TENDER';
      title: { ar: string; en: string };
      budgetCode: string;
      estimatedValueUSD: number;
      methodId: number;
      overrideJustification?: string;
      /** the operating company raising the request */
      operatorId?: string;
      /** the oil field this request belongs to — its Service Contract decides the FA (§7.1) */
      fieldId?: string;
      /** §9 work scope — drives the C8.1/C8.2 requirement; defaults OTHER */
      scope?: LocalContentScope;
      /** optional planned dates per stage key, generated by the request wizard */
      stageDates?: Record<string, { plannedFrom: string; plannedTo: string }>;
    }
  | { type: 'PLAN_STAGE'; tenderId: string; stageKey: string; plannedFrom?: string; plannedTo?: string }
  | { type: 'SET_ANNOUNCEMENT'; tenderId: string; patch: Partial<AnnouncementState> }
  | { type: 'PUBLISH_ANNOUNCEMENT'; tenderId: string }
  | { type: 'SET_EVAL_STEP'; tenderId: string; step: number }
  // submittedAt (optional ISO date/timestamp) triggers the late-bid gate (10.6.1); omitting it is
  // the admin vouching the bid arrived on time — the existing quick-add path
  | { type: 'ADD_BIDDER'; tenderId: string; name: string; submittedAt?: string }
  | { type: 'SET_TECHNICAL'; tenderId: string; bidderId: string; result: 'pass' | 'fail' }
  | { type: 'SET_PRICE'; tenderId: string; bidderId: string; priceUSD: number }
  | { type: 'TOGGLE_DOC'; tenderId: string; stageKey: string; doc: string }
  // actualFrom/devReason (D1): the wizard collects them, so the action carries them — a form
  // field that is gathered and then dropped is a placebo. Both optional: legacy callers and
  // no-deviation closes send neither.
  | { type: 'COMPLETE_STAGE'; tenderId: string; stageKey: string; actualTo: string; actualFrom?: string; devReason?: { cat: string; note: string } }
  // award decision + lifecycle governance carry the immutable Actor (oid), never a
  // display name — the same identity contract the access-governance actions use.
  | { type: 'RATIFY'; tenderId: string; by: Actor }
  | { type: 'RETURN_WITH_NOTES'; tenderId: string; by: Actor; notes: string }
  // lifecycle governance — documented cancel / suspend / resume (never a hard delete)
  | { type: 'CANCEL_TENDER'; tenderId: string; reason: string; by: Actor }
  | { type: 'SUSPEND_TENDER'; tenderId: string; reason: string; by: Actor }
  | { type: 'RESUME_TENDER'; tenderId: string; reason: string; by: Actor }
  // vendor governance (documented, never a hard delete) — 14.3 / 10.4
  | { type: 'SUSPEND_VENDOR'; vendorId: string; reason: string }
  | { type: 'LIFT_VENDOR'; vendorId: string; reason: string }
  | { type: 'BAN_VENDOR'; vendorId: string; banUntil: string; reason: string }
  | { type: 'SET_VENDOR_SCORES'; vendorId: string; techScore?: number; financialScore?: number; hseScore?: number; reason: string }
  // post-award contract governance — each cap is gated (§18–21) before it lands
  | { type: 'ADD_VO'; contractId: string; valueUSD: number; approvedOn: string }
  | { type: 'ADD_EXTENSION'; contractId: string; days: number; approvedOn: string }
  | { type: 'ADD_LD'; contractId: string; valueUSD: number; appliedOn: string }
  | { type: 'ADD_GUARANTEE'; contractId: string; kind: GuaranteeState['kind']; valueUSD: number; expiresOn: string }
  | { type: 'ADD_SUSPENSION'; contractId: string; days: number; on: string }
  | { type: 'RENEW_CONTRACT'; contractId: string; years: number; on: string }
  | { type: 'ADVANCE_CONTRACT_STAGE'; contractId: string; actualTo: string }
  // access governance — every one mirrors a guard in apps/api/src/users/users.service.ts
  | { type: 'CREATE_USER'; userId: string; azureOid: string; name: string; email: string; role: ApiRole; operatorId?: string; twoFa: boolean; reason: string; by: Actor }
  | { type: 'SET_USER_ROLE'; userId: string; role: ApiRole; operatorId?: string; reason: string; by: Actor }
  | { type: 'SET_USER_SCOPE'; userId: string; operatorId?: string; reason: string; by: Actor }
  | { type: 'SET_USER_TWOFA'; userId: string; twoFa: boolean; reason: string; by: Actor }
  | { type: 'SET_USER_DISABLED'; userId: string; disabled: boolean; reason: string; by: Actor }
  // operating companies — the Financial Authority each one carries governs MCT entry (6.9),
  // MDOC participation tier (12.2) and anti-splitting detection (7.2)
  | { type: 'CREATE_OPERATOR'; operatorId: string; name: string; nameEn?: string; reason: string; by: Actor }
  // client decision 2026-08-25 — the supervisor approves a company's OWN approval ladder. This is
  // a SIGNATURE ladder scoped to one company, NOT a financial authority for it (§7.1 FA remains
  // per-field, on the Service Contract, moved by SET_CONTRACT_FA). `tiers: null` drops the
  // override and returns the company to the system default — a full governed act with the same
  // Actor and justification, never a silent erase.
  | { type: 'SET_OPERATOR_TIERS'; operatorId: string; tiers: ApprovalTiers | null; reason: string; by: Actor }
  // a field is created together with its Service Contract (§7.1) — the source of its FA, so a
  // new operator's field is usable immediately (a field with no contract cannot raise a tender)
  | { type: 'CREATE_FIELD'; fieldId: string; operatorId: string; name: string; nameEn?: string; code: string; contractId: string; contractCode: string; financialAuthorityUSD: number; signedOn: string; expiresOn: string; reason: string; by: Actor }
  // FA is a property of the field's Service Contract (§7.1), not the operator — edit it there
  | { type: 'SET_CONTRACT_FA'; contractId: string; financialAuthorityUSD: number; reason: string; by: Actor }
  // request 9 «إمكانية التعديل لاحقاً» — a field's DISPLAY names are correctable after creation.
  // Deliberately narrow: `code` is not renameable (it is quoted in tender codes and exports) and
  // `operatorId` is not moveable (a field belongs to the company that holds its Service Contract).
  | { type: 'RENAME_FIELD'; fieldId: string; name: string; nameEn?: string; reason: string; by: Actor }
  // ق7 — archive, never delete. A field with in-flight tenders is refused (the gate names the count).
  | { type: 'ARCHIVE_FIELD'; fieldId: string; reason: string; by: Actor }
  | { type: 'RESTORE_FIELD'; fieldId: string; reason: string; by: Actor }
  // ق7 — a vendor archives regardless of history: the history is immutable and stays on its file;
  // archiving only removes it from the ACTIVE registry view and the bidder pickers.
  | { type: 'ARCHIVE_VENDOR'; vendorId: string; reason: string; by: Actor }
  | { type: 'RESTORE_VENDOR'; vendorId: string; reason: string; by: Actor }
  // request 14 — registering a new entity. State companies are NOT creatable here: the five of
  // them are seeded law (Article 25 / §9 C8.4), not registry data an admin invents.
  | { type: 'CREATE_VENDOR'; vendorId: string; name: string; mooListed: boolean; reason: string; by: Actor }
  // admin-managed holidays — every add/remove reshapes the working-day calendar (§11.3.4-e) and
  // shifts every open deadline and derived closing RETROACTIVELY, so each carries an Actor + a
  // documented reason and self-audits (attributed, 8.1-e) exactly like its governance siblings
  | { type: 'ADD_HOLIDAY'; date: string; name?: string; reason: string; by: Actor }
  | { type: 'REMOVE_HOLIDAY'; date: string; reason: string; by: Actor }
  // §9 local content — records/data the compliance gates read (server-modeled; NOT client-only)
  // C8.1 — the operator attests that the 20% participation clause is affixed to the tender
  // documents. It is the ONLY writer of `localContentClauseAffixed`, which the publish gate
  // (PUBLISH_ANNOUNCEMENT) and the API both read; attributed to the Actor like its siblings.
  | { type: 'SET_LC_CLAUSE'; tenderId: string; affixed: boolean; by: Actor }
  | { type: 'SET_STATE_RESPONSE'; tenderId: string; company: string; status: StateCompanyResponse['status']; evidence?: string; reason: string; by: Actor }
  | { type: 'SET_BIDDER_MATERIALS'; tenderId: string; bidderId: string; materials: MaterialDeclaration[] }
  // api-mode only: replace whole state (hydrate) or one tender (after a server mutation)
  | { type: 'HYDRATE'; state: State }
  | { type: 'UPSERT_TENDER'; tender: Tender }
  | { type: 'RESET' };

function patchTender(state: State, id: string, fn: (t: Tender) => Tender): State {
  const target = state.tenders.find((t) => t.id === id);
  if (!target) return state;
  const updated = fn(target);
  // a guard that refuses returns the tender UNCHANGED — preserve state identity so the audit wrapper
  // (which keys on `next === state`) writes no misleading success row for a refused action. Every
  // patchTender-based refusal is thereby silent, consistent with the direct `return state` guards.
  if (updated === target) return state;
  return { ...state, tenders: state.tenders.map((t) => (t.id === id ? updated : t)) };
}

/** Same identity contract as patchTender: a guard that refuses returns the vendor UNCHANGED,
 *  and the state reference is preserved so the audit wrapper writes no false-success row. */
function patchVendor(state: State, id: string, fn: (v: VendorState) => VendorState): State {
  const target = state.vendors.find((v) => v.id === id);
  if (!target) return state;
  const updated = fn(target);
  if (updated === target) return state;
  return { ...state, vendors: state.vendors.map((v) => (v.id === id ? updated : v)) };
}

/** Same identity contract as patchTender, for the field registry (rename / archive / restore). */
function patchField(state: State, id: string, fn: (f: Field) => Field): State {
  const target = state.fields.find((f) => f.id === id);
  if (!target) return state;
  const updated = fn(target);
  if (updated === target) return state;
  return { ...state, fields: state.fields.map((f) => (f.id === id ? updated : f)) };
}

/** Same identity contract as patchTender — a refused cap guard (§18–21) leaves state untouched. */
function patchContract(state: State, id: string, fn: (c: ContractState) => ContractState): State {
  const target = state.contracts.find((c) => c.id === id);
  if (!target) return state;
  const updated = fn(target);
  if (updated === target) return state;
  return { ...state, contracts: state.contracts.map((c) => (c.id === id ? updated : c)) };
}

function patchUser(state: State, id: string, fn: (u: UserAccount) => UserAccount): State {
  return { ...state, users: state.users.map((u) => (u.id === id ? fn(u) : u)) };
}

function withUserEvent(u: UserAccount, e: UserEvent): UserEvent[] {
  return [e, ...(u.events ?? [])];
}

/**
 * Access actions write their own audit row so an applied grant and a refused attempt are
 * never identical — the generic wrapper cannot tell them apart, which is why these action
 * types live in NON_AUDITED.
 */
function auditAccess(
  state: State,
  action: string,
  target: string,
  by: Actor,
  outcome: 'applied' | 'refused',
  reasonCode?: string,
  detail?: string,
): State {
  return {
    ...state,
    audit: [...state.audit, { ts: new Date().toISOString(), action, target, by, outcome, ...(reasonCode ? { reasonCode } : {}), ...(detail ? { detail } : {}) }],
  };
}

/** A refused attempt: the account is untouched, but the attempt lands on its trail and in the log. */
function refuseAccess(state: State, action: Action & { userId: string; reason: string; by: Actor }, reasonCode: string): State {
  const target = state.users.find((u) => u.id === action.userId);
  if (!target) return state;
  const at = new Date().toISOString();
  const withEvt = patchUser(state, action.userId, (u) => ({
    ...u,
    events: withUserEvent(u, { kind: 'refused', reason: action.reason, on: at.slice(0, 10), at, by: action.by, detail: reasonCode }),
  }));
  return auditAccess(withEvt, action.type, target.email, action.by, 'refused', reasonCode);
}

function withContractEvent(c: ContractState, e: ContractEvent): ContractEvent[] {
  return [e, ...(c.events ?? [])];
}

const usd = (v: number) => `$${v.toLocaleString('en-US')}`;

function withEvent(v: VendorState, e: VendorEvent): VendorEvent[] {
  return [e, ...(v.events ?? [])];
}

/** Newest-first, exactly like the vendor trail — one reading order across both registries. */
function withFieldEvent(f: Field, e: FieldEvent): FieldEvent[] {
  return [e, ...(f.events ?? [])];
}

/** Governance justification must be 20–2000 chars (mirrors the API `@Length(20, 2000)`). */
export function govReasonValid(reason: string): boolean {
  const n = reason.trim().length;
  return n >= 20 && n <= 2000;
}

/**
 * Is this a ladder a supervisor may APPROVE? — the ENTRY gate, deliberately stricter than the
 * engine's `ladderUsable` reading gate, and shared by the editor and the reducer so a disabled
 * confirm button and a refused dispatch can never disagree.
 *
 * Two ceilings that are real, finite and non-negative, and `operatorMaxUSD` STRICTLY below
 * `jmcMaxUSD`. The engine tolerates equality (it asks only «is this readable»), but two equal
 * ceilings describe an EMPTY ط2 band: such a ladder is not a two-tier ladder, it is an ambiguity,
 * and the place to refuse an ambiguity is the door rather than the safety valve. `approvalTierFor`
 * is not relaxed in exchange — the last fail-closed reading stays exactly as conservative as it is.
 *
 * A `operatorMaxUSD` of ZERO is accepted on purpose: a supervisor who wants every one of a
 * company's requests to leave its own authority is expressing a real policy. (This is the opposite
 * of the FA rule, where zero is refused — because there the question is «what may this field spend
 * on its own», and here it is «where does this company's signature stop».)
 */
export function ladderApprovable(t: ApprovalTiers): boolean {
  const { operatorMaxUSD: op, jmcMaxUSD: jmc } = t;
  if (!Number.isFinite(op) || !Number.isFinite(jmc)) return false;
  if (op < 0 || jmc < 0) return false;
  return op < jmc;
}

/** Are these the same two ceilings? — the no-op test the editor and the reducer share. */
export function sameTiers(a: ApprovalTiers | undefined, b: ApprovalTiers | undefined): boolean {
  if (!a || !b) return a === b;
  return a.operatorMaxUSD === b.operatorMaxUSD && a.jmcMaxUSD === b.jmcMaxUSD;
}

/* ---------------- access guards (shared by the UI gates and the reducer) ----------------
 * One definition each, mirroring apps/api/src/users/users.service.ts line for line, so a gate
 * shown in the UI and a refusal written by the reducer can never disagree.
 */

export function enabledSuperAdmins(state: State): number {
  return state.users.filter((u) => u.role === 'SUPER_ADMIN' && !u.disabled).length;
}

/** Demoting or disabling this account would strand the platform without a super admin. */
export function isLastEnabledSuper(state: State, userId: string): boolean {
  const u = state.users.find((x) => x.id === userId);
  if (!u || u.role !== 'SUPER_ADMIN' || u.disabled) return false;
  return enabledSuperAdmins(state) <= 1;
}

/** Operator roles require a company; platform roles must not carry one. */
export function scopeConsistent(role: ApiRole, operatorId: string | undefined): boolean {
  return isOperatorRole(role) ? !!operatorId : !operatorId;
}

/** 14.3: refusal-to-sign ban may not exceed 12 months from today. */
export function banWithinLimit(banUntil: string, today: string): boolean {
  if (banUntil <= today) return false;
  const [y, m, d] = today.split('-').map(Number);
  const max = new Date(Date.UTC(y!, (m ?? 1) - 1 + 12, d ?? 1)).toISOString().slice(0, 10);
  return banUntil <= max;
}

/**
 * The name a log row gives the thing an action acted on — a CODE (or a name/email) wherever one
 * exists, because a row is read by a human, not joined by an id.
 *
 * WHY TWO STATES. Every action but one names a target that ALREADY EXISTS, so `prev` answers it.
 * `CREATE_TENDER` is the exception: it carries no `tenderId` — the tender it names is MINTED by
 * `apply`, and does not exist in `prev` at all. Resolving it against `prev` is what forced the old
 * fallback to `budgetCode`, and a budget code is not an identity: it is shared by every request
 * drawn on the same budget line, so a created tender's own birth row could never be filtered back
 * to its file (FileLog matches code-or-id), while matching the budget code instead would hand one
 * tender the birth rows of its budget siblings. Resolving AFTER apply removes both: the row names
 * the code the tender actually got. Nothing else changes — the wrapper still writes the same
 * action, the same actor and the same success/refusal semantics.
 *
 * The created tender is identified as the one `next` has and `prev` does not, so this stays true
 * however ids are minted and however the list is ordered. Old rows already stored against a budget
 * code are left exactly as written (8.1-e, append-only): no migration, no rewrite.
 */
function actionTarget(prev: State, next: State, action: Action): string {
  if ('tenderId' in action) {
    return prev.tenders.find((t) => t.id === action.tenderId)?.code ?? action.tenderId;
  }
  if ('vendorId' in action) {
    return prev.vendors.find((v) => v.id === action.vendorId)?.name ?? action.vendorId;
  }
  if ('contractId' in action) {
    return prev.contracts.find((c) => c.id === action.contractId)?.code ?? action.contractId;
  }
  // defensive: access actions audit themselves, but keep the target identical to the
  // server's (users.service.ts records dto.email) should one ever reach the wrapper.
  if ('userId' in action) {
    return prev.users.find((u) => u.id === action.userId)?.email ?? action.userId;
  }
  if (action.type === 'CREATE_TENDER') {
    const before = new Set(prev.tenders.map((t) => t.id));
    // the fallback cannot fire on a creation that happened (the wrapper only runs when it did),
    // and keeps the old answer rather than an empty target for any caller that reaches here dry
    return next.tenders.find((t) => !before.has(t.id))?.code ?? action.budgetCode;
  }
  return '—';
}

function apply(state: State, action: Action): State {
  switch (action.type) {
    case 'CREATE_TENDER': {
      // the store is local-mode law and must be as strict as the DB/API: a tender needs a field
      // in the raising operator's scope, and that field must have an effective contract (§7.1).
      // Refuse otherwise — return state unchanged, exactly as the server throws (no invalid tender).
      const field = state.fields.find((f) => f.id === action.fieldId);
      if (!field || (action.operatorId && field.operatorId !== action.operatorId)) return state;
      // ق7: an ARCHIVED field is withdrawn from FUTURE work. RequestWizard already filters it out
      // of the picker (liveFields), but a picker is a courtesy — this is the law: no request may be
      // raised on a field the registry has withdrawn, whatever dispatches it. Refused in the style
      // of its siblings above — the ORIGINAL state is returned, so the audit wrapper appends no row
      // for an act that never happened (8.1-e); the archive event on the field is the record.
      if (field.archived) return state;
      // the field's Service Contract authority (§7.1), not a per-operator or global figure
      const fa = faForFieldId(state, action.fieldId);
      if (fa == null) return state; // no effective contract → fail closed, no creation
      const seq = state.seq + 1;
      const code = `${action.budgetCode.slice(0, 2).toUpperCase() || 'LC'}-PRJ-${String(seq).padStart(4, '0')}`;
      const tender: Tender = {
        id: `t${seq}`,
        operatorId: action.operatorId,
        fieldId: action.fieldId,
        code,
        title: action.title,
        budgetCode: action.budgetCode,
        estimatedValueUSD: action.estimatedValueUSD,
        methodId: action.methodId,
        scope: action.scope ?? 'OTHER',
        overrideJustification: action.overrideJustification,
        createdOn: todayIso(),
        stages: defaultStageKeys(action.methodId).map((key) => ({ key, uploadedDocs: [], ...(action.stageDates?.[key] ?? {}) })),
        announcement: defaultAnnouncementFor(action.methodId),
        evaluationStep: 0,
        bidders: [],
        // above the field's contract FA → enters the MCT cycle (6.9)
        mct:
          action.estimatedValueUSD > fa
            ? { notifiedOn: todayIso(), lcEstimateUSD: action.estimatedValueUSD }
            : undefined,
      };
      return { ...state, seq, tenders: [tender, ...state.tenders] };
    }
    case 'PLAN_STAGE':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        stages: t.stages.map((s) =>
          s.key === action.stageKey && !s.actualTo
            ? { ...s, plannedFrom: action.plannedFrom ?? s.plannedFrom, plannedTo: action.plannedTo ?? s.plannedTo }
            : s,
        ),
      }));
    case 'SET_ANNOUNCEMENT':
      return patchTender(state, action.tenderId, (t) =>
        t.announcement.publishedOn ? t : { ...t, announcement: { ...t.announcement, ...action.patch } },
      );
    case 'PUBLISH_ANNOUNCEMENT':
      return patchTender(state, action.tenderId, (t) => {
        // the same guards the API enforces — publish refused until every check passes
        if (t.announcement.publishedOn || !checkAnnouncement(announcementInput(t.announcement)).ok) return t;
        // §9 C8.1 — when the state-company requirement applies, the tender documents MUST carry the 20%
        // participation clause before publication (a drafting duty, distinct from the C8.2 participation).
        if (tenderLocalContentApplies(state, t) && !t.localContentClauseAffixed) return t;
        return { ...t, announcement: { ...t.announcement, publishedOn: todayIso() } };
      });
    case 'SET_EVAL_STEP':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        evaluationStep: Math.min(Math.max(action.step, 0), 3),
      }));
    case 'ADD_BIDDER': {
      const bt = state.tenders.find((x) => x.id === action.tenderId);
      if (!bt) return state;
      // late-bid gate (10.6.1). The closing is derived per method:
      //   • a closing exists → a recorded submission after it is late (refused); and once the
      //     window has CLOSED, a submission date becomes mandatory — a bare add can no longer
      //     silently admit a possibly-late bid (the gate must be automatic, not opt-in).
      //   • no closing yet on a PUBLIC method → awaited publication: a timestamped bid can't be
      //     validated, fail closed. (A bare add before announcement stays lenient.)
      //   • no closing by method (limited/direct — no public closing) → submittedAt is recorded
      //     for provenance with no gate; 10.6.1 has no jurisdiction where none is advertised.
      const closing = bidClosingAt(bt.announcement, calendarOf(state));
      const sub = action.submittedAt?.slice(0, 10);
      if (closing != null) {
        if (sub) {
          if (isLateBidByDate(sub, closing)) return state; // late → refused
        } else if (todayIso() > closing) {
          return state; // bidding has closed → a submission date is required to admit a bid
        }
      } else if (bt.announcement.mode === 'public' && sub) {
        return state; // announced method, not yet published — nothing to validate against
      }
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        bidders: [
          ...t.bidders,
          { id: `b${t.bidders.length + 1}-${t.id}`, name: action.name, docsOk: true, bondOk: true, ...(sub ? { submittedAt: sub } : {}) },
        ],
      }));
    }
    // Every refusal below returns the ORIGINAL tender reference. Allocating `{...t}` first and
    // refusing inside the inner map would defeat patchTender's identity guard, and the wrapper
    // would append a success-shaped audit row for an act the engine actually refused (8.1-e).
    case 'SET_TECHNICAL':
      return patchTender(state, action.tenderId, (t) => {
        const b = t.bidders.find((x) => x.id === action.bidderId);
        if (!b) return t; // unknown bidder → refused
        // §9 C8.6 (10.6.18) — a bidder cannot be marked technically qualified while any imported
        // critical material in its declarations fails the origin gate; marking 'fail' is always allowed.
        if (action.result === 'pass' && bidderOriginBlocker(b.materials ?? [])) return t;
        return { ...t, bidders: t.bidders.map((x) => (x === b ? { ...x, technicalResult: action.result } : x)) };
      });
    case 'SET_PRICE':
      return patchTender(state, action.tenderId, (t) => {
        const b = t.bidders.find((x) => x.id === action.bidderId);
        if (!b) return t; // unknown bidder → refused
        // price column locked until technical pass + commercial step (12.4.2)
        if (!isPriceVisible(evalStepName(t.evaluationStep), b)) return t;
        return { ...t, bidders: t.bidders.map((x) => (x === b ? { ...x, priceUSD: action.priceUSD } : x)) };
      });
    case 'TOGGLE_DOC':
      return patchTender(state, action.tenderId, (t) => {
        const s = t.stages.find((x) => x.key === action.stageKey);
        if (!s || s.actualTo) return t; // unknown or already-closed stage → refused
        const has = s.uploadedDocs.includes(action.doc);
        const uploadedDocs = has ? s.uploadedDocs.filter((d) => d !== action.doc) : [...s.uploadedDocs, action.doc];
        return { ...t, stages: t.stages.map((x) => (x === s ? { ...x, uploadedDocs } : x)) };
      });
    case 'COMPLETE_STAGE':
      return patchTender(state, action.tenderId, (t) => {
        const s = t.stages.find((x) => x.key === action.stageKey);
        if (!s || s.actualTo) return t; // unknown or already-closed stage → refused
        // §9 C8.8 — a tender carrying imported critical materials cannot close its `sign` stage
        // without the ministry-body inspection and the certified-origin document (10.6.17/10.6.19).
        const req = [...requiredDocsFor(s.key), ...(s.key === 'sign' && tenderHasImportedCritical(t) ? criticalImportDocs(true) : [])];
        // stages cannot close without required documents
        if (!stageCanClose(req, s.uploadedDocs).ok) return t;
        // D1 — mirror of the server DTO bounds: a malformed annotation refuses the whole close
        // (the server would 400 it), never lands half-validated. Category from the closed list,
        // detail ≥15 chars, both-or-neither.
        if (action.devReason != null) {
          const { cat, note } = action.devReason;
          if (!(DEV_REASON_CATS as readonly string[]).includes(cat) || note.trim().length < 15) return t;
        }
        if (action.actualFrom && !/^\d{4}-\d{2}-\d{2}$/.test(action.actualFrom)) return t;
        return {
          ...t,
          stages: t.stages.map((x) => (x === s ? {
            ...x,
            actualTo: action.actualTo,
            ...(action.actualFrom ? { actualFrom: action.actualFrom } : {}),
            ...(action.devReason ? { devReason: { cat: action.devReason.cat, note: action.devReason.note.trim() } } : {}),
          } : x)),
        };
      });
    case 'RATIFY': {
      const rt = state.tenders.find((x) => x.id === action.tenderId);
      if (!rt) return state;
      // AUTHORITY BEFORE MERITS (client request 19ب) — the ق1 ladder says which body clears this
      // band, and `mayRatifyTier` is the same judgement TendersService.assertTierAuthority makes on
      // the server. A body reaching past its band is refused AND RECORDED: unlike the merit guards
      // below (which refuse an act nobody was entitled to attempt), this one refuses an ATTEMPT by
      // a named actor to sign somebody else's band, and that attempt is the trail's business (8.1-e).
      const tier = tenderApprovalTier(state, rt);
      if (!mayRatifyTier(action.by.role, tier)) {
        return auditAccess(state, action.type, rt.code, action.by, 'refused', `tier-${tier}`);
      }
      /**
       * ── WHICH REFUSALS ARE RECORDED, AND WHY ──────────────────────────────────────────────────
       * Two kinds of guard live below this line, and they are deliberately not treated alike:
       *
       *   · A GOVERNANCE refusal cites a clause and names a rule the actor broke — the band above,
       *     and §15.3 here. Somebody with standing asked for something the procedure forbids, and
       *     THAT is precisely what the trail exists to preserve (8.1-e). It is audited.
       *   · A STATE-SHAPE guard refuses a non-event: an already-decided file, a tender not at the
       *     ratification stage, a cancelled or suspended one. Nothing was attempted against a rule —
       *     the act had no subject at all. Recording it would fill the log with the consequences of
       *     a stale screen, so these return the SAME state reference and write nothing.
       *
       * The test is whether a CLAUSE can be cited. If one can, the refusal is a governance event.
       */
      if (rt.lifecycle || rt.ratification || currentStage(rt)?.key !== 'ratify') return state;
      // §15.3 hard block — a lone bid advertised under 21 days may NOT be awarded; the remedy is to
      // re-advertise, not to ratify. RECORDED (phase-5 fix): this used to return silently, which
      // left the client's own log unable to explain a refusal it had just made. The server records
      // `RATIFY_REFUSED … (15.3)` in api mode; local mode is the audit authority for itself, and
      // the two must not tell different stories about the same act.
      const sb = singleBidStatus(rt);
      if (sb.single && !sb.ok) {
        return auditAccess(state, action.type, rt.code, action.by, 'refused', 'clause-15.3');
      }
      const ratified = patchTender(state, action.tenderId, (t) => ({ ...t, ratification: { status: 'ratified', by: action.by, on: todayIso() } }));
      return auditAccess(ratified, action.type, rt.code, action.by, 'applied');
    }
    case 'RETURN_WITH_NOTES': {
      const qt = state.tenders.find((x) => x.id === action.tenderId);
      if (!qt) return state;
      // returning with notes occupies the SAME seat as ratifying — a refusal to approve is still a
      // decision on the file, so it answers to the same band authority (mirrors the server).
      const qTier = tenderApprovalTier(state, qt);
      if (!mayRatifyTier(action.by.role, qTier)) {
        return auditAccess(state, action.type, qt.code, action.by, 'refused', `tier-${qTier}`);
      }
      if (qt.lifecycle || qt.ratification || currentStage(qt)?.key !== 'ratify' || !action.notes.trim()) return state;
      const returned = patchTender(state, action.tenderId, (t) => ({
        ...t, ratification: { status: 'returned', by: action.by, on: todayIso(), notes: action.notes.trim() },
      }));
      return auditAccess(returned, action.type, qt.code, action.by, 'applied');
    }
    case 'CANCEL_TENDER':
      return patchTender(state, action.tenderId, (t) => {
        // documented cancellation — refused once awarded (mirrors the server guard)
        if (!govReasonValid(action.reason) || t.lifecycle?.status === 'cancelled' || t.ratification?.status === 'ratified') return t;
        return { ...t, lifecycle: { status: 'cancelled', reason: action.reason.trim(), on: todayIso(), by: action.by } };
      });
    case 'SUSPEND_TENDER':
      return patchTender(state, action.tenderId, (t) => {
        // only an active tender can be suspended
        if (!govReasonValid(action.reason) || t.lifecycle) return t;
        return { ...t, lifecycle: { status: 'suspended', reason: action.reason.trim(), on: todayIso(), by: action.by } };
      });
    case 'RESUME_TENDER':
      return patchTender(state, action.tenderId, (t) => {
        // only a suspended tender can be resumed
        if (!govReasonValid(action.reason) || t.lifecycle?.status !== 'suspended') return t;
        return { ...t, lifecycle: undefined };
      });
    case 'SUSPEND_VENDOR':
      return patchVendor(state, action.vendorId, (v) =>
        v.suspended ? v : { ...v, suspended: true, events: withEvent(v, { kind: 'suspend', reason: action.reason, on: todayIso() }) },
      );
    case 'LIFT_VENDOR':
      return patchVendor(state, action.vendorId, (v) =>
        !v.suspended ? v : { ...v, suspended: false, events: withEvent(v, { kind: 'lift', reason: action.reason, on: todayIso() }) },
      );
    case 'BAN_VENDOR':
      return patchVendor(state, action.vendorId, (v) => {
        // 14.3 cap — refuse a ban beyond 12 months (mirrors the API guard)
        if (!banWithinLimit(action.banUntil, todayIso())) return v;
        return {
          ...v,
          banUntil: action.banUntil,
          banReason: { ar: action.reason, en: action.reason },
          events: withEvent(v, { kind: 'ban', reason: action.reason, on: todayIso(), detail: `until ${action.banUntil}` }),
        };
      });
    case 'SET_VENDOR_SCORES':
      return patchVendor(state, action.vendorId, (v) => {
        const changed: string[] = [];
        const next = { ...v };
        if (action.techScore != null && action.techScore !== v.techScore) { changed.push(`T ${v.techScore}→${action.techScore}`); next.techScore = action.techScore; }
        if (action.financialScore != null && action.financialScore !== v.financialScore) { changed.push(`F ${v.financialScore}→${action.financialScore}`); next.financialScore = action.financialScore; }
        if (action.hseScore != null && action.hseScore !== v.hseScore) { changed.push(`H ${v.hseScore}→${action.hseScore}`); next.hseScore = action.hseScore; }
        if (changed.length === 0) return v;
        next.events = withEvent(v, { kind: 'scores', reason: action.reason, on: todayIso(), detail: changed.join(' · ') });
        return next;
      });
    case 'ADD_VO':
      return patchContract(state, action.contractId, (c) => {
        const next = c.voTotalUSD + action.valueUSD;
        // server VariationOrderDto @Min(0.01); §18.1 — breaching the 10% cap is refused (audited)
        if (action.valueUSD < 0.01 || variationOrdersCap(next, c.valueUSD).status === 'breach') return c;
        return { ...c, voTotalUSD: next, events: withContractEvent(c, { kind: 'vo', detail: usd(action.valueUSD), on: action.approvedOn }) };
      });
    case 'ADD_EXTENSION':
      return patchContract(state, action.contractId, (c) => {
        const next = c.extensionDays + action.days;
        // server ExtensionDto @IsInt @Min(1); §19.3 — extension beyond 25% of the term is refused
        if (!Number.isInteger(action.days) || action.days < 1 || extensionCap(next, c.termDays).status === 'breach') return c;
        return { ...c, extensionDays: next, events: withContractEvent(c, { kind: 'extension', detail: `${action.days}d`, on: action.approvedOn }) };
      });
    case 'ADD_LD':
      return patchContract(state, action.contractId, (c) => {
        const next = c.ldTotalUSD + action.valueUSD;
        // server LiquidatedDamageDto @Min(0.01); §21.2 — LDs beyond 10% of contract value are refused
        if (action.valueUSD < 0.01 || liquidatedDamagesCap(next, c.valueUSD).status === 'breach') return c;
        return { ...c, ldTotalUSD: next, events: withContractEvent(c, { kind: 'ld', detail: usd(action.valueUSD), on: action.appliedOn }) };
      });
    case 'ADD_GUARANTEE':
      return patchContract(state, action.contractId, (c) => {
        // the add-guarantee UI only issues performance bonds, whose rule the client can re-run:
        // value ≥ $0.01 (server @Min(0.01)) and ≥5% of contract value (performanceBondValid)
        if (action.valueUSD < 0.01) return c;
        if (action.kind === 'performance' && !performanceBondValid(action.valueUSD, c.valueUSD).ok) return c;
        return {
          ...c,
          guarantees: [...c.guarantees, { kind: action.kind, valueUSD: action.valueUSD, expiresOn: action.expiresOn }],
          events: withContractEvent(c, { kind: 'guarantee', detail: usd(action.valueUSD), on: action.expiresOn }),
        };
      });
    case 'ADD_SUSPENSION':
      return patchContract(state, action.contractId, (c) => {
        const next = c.suspensionDays + action.days;
        // §20.2 — cumulative suspension beyond 25% of the original term is refused
        if (!Number.isInteger(action.days) || action.days < 1 || suspensionCap(next, c.termDays).status === 'breach') return c;
        return { ...c, suspensionDays: next, events: withContractEvent(c, { kind: 'suspension', detail: `${action.days}d`, on: action.on }) };
      });
    case 'RENEW_CONTRACT':
      return patchContract(state, action.contractId, (c) => {
        // §19.1 — a single renewal may not exceed one year
        if (!renewalAllowed(action.years).ok) return c;
        return { ...c, renewalYears: (c.renewalYears ?? 0) + action.years, events: withContractEvent(c, { kind: 'renewal', detail: `${action.years}y`, on: action.on }) };
      });
    case 'ADVANCE_CONTRACT_STAGE':
      return patchContract(state, action.contractId, (c) => {
        const idx = c.stages.findIndex((s) => !s.actualTo);
        if (idx === -1) return c; // fully delivered — nothing to advance
        const stages = c.stages.map((s, i) => (i === idx ? { ...s, actualTo: action.actualTo } : s));
        return { ...c, stages, events: withContractEvent(c, { kind: 'stage', detail: c.stages[idx]!.key, on: action.actualTo }) };
      });
    case 'CREATE_USER': {
      const at = new Date().toISOString();
      // 409 ConflictException('Email or Azure OID already exists') → USER_CREATE_REFUSED
      const dupEmail = state.users.some((u) => u.email.toLowerCase() === action.email.toLowerCase());
      const dupOid = state.users.some((u) => u.azureOid === action.azureOid);
      if (dupEmail || dupOid) {
        return auditAccess(state, action.type, action.email, action.by, 'refused', dupEmail ? 'dup-email' : 'dup-oid');
      }
      // 400 — operator roles require a company; platform roles must not carry one
      if (!scopeConsistent(action.role, action.operatorId)) {
        return auditAccess(state, action.type, action.email, action.by, 'refused', 'scope');
      }
      // 400 BadRequestException('Unknown operator')
      if (action.operatorId && !state.operators.some((o) => o.id === action.operatorId)) {
        return auditAccess(state, action.type, action.email, action.by, 'refused', 'unknown-operator');
      }
      const created: UserAccount = {
        id: action.userId,
        azureOid: action.azureOid,
        name: action.name,
        email: action.email,
        role: action.role,
        operatorId: action.operatorId,
        twoFa: action.twoFa,
        disabled: false,
        events: [{ kind: 'create', reason: action.reason, on: at.slice(0, 10), at, by: action.by }],
      };
      return auditAccess({ ...state, users: [...state.users, created] }, action.type, action.email, action.by, 'applied');
    }
    case 'SET_USER_ROLE': {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target) return state;
      if (action.role === target.role && action.operatorId === target.operatorId) return state;
      const nextOperatorId = isOperatorRole(action.role) ? action.operatorId : undefined;
      // 400 ('A super admin cannot disable or demote themselves')
      if (target.role === 'SUPER_ADMIN' && action.role !== 'SUPER_ADMIN' && action.by.oid === target.azureOid) {
        return refuseAccess(state, action, 'self');
      }
      // 400 ('Cannot remove the last enabled super admin')
      if (target.role === 'SUPER_ADMIN' && action.role !== 'SUPER_ADMIN' && isLastEnabledSuper(state, action.userId)) {
        return refuseAccess(state, action, 'last-super');
      }
      if (!scopeConsistent(action.role, nextOperatorId)) return refuseAccess(state, action, 'scope');
      const at = new Date().toISOString();
      const next = patchUser(state, action.userId, (u) => ({
        ...u,
        role: action.role,
        operatorId: nextOperatorId,
        events: withUserEvent(u, {
          kind: 'role', reason: action.reason, on: at.slice(0, 10), at, by: action.by,
          detail: `${target.role}→${action.role}`,
        }),
      }));
      return auditAccess(next, action.type, target.email, action.by, 'applied');
    }
    case 'SET_USER_SCOPE': {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target || action.operatorId === target.operatorId) return state;
      if (!scopeConsistent(target.role, action.operatorId)) return refuseAccess(state, action, 'scope');
      if (action.operatorId && !state.operators.some((o) => o.id === action.operatorId)) {
        return refuseAccess(state, action, 'unknown-operator');
      }
      const at = new Date().toISOString();
      const next = patchUser(state, action.userId, (u) => ({
        ...u,
        operatorId: action.operatorId,
        events: withUserEvent(u, {
          kind: 'scope', reason: action.reason, on: at.slice(0, 10), at, by: action.by,
          detail: `${target.operatorId ?? '—'}→${action.operatorId ?? '—'}`,
        }),
      }));
      return auditAccess(next, action.type, target.email, action.by, 'applied');
    }
    case 'SET_USER_TWOFA': {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target || target.twoFa === action.twoFa) return state;
      const at = new Date().toISOString();
      const next = patchUser(state, action.userId, (u) => ({
        ...u,
        twoFa: action.twoFa,
        events: withUserEvent(u, {
          kind: 'twofa', reason: action.reason, on: at.slice(0, 10), at, by: action.by,
          detail: action.twoFa ? 'on' : 'off',
        }),
      }));
      return auditAccess(next, action.type, target.email, action.by, 'applied');
    }
    case 'SET_USER_DISABLED': {
      const target = state.users.find((u) => u.id === action.userId);
      if (!target || target.disabled === action.disabled) return state;
      if (action.disabled) {
        // 400 ('A super admin cannot disable or demote themselves')
        if (target.role === 'SUPER_ADMIN' && action.by.oid === target.azureOid) return refuseAccess(state, action, 'self');
        // 400 ('Cannot remove the last enabled super admin')
        if (isLastEnabledSuper(state, action.userId)) return refuseAccess(state, action, 'last-super');
      }
      const at = new Date().toISOString();
      const next = patchUser(state, action.userId, (u) => ({
        ...u,
        disabled: action.disabled,
        events: withUserEvent(u, {
          kind: action.disabled ? 'disable' : 'enable',
          reason: action.reason, on: at.slice(0, 10), at, by: action.by,
        }),
      }));
      return auditAccess(next, action.type, target.email, action.by, 'applied');
    }
    case 'CREATE_OPERATOR': {
      // a governed write with no documented justification is refused (server @Length(20,2000)) —
      // the same guard ADD_HOLIDAY / REMOVE_HOLIDAY enforce, so no raw dispatch can slip past it.
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, action.name, action.by, 'refused', 'reason-invalid');
      const dupId = state.operators.some((o) => o.id === action.operatorId);
      const dupName = state.operators.some((o) => o.name.trim() === action.name.trim());
      if (dupId || dupName) {
        return auditAccess(state, action.type, action.name, action.by, 'refused', dupId ? 'dup-id' : 'dup-name');
      }
      // FA is not set here — it belongs to the field's Service Contract (§7.1)
      const created: OperatorOrg = {
        id: action.operatorId,
        name: action.name.trim(),
        nameEn: action.nameEn?.trim() || undefined,
      };
      return auditAccess({ ...state, operators: [...state.operators, created] }, action.type, created.name, action.by, 'applied');
    }
    case 'SET_OPERATOR_TIERS': {
      // the target is the operator ID: it is the key the override is stored under, so an audit
      // row naming anything else could not be tied back to the entry it moved
      const target = action.operatorId;
      // 1 — a ladder for a company that is not registered names nothing and would sit inert
      if (!state.operators.some((o) => o.id === target)) {
        return auditAccess(state, action.type, target, action.by, 'refused', 'unknown-operator');
      }
      // 2 — approving (or withdrawing) a company's signature ladder retroactively re-measures
      // every one of its live requests; without a documented justification it is refused, checked
      // BEFORE the no-op exactly as SET_CONTRACT_FA and ADD_HOLIDAY check theirs
      if (!govReasonValid(action.reason)) {
        return auditAccess(state, action.type, target, action.by, 'refused', 'reason');
      }
      // 3 — the entry gate (ladderApprovable): finite, non-negative, operator ceiling STRICTLY
      // below the JMC ceiling. Not applied to `null`, which withdraws rather than sets one.
      if (action.tiers && !ladderApprovable(action.tiers)) {
        return auditAccess(state, action.type, target, action.by, 'refused', 'ladder-invalid');
      }
      const current = state.operatorTiers[target];
      // 4 — no change, no row: a row claiming a change that never happened is the same
      // fabrication as an unrecorded one (the SET_USER_ROLE precedent, verbatim)
      if (action.tiers ? sameTiers(current, action.tiers) : !current) return state;
      const operatorTiers = { ...state.operatorTiers };
      if (action.tiers) operatorTiers[target] = action.tiers;
      else delete operatorTiers[target];
      // the transition in the SAME `OLD→NEW` shape SET_USER_ROLE writes, with the SYSTEM DEFAULT
      // named as the standing end of it: a company arriving from the default, or returning to it,
      // is a real move and the row has to say which ladder it left and which it now stands on
      const ladderText = (x: ApprovalTiers | undefined) => (x ? `${usd(x.operatorMaxUSD)}/${usd(x.jmcMaxUSD)}` : 'default');
      return auditAccess(
        { ...state, operatorTiers },
        action.type, target, action.by, 'applied',
        undefined,
        `${ladderText(current)}→${ladderText(action.tiers ?? undefined)}`,
      );
    }
    case 'CREATE_FIELD': {
      // a field is born with its Service Contract — the source of an authority (§7.1); creating one
      // without a documented justification is refused, exactly as its governance siblings are.
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, action.name, action.by, 'refused', 'reason-invalid');
      const code = action.code.trim().toUpperCase();
      if (state.fields.some((f) => f.id === action.fieldId || f.code.trim().toUpperCase() === code)) {
        return auditAccess(state, action.type, action.name, action.by, 'refused', 'dup-field');
      }
      if (!state.operators.some((o) => o.id === action.operatorId)) {
        return auditAccess(state, action.type, action.name, action.by, 'refused', 'unknown-operator');
      }
      if (!(action.financialAuthorityUSD > 0)) {
        return auditAccess(state, action.type, action.name, action.by, 'refused', 'fa-invalid');
      }
      // a contract must be in force to be usable — reject an expiry that precedes signing, so
      // no field is born permanently ineffective even from a raw (non-modal) dispatch
      if (!(action.signedOn < action.expiresOn)) {
        return auditAccess(state, action.type, action.name, action.by, 'refused', 'dates-invalid');
      }
      const created: Field = { id: action.fieldId, name: action.name.trim(), nameEn: action.nameEn?.trim() || undefined, code, operatorId: action.operatorId };
      const contract: ServiceContract = { id: action.contractId, code: action.contractCode.trim(), fieldId: action.fieldId, financialAuthorityUSD: action.financialAuthorityUSD, signedOn: action.signedOn, expiresOn: action.expiresOn };
      return auditAccess({ ...state, fields: [...state.fields, created], serviceContracts: [...state.serviceContracts, contract] }, action.type, created.name, action.by, 'applied');
    }
    case 'SET_CONTRACT_FA': {
      const target = state.serviceContracts.find((c) => c.id === action.contractId);
      if (!target) return state;
      // moving an authority reshapes MCT entry, MDOC tier and split detection retroactively — it is
      // refused without a documented justification (checked before the no-op, like ADD_HOLIDAY).
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.code, action.by, 'refused', 'reason-invalid');
      if (target.financialAuthorityUSD === action.financialAuthorityUSD) return state;
      // an FA of zero would put every request above authority — §7 requires a real figure
      if (!(action.financialAuthorityUSD > 0)) {
        return auditAccess(state, action.type, target.code, action.by, 'refused', 'fa-invalid');
      }
      const next = {
        ...state,
        serviceContracts: state.serviceContracts.map((c) => (c.id === action.contractId ? { ...c, financialAuthorityUSD: action.financialAuthorityUSD } : c)),
      };
      return auditAccess(next, action.type, target.code, action.by, 'applied');
    }
    case 'RENAME_FIELD': {
      const target = state.fields.find((f) => f.id === action.fieldId);
      if (!target) return state;
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.code, action.by, 'refused', 'reason-invalid');
      const name = action.name.trim();
      const nameEn = action.nameEn?.trim() || undefined;
      if (!name) return auditAccess(state, action.type, target.code, action.by, 'refused', 'name-required');
      if (name === target.name && nameEn === target.nameEn) return state; // no-op → nothing to record
      const next = patchField(state, action.fieldId, (f) => ({
        ...f, name, nameEn,
        events: withFieldEvent(f, { kind: 'rename', reason: action.reason.trim(), on: todayIso(), detail: `${target.name}→${name}` }),
      }));
      return auditAccess(next, action.type, target.code, action.by, 'applied');
    }
    case 'ARCHIVE_FIELD': {
      const target = state.fields.find((f) => f.id === action.fieldId);
      if (!target) return state;
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.code, action.by, 'refused', 'reason-invalid');
      if (target.archived) return state; // already archived → silent no-op
      // ق7 with teeth: hiding a field whose procurement is still running would strand live work
      // behind an invisible record. The refusal is audited so the attempt is on file (8.1-e).
      const live = activeTendersOfField(state, action.fieldId).length;
      if (live > 0) return auditAccess(state, action.type, target.code, action.by, 'refused', 'active-tenders');
      const next = patchField(state, action.fieldId, (f) => ({
        ...f, archived: true,
        events: withFieldEvent(f, { kind: 'archive', reason: action.reason.trim(), on: todayIso() }),
      }));
      return auditAccess(next, action.type, target.code, action.by, 'applied');
    }
    case 'RESTORE_FIELD': {
      const target = state.fields.find((f) => f.id === action.fieldId);
      if (!target) return state;
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.code, action.by, 'refused', 'reason-invalid');
      if (!target.archived) return state; // not archived → silent no-op
      const next = patchField(state, action.fieldId, (f) => ({
        ...f, archived: undefined,
        events: withFieldEvent(f, { kind: 'restore', reason: action.reason.trim(), on: todayIso() }),
      }));
      return auditAccess(next, action.type, target.code, action.by, 'applied');
    }
    case 'ARCHIVE_VENDOR': {
      const target = state.vendors.find((v) => v.id === action.vendorId);
      if (!target) return state;
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.name, action.by, 'refused', 'reason-invalid');
      if (target.archived) return state;
      // NO history gate here, deliberately (ق7): participations, contracts and events are immutable
      // and remain readable on the file — archiving withdraws the entity from FUTURE selection only.
      const next = patchVendor(state, action.vendorId, (v) => ({
        ...v, archived: true, events: withEvent(v, { kind: 'archive', reason: action.reason.trim(), on: todayIso() }),
      }));
      return auditAccess(next, action.type, target.name, action.by, 'applied');
    }
    case 'RESTORE_VENDOR': {
      const target = state.vendors.find((v) => v.id === action.vendorId);
      if (!target) return state;
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, target.name, action.by, 'refused', 'reason-invalid');
      if (!target.archived) return state;
      const next = patchVendor(state, action.vendorId, (v) => ({
        ...v, archived: undefined, events: withEvent(v, { kind: 'restore', reason: action.reason.trim(), on: todayIso() }),
      }));
      return auditAccess(next, action.type, target.name, action.by, 'applied');
    }
    case 'CREATE_VENDOR': {
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, action.name, action.by, 'refused', 'reason-invalid');
      const name = action.name.trim();
      if (!name) return auditAccess(state, action.type, action.name, action.by, 'refused', 'name-required');
      // 12.4.2 and deriveParticipation both match a bidder to a vendor BY NAME — two vendors sharing
      // a name would make every participation ambiguous, so the duplicate is refused, not disambiguated.
      const dupId = state.vendors.some((v) => v.id === action.vendorId);
      const dupName = state.vendors.some((v) => v.name.trim() === name);
      if (dupId || dupName) return auditAccess(state, action.type, name, action.by, 'refused', dupId ? 'dup-id' : 'dup-name');
      // scores start at 0: an unassessed entity must not be born with a capability figure nobody
      // measured. `isStateCompany` is never set from here — the five are seeded law, not data entry.
      const created: VendorState = { id: action.vendorId, name, mooListed: action.mooListed, techScore: 0, financialScore: 0, hseScore: 0 };
      return auditAccess({ ...state, vendors: [...state.vendors, created] }, action.type, name, action.by, 'applied');
    }
    case 'ADD_HOLIDAY': {
      // ISO date only ('YYYY-MM-DD'); idempotent; kept sorted by date so the calendar is deterministic.
      // Self-audits (applied/refused) with the Actor — a retroactive deadline shift is attributed.
      const date = action.date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return auditAccess(state, action.type, action.date, action.by, 'refused', 'date-invalid');
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, date, action.by, 'refused', 'reason-invalid');
      if (state.holidays.some((h) => h.date === date)) return state; // already a holiday → silent no-op
      const entry: Holiday = { date, ...(action.name?.trim() ? { name: action.name.trim() } : {}) };
      const next = { ...state, holidays: [...state.holidays, entry].sort((a, b) => a.date.localeCompare(b.date)) };
      return auditAccess(next, action.type, date, action.by, 'applied');
    }
    case 'REMOVE_HOLIDAY': {
      const date = action.date.slice(0, 10);
      if (!govReasonValid(action.reason)) return auditAccess(state, action.type, date, action.by, 'refused', 'reason-invalid');
      if (!state.holidays.some((h) => h.date === date)) return state; // not a holiday → silent no-op
      const next = { ...state, holidays: state.holidays.filter((h) => h.date !== date) };
      return auditAccess(next, action.type, date, action.by, 'applied');
    }
    case 'SET_LC_CLAUSE':
      return patchTender(state, action.tenderId, (t) => {
        // C8.1 — only a tender the §9 requirement applies to HAS a clause to affix; attesting on a
        // tender the rule does not reach would fabricate a compliance record, so it is refused.
        if (!tenderLocalContentApplies(state, t)) return t;
        // once published the documents are in the market: a correction is a corrective announcement,
        // never a retroactive flip of the attestation the publication was gated on.
        if (t.announcement.publishedOn) return t;
        if ((t.localContentClauseAffixed ?? false) === action.affixed) return t; // no-op
        return { ...t, localContentClauseAffixed: action.affixed };
      });
    case 'SET_STATE_RESPONSE': {
      // C8.2 — a documented reason is the justification of record; a `declined` response carries it as
      // the evidence that makes non-participation a lawful exemption (accepted/pending carry none).
      if (!govReasonValid(action.reason)) return state;
      return patchTender(state, action.tenderId, (t) => {
        const others = (t.stateResponses ?? []).filter((r) => r.company !== action.company);
        const resp: StateCompanyResponse = { company: action.company, status: action.status, ...(action.status === 'declined' ? { evidence: action.reason.trim() } : {}) };
        return { ...t, stateResponses: [...others, resp].sort((a, b) => a.company.localeCompare(b.company)) };
      });
    }
    case 'SET_BIDDER_MATERIALS':
      return patchTender(state, action.tenderId, (t) => ({
        ...t,
        bidders: t.bidders.map((b) => (b.id === action.bidderId ? { ...b, materials: action.materials } : b)),
      }));
    case 'HYDRATE':
      return action.state;
    case 'UPSERT_TENDER':
      return {
        ...state,
        tenders: state.tenders.some((t) => t.id === action.tender.id)
          ? state.tenders.map((t) => (t.id === action.tender.id ? action.tender : t))
          : [action.tender, ...state.tenders],
      };
    case 'RESET':
      return seedState();
    default:
      return state;
  }
}

const NON_AUDITED = new Set([
  'RESET', 'HYDRATE', 'UPSERT_TENDER',
  // The award decision joined the self-auditing set when the ladder became an authority gate
  // (19ب): an attempt to sign a band above one's body is a refusal that MUST be attributed and
  // reason-coded, and the generic wrapper writes one success-shaped row for everything. Note this
  // is NON_AUDITED only — not CLIENT_ONLY — so in api mode both still travel to the server, which
  // remains the audit authority there (the two sets are decoupled exactly for this).
  'RATIFY', 'RETURN_WITH_NOTES',
  // access actions audit themselves inside apply() with an outcome + actor the wrapper cannot supply
  'CREATE_USER', 'SET_USER_ROLE', 'SET_USER_SCOPE', 'SET_USER_TWOFA', 'SET_USER_DISABLED',
  'CREATE_OPERATOR', 'CREATE_FIELD', 'SET_CONTRACT_FA',
  // approving a company's own signature ladder self-audits applied/refused with its Actor and,
  // on success, the OLD→NEW transition the target id alone cannot carry (2026-08-25)
  'SET_OPERATOR_TIERS',
  // registry governance (ق7 archive model + request 9 later-edit + request 14 add): every one
  // self-audits applied/refused with its Actor, exactly like the CREATE_FIELD precedent above.
  'RENAME_FIELD', 'ARCHIVE_FIELD', 'RESTORE_FIELD',
  'ARCHIVE_VENDOR', 'RESTORE_VENDOR', 'CREATE_VENDOR',
  // holiday changes self-audit (attributed, with a reason) — a retroactive calendar shift
  'ADD_HOLIDAY', 'REMOVE_HOLIDAY',
]);

/**
 * LOCAL_ONLY — actions with NO server route, always applied to local state (even in API mode). This
 * is DISTINCT from NON_AUDITED (which only governs the audit wrapper): decoupling the two is what
 * lets a self-auditing action (e.g. holidays) still reach the server in API mode. An action that is
 * NON_AUDITED but NOT here (RATIFY, RETURN_WITH_NOTES, ADD_HOLIDAY) goes through runAction to the server.
 * The access actions are server-modeled (`/api/users` exists), but api-mode login cannot mint a
 * SUPER_ADMIN session and runAction has no /users branch yet, so they apply locally for now.
 */
const CLIENT_ONLY = new Set([
  // control actions that never carry a server route — applied locally in either mode
  'RESET', 'HYDRATE', 'UPSERT_TENDER',
  'ADVANCE_CONTRACT_STAGE', 'ADD_SUSPENSION', 'RENEW_CONTRACT',
  'CREATE_USER', 'SET_USER_ROLE', 'SET_USER_SCOPE', 'SET_USER_TWOFA', 'SET_USER_DISABLED',
  // there is no /operators endpoint at all — these are local-only by necessity, not by choice
  'CREATE_OPERATOR', 'CREATE_FIELD', 'SET_CONTRACT_FA',
  // NAMED DEBT (ops/OPERATOR-TIERS-SPEC.md §9 phase 2 / ops/POST-V2-IMPROVEMENTS.md §د): the server
  // has no per-operator ladder model — `assertTierAuthority` reads DEFAULT_APPROVAL_TIERS directly.
  // Because a local override would make a disabled «صادق» button and a 403 disagree, the EDITOR is
  // withheld in api-mode (Operators.tsx) rather than the write being faked. Remove from this set
  // and reopen the editor the day the endpoint lands.
  'SET_OPERATOR_TIERS',
  // NAMED DEBT (client wave 1, phase 2): the archive model and the entity registry have no server
  // routes either — /api/fields and /api/service-contracts do not exist at all, and /api/vendors
  // exposes suspend/lift/ban/scores but neither an archive flag nor a create route. Every screen
  // that dispatches one of these carries a «محلي» badge or banner so API mode never pretends the
  // write reached the server. Remove from this set the day the endpoints land.
  'RENAME_FIELD', 'ARCHIVE_FIELD', 'RESTORE_FIELD',
  'ARCHIVE_VENDOR', 'RESTORE_VENDOR', 'CREATE_VENDOR',
  // NOTE: ADD_HOLIDAY / REMOVE_HOLIDAY are deliberately NOT here — /api/holidays is wired (below),
  // so in API mode they POST/DELETE to the server; in local mode they self-audit via the reducer.
]);

export function reducer(state: State, action: Action): State {
  const next = apply(state, action);
  if (NON_AUDITED.has(action.type) || next === state) return next;
  // ratify/return/cancel/suspend/resume carry the Actor — attribute the audit row to it.
  // (Access actions carry an Actor too, but they self-audit inside apply() and are NON_AUDITED.)
  const by = 'by' in action && typeof action.by === 'object' ? action.by : undefined;
  // append-only audit (8.1-e) — attempts are logged whether or not the guard let them through
  return {
    ...next,
    audit: [...next.audit, { ts: new Date().toISOString(), action: action.type, target: actionTarget(state, next, action), ...(by ? { by } : {}) }],
  };
}

/* ---------------- seed ---------------- */

/**
 * The SYSTEM DEFAULT approval ladder as the client seeded it (ق1, 2026-08-20): ≤5M the operating
 * company's own, 5–10M the Joint Management Committee's, >10M نفط الوسط's.
 *
 * The figures now live in the engine (`DEFAULT_APPROVAL_TIERS`) and are re-exported under the
 * store's own name: the API service gates ط2/ط3 ratification on the same two ceilings, and a
 * second literal here would be a second ladder — the exact drift `normTiers` refuses to create.
 *
 * ── THE OTHER HALF OF THIS LADDER ───────────────────────────────────────────────────────────────
 * The client reads `state.approvalTiers` as the default and `state.operatorTiers` as the approved
 * per-company overrides above it (2026-08-25), resolved in ONE place: `resolveTiersFor`. The server
 * reads the engine constant directly (`TendersService.assertTierAuthority`, apps/api/src/tenders/
 * tenders.service.ts) and has no ladder model at all — that constant is its authoritative ladder,
 * and it knows nothing of an override.
 *
 * That asymmetry is why the per-operator EDITOR is withheld in api-mode (Operators.tsx) and
 * `SET_OPERATOR_TIERS` sits in CLIENT_ONLY: a locally approved ceiling the server does not enforce
 * would make a disabled «صادق» button and a 403 disagree, which is the one thing the ladder must
 * never do. In api-mode the shown ladder is therefore the DEFAULT, which is exactly what the
 * server rules by, so the two halves still agree.
 *
 * NAMED DEBT (ops/OPERATOR-TIERS-SPEC.md §9 phase 2, ops/POST-V2-IMPROVEMENTS.md §د): the server
 * needs the ladder model, the governed endpoint and the same resolution order. Move BOTH sites
 * together or the drift alarms (jmcRole.test.ts here, tenders.service.spec.ts there) will fail —
 * which is their job.
 */
export const SEED_APPROVAL_TIERS: ApprovalTiers = DEFAULT_APPROVAL_TIERS;

/**
 * The demo universe is نفط الوسط (MDOC — Midland Oil Company, central Iraq): the 13 real fields
 * and their 12 Lead Contractors, adopted verbatim from the delivery registry (spec §1). Every
 * tender below lives in one of those fields, and the four of them deliberately span all three
 * approval tiers so the ladder is visible on first load rather than theoretical:
 *   t1  4.20M  AHDAB (AlWaha)   → OPERATOR — within the company's own authority, no gate
 *   t2  0.85M  BADRA            → OPERATOR — and running late, the deviation story
 *   t3  7.80M  MANSURIA (FZE)   → JMC      — above FA, at the ratification decision
 *   t4 12.40M  BLOCK-07 (CNOOC) → MDOC     — above FA, parked at the approval gate
 */
export function seedState(): State {
  const t1: Tender = {
    id: 't1',
    operatorId: 'op-alwaha',
    fieldId: 'f-ahdab',
    scope: 'DRILLING', // a drilling tender, but 4.2M < its 5M FA → §9 does not trigger (not-required)
    code: 'AH-DRL-0212',
    title: { ar: 'حفر آبار تطويرية — حقل الأحدب', en: 'Development well drilling — Ahdab field' },
    budgetCode: 'AH-DRL-77',
    estimatedValueUSD: 4_200_000,
    methodId: 7,
    createdOn: '2026-04-28',
    stages: [
      { key: 'cost', plannedFrom: '2026-05-01', plannedTo: '2026-05-07', actualTo: '2026-05-07', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-08', plannedTo: '2026-05-12', actualTo: '2026-05-12', uploadedDocs: ['stage-report'] },
      { key: 'announce', plannedFrom: '2026-05-13', plannedTo: '2026-06-05', actualTo: '2026-06-05', uploadedDocs: ['announcement-copy'] },
      { key: 'tech-open', plannedFrom: '2026-06-07', plannedTo: '2026-06-09', actualTo: '2026-06-09', uploadedDocs: ['opening-minutes'] },
      { key: 'tech-analysis', plannedFrom: '2026-06-10', plannedTo: '2026-06-21', uploadedDocs: [] },
      { key: 'comm-open', plannedFrom: '2026-06-22', plannedTo: '2026-06-24', uploadedDocs: [] },
      { key: 'comm-analysis', plannedFrom: '2026-06-25', plannedTo: '2026-07-05', uploadedDocs: [] },
      { key: 'ratify', plannedFrom: '2026-07-06', plannedTo: '2026-07-15', uploadedDocs: [] },
      { key: 'sign', plannedFrom: '2026-07-16', plannedTo: '2026-07-22', uploadedDocs: [] },
    ],
    announcement: {
      mode: 'public',
      periodDays: 23,
      newspapers: ['الصباح', 'الزمان', 'المدى'],
      lcWebsite: true,
      rocWebsite: true,
      inviteeCount: 0,
      inviteesPreQualified: false,
      publishedOn: '2026-05-13',
    },
    evaluationStep: 1,
    bidders: [
      { id: 'b1-t1', name: 'شركة الحفر العراقية', docsOk: true, bondOk: true, technicalResult: 'pass' },
      { id: 'b2-t1', name: 'النور للمقاولات النفطية', docsOk: true, bondOk: true, technicalResult: 'fail' },
      { id: 'b3-t1', name: 'Basra Energy Services', docsOk: true, bondOk: true, technicalResult: 'pass' },
      { id: 'b4-t1', name: 'دجلة للخدمات النفطية', docsOk: true, bondOk: false },
    ],
  };

  const t2: Tender = {
    id: 't2',
    operatorId: 'op-badra',
    fieldId: 'f-badra',
    scope: 'OTHER', // maintenance — §9 participation requirement does not apply
    code: 'BD-MNT-0098',
    title: { ar: 'صيانة محطة الضخ المركزية — حقل بدرة', en: 'Central pump station maintenance — Badra field' },
    budgetCode: 'BD-MNT-12',
    estimatedValueUSD: 850_000,
    methodId: 6,
    createdOn: '2026-05-10',
    stages: [
      { key: 'cost', plannedFrom: '2026-05-12', plannedTo: '2026-05-20', actualTo: '2026-05-29', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-30', plannedTo: '2026-06-20', uploadedDocs: [] },
      { key: 'preq', uploadedDocs: [] },
      { key: 'invite', uploadedDocs: [] },
      { key: 'tech-open', uploadedDocs: [] },
      { key: 'tech-analysis', uploadedDocs: [] },
      { key: 'comm-open', uploadedDocs: [] },
      { key: 'comm-analysis', uploadedDocs: [] },
      { key: 'ratify', uploadedDocs: [] },
      { key: 'sign', uploadedDocs: [] },
    ],
    announcement: { ...defaultAnnouncementFor(6) },
    evaluationStep: 0,
    bidders: [],
  };

  // above Financial Authority → in the MCT cycle (6.9); 7.8M sits in the JMC band (ق1)
  const t3: Tender = {
    id: 't3',
    operatorId: 'op-fze',
    fieldId: 'f-mansuria',
    scope: 'ENGINEERING_CONSTRUCTION', // EPC above FA → §9 applies; a documented decline below → exempt
    // C8.2 — SCOP declined with a documented justification, so the tender is a lawful EXEMPTION (not a
    // violation, not a void): the operator sees the legal path live in the compliance view.
    stateResponses: [{ company: 'SCOP', status: 'declined', evidence: 'اعتذار رسمي موثّق من الشركة لارتباط طاقتها بمشروع قائم (كتاب 2026/155)' }],
    code: 'MN-EPC-0305',
    title: { ar: 'إنشاء محطة معالجة الغاز المركزية — حقل المنصورية', en: 'Central gas processing station EPC — Mansuria field' },
    budgetCode: 'MN-EPC-04',
    estimatedValueUSD: 7_800_000,
    methodId: 7,
    createdOn: '2026-04-20',
    stages: [
      { key: 'cost', plannedFrom: '2026-04-22', plannedTo: '2026-04-30', actualTo: '2026-04-30', uploadedDocs: ['stage-report'] },
      { key: 'approval', plannedFrom: '2026-05-01', plannedTo: '2026-05-06', actualTo: '2026-05-06', uploadedDocs: ['stage-report'] },
      { key: 'announce', plannedFrom: '2026-05-07', plannedTo: '2026-05-30', actualTo: '2026-05-30', uploadedDocs: ['announcement-copy'] },
      { key: 'tech-open', plannedFrom: '2026-05-31', plannedTo: '2026-06-02', actualTo: '2026-06-02', uploadedDocs: ['opening-minutes'] },
      { key: 'tech-analysis', plannedFrom: '2026-06-03', plannedTo: '2026-06-08', actualTo: '2026-06-08', uploadedDocs: ['evaluation-report'] },
      { key: 'comm-open', plannedFrom: '2026-06-09', plannedTo: '2026-06-10', actualTo: '2026-06-10', uploadedDocs: ['opening-minutes'] },
      { key: 'comm-analysis', plannedFrom: '2026-06-11', plannedTo: '2026-06-25', actualTo: '2026-06-24', uploadedDocs: ['evaluation-report'] },
      { key: 'ratify', plannedFrom: '2026-06-26', plannedTo: '2026-07-06', uploadedDocs: [] },
      { key: 'sign', plannedFrom: '2026-07-07', plannedTo: '2026-07-14', uploadedDocs: [] },
    ],
    announcement: {
      mode: 'public',
      periodDays: 23,
      newspapers: ['الصباح', 'العالم', 'المدى'],
      lcWebsite: true,
      rocWebsite: true,
      inviteeCount: 0,
      inviteesPreQualified: false,
      publishedOn: '2026-05-07',
    },
    evaluationStep: 3,
    bidders: [
      { id: 'b1-t3', name: 'Gulf EPC Contracting', docsOk: true, bondOk: true, technicalResult: 'pass', priceUSD: 8_120_000 },
      { id: 'b2-t3', name: 'شركة المشاريع النفطية SCOP', docsOk: true, bondOk: true, technicalResult: 'pass', priceUSD: 8_940_000 },
      { id: 'b3-t3', name: 'الفرات للإنشاءات', docsOk: true, bondOk: true, technicalResult: 'fail' },
    ],
    mct: {
      notifiedOn: '2026-05-24',
      meetingHeldOn: '2026-06-08',
      lcEstimateUSD: 7_800_000,
      mctEstimateUSD: 7_500_000,
    },
  };

  /**
   * The third band (ق1): 12.4M is past the 10M JMC ceiling, so this one waits on نفط الوسط
   * itself. It is parked at the `approval` stage on purpose — that stage IS the approval chain,
   * so the tender reads as «pending MDOC» from the registry without any new field. It is also
   * above the Block-07 contract FA (4.5M), which is what opened the MCT case below.
   * §9 story: the third of the three states — EPC above FA with a state company ACCEPTED, so it
   * reads `compliant` next to t3's `exempt` and t1/t2's `not-required`.
   */
  const t4: Tender = {
    id: 't4',
    operatorId: 'op-cnooc',
    fieldId: 'f-block-07',
    scope: 'ENGINEERING_CONSTRUCTION',
    localContentClauseAffixed: true, // C8.1 — the 20% clause is on the documents, ready to publish
    stateResponses: [{ company: 'SCOP', status: 'accepted' }],
    code: 'B7-FAC-0331',
    title: {
      ar: 'إنشاء منشآت الإنتاج السطحية المركزية — الرقعة السابعة',
      en: 'Central surface production facilities EPC — Block 07',
    },
    budgetCode: 'B7-FAC-09',
    estimatedValueUSD: 12_400_000,
    methodId: 7,
    createdOn: '2026-05-25',
    stages: [
      { key: 'cost', plannedFrom: '2026-06-01', plannedTo: '2026-06-14', actualTo: '2026-06-14', uploadedDocs: ['stage-report'] },
      // open, on plan — the approval act itself is what the parent company owes
      { key: 'approval', plannedFrom: '2026-07-01', plannedTo: '2026-09-15', uploadedDocs: [] },
      { key: 'announce', plannedFrom: '2026-09-16', plannedTo: '2026-10-10', uploadedDocs: [] },
      { key: 'tech-open', plannedFrom: '2026-10-11', plannedTo: '2026-10-14', uploadedDocs: [] },
      { key: 'tech-analysis', plannedFrom: '2026-10-15', plannedTo: '2026-10-29', uploadedDocs: [] },
      { key: 'comm-open', plannedFrom: '2026-10-30', plannedTo: '2026-11-02', uploadedDocs: [] },
      { key: 'comm-analysis', plannedFrom: '2026-11-03', plannedTo: '2026-11-17', uploadedDocs: [] },
      { key: 'ratify', plannedFrom: '2026-11-18', plannedTo: '2026-11-30', uploadedDocs: [] },
      { key: 'sign', plannedFrom: '2026-12-01', plannedTo: '2026-12-10', uploadedDocs: [] },
    ],
    announcement: { ...defaultAnnouncementFor(7) }, // not yet published — the gate is still upstream
    evaluationStep: 0,
    bidders: [],
    mct: { notifiedOn: '2026-06-16', lcEstimateUSD: 12_400_000 },
  };

  // mid-execution: variation orders approaching the 10% cap, a bond expiring soon
  const c1: ContractState = {
    id: 'c1',
    code: 'AH-CON-0188',
    title: { ar: 'عقد حفر تطويري — الأحدب', en: 'Development drilling contract — Ahdab' },
    contractorName: 'شركة الحفر العراقية',
    // contractor name matches vendor v1 exactly → linked. No tenderId: this contract was
    // signed 2026-02-15, before any seeded tender was created, and no seeded tender is
    // ratified — so it has no plausible originating tender in the seed (do NOT invent one).
    vendorId: 'v1',
    signedOn: '2026-02-15',
    valueUSD: 12_500_000,
    termDays: 540,
    voTotalUSD: 1_050_000, // 8.4% → approaching the 10% cap
    extensionDays: 90, // 16.7% of term — within the 25% cap
    ldTotalUSD: 310_000, // 2.5%
    suspensionDays: 0,
    guarantees: [
      { kind: 'performance', valueUSD: 650_000, expiresOn: '2026-07-20' }, // expiring within 60 days
      { kind: 'advance', valueUSD: 1_000_000, expiresOn: '2027-01-15' },
    ],
    stages: [
      { key: 'sign', plannedTo: '2026-02-15', actualTo: '2026-02-15' },
      { key: 'bonds', plannedTo: '2026-02-25', actualTo: '2026-02-27' },
      { key: 'mobilize', plannedTo: '2026-03-10', actualTo: '2026-03-14' },
      { key: 'execute', plannedTo: '2027-06-01' },
      { key: 'provisional', plannedTo: '2027-07-01' },
      { key: 'warranty', plannedTo: '2028-07-01' },
      { key: 'final', plannedTo: '2028-08-01' },
    ],
    events: [
      { kind: 'vo', detail: '$1,050,000', on: '2026-06-02' },
      { kind: 'stage', detail: 'mobilize', on: '2026-03-14' },
    ],
  };

  // healthy, early stage: all caps clean, just mobilising
  const c2: ContractState = {
    id: 'c2',
    code: 'FM-CON-0191',
    title: { ar: 'عقد تأهيل خطوط النقل — الفرات الأوسط', en: 'Transfer pipeline rehabilitation — Middle Euphrates' },
    contractorName: 'Basra Energy Services',
    // matches vendor v2 exactly. No tenderId: no seeded tender belongs to the Middle Euphrates
    // fields, and none is ratified — an originating link here would be invented.
    vendorId: 'v2',
    signedOn: '2026-05-20',
    valueUSD: 6_800_000,
    termDays: 365,
    voTotalUSD: 0,
    extensionDays: 0,
    ldTotalUSD: 0,
    suspensionDays: 0,
    guarantees: [{ kind: 'performance', valueUSD: 400_000, expiresOn: '2027-06-01' }], // 5.9%
    stages: [
      { key: 'sign', plannedTo: '2026-05-20', actualTo: '2026-05-20' },
      { key: 'bonds', plannedTo: '2026-05-30', actualTo: '2026-05-29' },
      { key: 'mobilize', plannedTo: '2026-07-25' },
      { key: 'execute', plannedTo: '2027-04-01' },
      { key: 'provisional', plannedTo: '2027-05-01' },
      { key: 'warranty', plannedTo: '2028-05-01' },
      { key: 'final', plannedTo: '2028-06-01' },
    ],
    events: [{ kind: 'stage', detail: 'bonds', on: '2026-05-29' }],
  };

  // at-risk: variation orders in the amber band + a performance bond expiring soon
  const c3: ContractState = {
    id: 'c3',
    code: 'MN-CON-0205',
    title: { ar: 'تأهيل شبكة تجميع الغاز — المنصورية', en: 'Gas gathering network upgrade — Mansuria' },
    contractorName: 'النور للمقاولات النفطية',
    // matches vendor v3 exactly. No tenderId despite sharing t3's field: this contract was
    // signed 2025-11-10, five months before t3 was created (2026-04-20), and t3's bidders
    // do not include this contractor — a tender link here would be fabricated.
    vendorId: 'v3',
    signedOn: '2025-11-10',
    valueUSD: 9_200_000,
    termDays: 600,
    voTotalUSD: 830_000, // 9.0% → amber (≥80% of the 10% cap)
    extensionDays: 130, // 21.7% of term
    ldTotalUSD: 400_000, // 4.3%
    suspensionDays: 45, // 7.5% of term — one documented work stoppage
    guarantees: [
      { kind: 'performance', valueUSD: 500_000, expiresOn: '2026-08-05' }, // 5.4% but expiring soon
      { kind: 'advance', valueUSD: 900_000, expiresOn: '2026-12-01' },
    ],
    stages: [
      { key: 'sign', plannedTo: '2025-11-10', actualTo: '2025-11-10' },
      { key: 'bonds', plannedTo: '2025-11-20', actualTo: '2025-11-22' },
      { key: 'mobilize', plannedTo: '2025-12-05', actualTo: '2025-12-12' },
      // execute was due 2026-06-01 but is still running → the contract is behind plan
      { key: 'execute', plannedTo: '2026-06-01' },
      { key: 'provisional', plannedTo: '2027-08-01' },
      { key: 'warranty', plannedTo: '2028-08-01' },
      { key: 'final', plannedTo: '2028-09-01' },
    ],
    events: [
      { kind: 'vo', detail: '$830,000', on: '2026-06-20' },
      { kind: 'suspension', detail: '45d', on: '2026-05-02' },
      { kind: 'extension', detail: '130d', on: '2026-04-11' },
    ],
  };

  // near completion: in the warranty period, a modest LD applied for late delivery
  const c4: ContractState = {
    id: 'c4',
    code: 'EB-CON-0176',
    title: { ar: 'عقد صيانة محطة الضخ — شرقي بغداد', en: 'Pump station maintenance — East Baghdad' },
    contractorName: 'الخليج للمقاولات الهندسية',
    // no vendorId and no tenderId: this contractor is not in the seeded Vendor list and no
    // seeded tender plausibly produced it — left honestly unlinked (the UI shows the fallback).
    signedOn: '2025-03-01',
    valueUSD: 3_400_000,
    termDays: 400,
    voTotalUSD: 120_000, // 3.5%
    extensionDays: 60, // 15%
    ldTotalUSD: 210_000, // 6.2%
    suspensionDays: 0,
    renewalYears: 1, // renewed once (§19.1)
    guarantees: [{ kind: 'performance', valueUSD: 190_000, expiresOn: '2026-09-15' }], // 5.6%
    stages: [
      { key: 'sign', plannedTo: '2025-03-01', actualTo: '2025-03-01' },
      { key: 'bonds', plannedTo: '2025-03-12', actualTo: '2025-03-12' },
      { key: 'mobilize', plannedTo: '2025-03-25', actualTo: '2025-03-30' },
      { key: 'execute', plannedTo: '2026-04-05', actualTo: '2026-05-01' },
      { key: 'provisional', plannedTo: '2026-05-20', actualTo: '2026-06-04' },
      { key: 'warranty', plannedTo: '2027-06-04' },
      { key: 'final', plannedTo: '2027-07-01' },
    ],
    events: [
      { kind: 'renewal', detail: '1y', on: '2026-06-20' },
      { kind: 'ld', detail: '$210,000', on: '2026-05-10' },
      { kind: 'stage', detail: 'provisional', on: '2026-06-04' },
    ],
  };

  const vendors: VendorState[] = [
    { id: 'v1', name: 'شركة الحفر العراقية', mooListed: true, techScore: 88, financialScore: 76, hseScore: 82 },
    { id: 'v2', name: 'Basra Energy Services', mooListed: true, techScore: 79, financialScore: 85, hseScore: 74 },
    { id: 'v3', name: 'النور للمقاولات النفطية', mooListed: false, techScore: 62, financialScore: 58, hseScore: 66 },
    {
      id: 'v4',
      name: 'دجلة للخدمات النفطية',
      mooListed: true,
      suspended: true,
      banUntil: '2026-11-01',
      banReason: { ar: 'رفض توقيع عقد محال (14.3)', en: 'Refused to sign an awarded contract (14.3)' },
      techScore: 71,
      financialScore: 64,
      hseScore: 59,
    },
    // the five Iraqi state companies (Article 25 / §9) — they compete under the SAME 10.4 gates as
    // any bidder (C8.4), and are the participation targets the 20% clause names.
    { id: 'v-idc', name: 'شركة حفر الآبار النفطية (IDC)', isStateCompany: true, mooListed: true, techScore: 84, financialScore: 80, hseScore: 83 },
    { id: 'v-scop', name: 'شركة مشاريع النفط (SCOP)', isStateCompany: true, mooListed: true, techScore: 86, financialScore: 82, hseScore: 85 },
    { id: 'v-heesco', name: 'الشركة العامة للهندسة الكهربائية (HEESCO)', isStateCompany: true, mooListed: true, techScore: 78, financialScore: 75, hseScore: 79 },
    { id: 'v-oec', name: 'شركة النفط الوطنية العراقية للهندسة (OEC)', isStateCompany: true, mooListed: false, techScore: 80, financialScore: 77, hseScore: 81 },
    { id: 'v-prdc', name: 'شركة تطوير حقول النفط (PRDC)', isStateCompany: true, mooListed: true, techScore: 82, financialScore: 79, hseScore: 84 },
  ];

  // The 12 Lead Contractors of نفط الوسط (MDOC), adopted VERBATIM from the delivery registry
  // (_handoff_masaar_website/ui_kits/admin/App.jsx FIELDS_REGISTRY; corroborated by spec.html §1
  // «12 شركة» and schema.prisma model Field). `name` is the registry's own operator label and
  // `nameEn` its `opShort` — neither is embellished into an invented corporate title. GeoJade
  // holds two fields (NAFT-KHANA + ZURBATIYA), which is why 13 fields sit under 12 companies.
  const operators: OperatorOrg[] = [
    { id: 'op-ebe', name: 'شركة شرقي بغداد الصينية', nameEn: 'EBE-Chinese' },
    { id: 'op-crescent', name: 'شركة نفط الهلال الإماراتية', nameEn: 'Crescent UAE' },
    { id: 'op-geojade', name: 'جيو-جاد الصينية', nameEn: 'GeoJade' },
    { id: 'op-fze', name: 'FZE', nameEn: 'FZE' },
    { id: 'op-kar', name: 'KAR', nameEn: 'KAR' },
    { id: 'op-fbn', name: 'FBN', nameEn: 'FBN' },
    { id: 'op-ebn', name: 'EBN', nameEn: 'EBN' },
    { id: 'op-ado', name: 'ADO Digital Energy', nameEn: 'ADO' },
    { id: 'op-cnooc', name: 'CNOOC Africa Holding', nameEn: 'CNOOC' },
    { id: 'op-qarnayn', name: 'Qarnayn Petroleum Co. Ltd.', nameEn: 'Qarnayn' },
    { id: 'op-alwaha', name: 'شركة نفط الواحة الصينية', nameEn: 'AlWaha' },
    { id: 'op-badra', name: 'مشروع بدرة', nameEn: 'Badra' },
  ];

  // The 13 MDOC-area oil fields (spec §1), likewise verbatim: Arabic name and `code` are the
  // registry's own. `nameEn` is the standard transliteration the code already spells out
  // (EBAGHDAD-S → East Baghdad – South), not a second, invented English identity.
  const fields: Field[] = [
    { id: 'f-ebaghdad-s', name: 'حقل شرقي بغداد - الجنوبية', nameEn: 'East Baghdad – South', code: 'EBAGHDAD-S', operatorId: 'op-ebe' },
    { id: 'f-khashm-anjana', name: 'حقل خشم الأحمر / أنجانة', nameEn: 'Khashm al-Ahmar / Anjana', code: 'KHASHM-ANJANA', operatorId: 'op-crescent' },
    { id: 'f-naft-khana', name: 'حقل نفط خانة', nameEn: 'Naft Khana', code: 'NAFT-KHANA', operatorId: 'op-geojade' },
    { id: 'f-mansuria', name: 'حقل المنصورية', nameEn: 'Mansuria', code: 'MANSURIA', operatorId: 'op-fze' },
    { id: 'f-khalisiya', name: 'رقعة الخليصية', nameEn: 'Khalisiya Block', code: 'KHALISIYA', operatorId: 'op-kar' },
    { id: 'f-zurbatiya', name: 'حقل زرباطية', nameEn: 'Zurbatiya', code: 'ZURBATIYA', operatorId: 'op-geojade' },
    { id: 'f-furat-mid', name: 'حقول الفرات الأوسط', nameEn: 'Middle Euphrates Fields', code: 'FURAT-MID', operatorId: 'op-fbn' },
    { id: 'f-ebaghdad-n', name: 'حقل شرقي بغداد - الامتدادات الشمالية', nameEn: 'East Baghdad – Northern Extensions', code: 'EBAGHDAD-N', operatorId: 'op-ebn' },
    { id: 'f-dhufriya', name: 'حقل الظفرية', nameEn: 'Dhufriya', code: 'DHUFRIYA', operatorId: 'op-ado' },
    { id: 'f-block-07', name: 'الرقعة السابعة', nameEn: 'Block 07', code: 'BLOCK-07', operatorId: 'op-cnooc' },
    { id: 'f-qarnayn', name: 'رقعة القرنين', nameEn: 'Qarnayn Block', code: 'QARNAYN', operatorId: 'op-qarnayn' },
    { id: 'f-ahdab', name: 'حقل الأحدب النفطي', nameEn: 'Ahdab Oil Field', code: 'AHDAB', operatorId: 'op-alwaha' },
    { id: 'f-badra', name: 'حقل بدرة', nameEn: 'Badra', code: 'BADRA', operatorId: 'op-badra' },
  ];

  /**
   * One Service Contract per field (§7.1) — the source of that field's Financial Authority.
   *
   * `expiresOn` is the registry's own `contractEnd` (YYYY-MM), read as the last day of that
   * month — the registry states when a contract ENDS, and a contract is in force for the whole
   * of its final month. `signedOn` is one documented demo convention (2024-01-01, the date this
   * service-contract register was constituted for the demo) rather than 13 invented signing
   * histories; the term the UI shows is DERIVED from the pair (C2).
   *
   * The FA figures are scaled from the registry's own activity measure, `activePaths` — the
   * count of live procurement paths a field runs, which is the only size signal the registry
   * carries. Nothing here is a per-operator figure (§7.1 forbids that): AHDAB runs 12 paths and
   * carries the top delegation (5M), BLOCK-07 runs 9 (4.5M), FURAT-MID 8 and EBAGHDAD-S 7 (4M),
   * EBAGHDAD-N 7 (3.5M), the 6-path fields 3M, the 5-path fields 2.5M, the 4-path fields 2M.
   */
  const sc = (fieldId: string, code: string, faUSD: number, expiresOn: string): ServiceContract => ({
    id: `sc-${code.toLowerCase()}`, code: `SC-${code}-24`,
    fieldId, financialAuthorityUSD: faUSD, signedOn: '2024-01-01', expiresOn,
  });
  const serviceContracts: ServiceContract[] = [
    sc('f-ahdab', 'AHDAB', 5_000_000, '2031-01-31'),
    sc('f-block-07', 'BLOCK-07', 4_500_000, '2032-05-31'),
    sc('f-furat-mid', 'FURAT-MID', 4_000_000, '2028-02-29'),
    sc('f-ebaghdad-s', 'EBAGHDAD-S', 4_000_000, '2030-12-31'),
    sc('f-ebaghdad-n', 'EBAGHDAD-N', 3_500_000, '2030-08-31'),
    sc('f-naft-khana', 'NAFT-KHANA', 3_000_000, '2029-03-31'),
    sc('f-khalisiya', 'KHALISIYA', 3_000_000, '2031-04-30'),
    sc('f-badra', 'BADRA', 3_000_000, '2027-06-30'),
    sc('f-khashm-anjana', 'KHASHM-ANJANA', 2_500_000, '2028-06-30'),
    sc('f-zurbatiya', 'ZURBATIYA', 2_500_000, '2029-09-30'),
    sc('f-qarnayn', 'QARNAYN', 2_500_000, '2029-07-31'),
    sc('f-mansuria', 'MANSURIA', 2_000_000, '2027-11-30'),
    sc('f-dhufriya', 'DHUFRIYA', 2_000_000, '2028-12-31'),
  ];

  /**
   * The seeded directory (client requests 19أ + 19ب, 2026-08-20).
   *
   * Exactly ONE enabled super admin, so the "last enabled super admin" gate is live on first
   * load rather than theoretical — the hardest governance state is the default state. The same
   * reasoning now covers TWO more facts of this seed, both deliberate:
   *
   *  · **19أ — the title-named account is disabled, not deleted.** «حساب المدقق الخارجي» was a
   *    JOB TITLE wearing an account, which is precisely what the platform's attribution law
   *    forbids: an act is bound to an immutable oid and a real person, never to a label anyone
   *    could later occupy. The client flagged it as confusing and it is withdrawn — by DISABLING
   *    (the platform's only access-withdrawal mechanism, ق7/8.1-e) with a documented trail, so the
   *    account and its history stay readable instead of vanishing.
   *  · **the AUDITOR role is therefore left with no enabled holder, on purpose.** That is the true
   *    state of a register whose only auditor was a placeholder, and the orphan-role KPI exists to
   *    say exactly that — «كل استدعاء يُرفض 403 ويُسجَّل ROLE_REFUSED». Inventing a replacement
   *    auditor to keep the tile green would be fabricating a person to hide a real gap.
   */
  const seedEvent = (reason: string, kind: UserEvent['kind'] = 'create'): UserEvent => ({
    kind, reason, on: '2026-08-20', at: '2026-08-20T00:00:00.000Z',
    // the constituting act belongs to the platform administrator seeded alongside it
    by: { oid: 'oid-super-01', name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN' },
  });
  const users: UserAccount[] = [
    { id: 'u1', azureOid: 'oid-super-01', name: 'م. مصطفى الكرخي', email: 'mustafa.karkhi@masaar.iq', role: 'SUPER_ADMIN', twoFa: true, disabled: false },
    { id: 'u2', azureOid: 'oid-super-02', name: 'م. ليث الأنباري', email: 'laith.anbari@masaar.iq', role: 'SUPER_ADMIN', twoFa: true, disabled: true },
    // azureOid keeps its `oid-roc-*` spelling: it is the immutable Azure object id that binds a
    // persisted session (and every stored blob) to the account. An identifier whose whole job is
    // never to change is not renamed for a label; the email and the role are what people read.
    { id: 'u3', azureOid: 'oid-roc-01', name: 'د. سارة الجبوري', email: 'sara.jubouri@mdoc.iq', role: 'MDOC_ADMIN', twoFa: true, disabled: false },
    { id: 'u4', azureOid: 'oid-roc-02', name: 'هدى العبيدي', email: 'huda.obeidi@mdoc.iq', role: 'MDOC_ADMIN', twoFa: true, disabled: false },
    // 19ب — اللجنة المشتركة: two NAMED members, platform-scoped (a joint committee sits above any
    // single operating company, so `operatorId` must be absent for scopeConsistent to hold). Two,
    // not one, so disabling either still leaves the ط2 band with a signature.
    { id: 'u11', azureOid: 'oid-jmc-01', name: 'م. رافد الدليمي', email: 'rafid.dulaimi@jmc.iq', role: 'JMC_APPROVER', twoFa: true, disabled: false, events: [seedEvent('عضو اللجنة المشتركة — يمثّل الجهة المخوّلة بالموافقة على الطبقة الثانية وفق سلّم الموافقات المعتمد')] },
    { id: 'u12', azureOid: 'oid-jmc-02', name: 'سُهاد العزاوي', email: 'suhad.azzawi@jmc.iq', role: 'JMC_APPROVER', twoFa: true, disabled: false, events: [seedEvent('عضو اللجنة المشتركة — الحساب الثاني كي لا تبقى الطبقة الثانية بحاملٍ واحد لا بديل له')] },
    { id: 'u5', azureOid: 'oid-eval-01', name: 'سعد الجبوري', email: 'saad.jubouri@mdoc.iq', role: 'EVALUATION', twoFa: true, disabled: false },
    { id: 'u6', azureOid: 'oid-eval-02', name: 'زينب الحسني', email: 'zainab.hasani@mdoc.iq', role: 'EVALUATION', twoFa: false, disabled: false },
    // 19أ — withdrawn: a title, not a person. Kept (disabled) with the trail that explains why.
    {
      id: 'u7', azureOid: 'oid-audit-01', name: 'حساب المدقق الخارجي', email: 'auditor@bsa.iq', role: 'AUDITOR', twoFa: true, disabled: true,
      events: [
        seedEvent('سُحب الوصول: الحساب باسم وظيفة لا باسم شخص، والإسناد في المنظومة يرتبط بهوية ثابتة وشخص معيّن — يُستبدل بحساب مدقق مسمّى عند تزويدنا باسمه', 'disable'),
        seedEvent('حساب تجريبي للمدقق الخارجي — أُنشئ ضمن البذرة الأولى'),
      ],
    },
    // the three operator accounts are scoped to MDOC Lead Contractors that actually raise seed
    // tenders — AlWaha (AHDAB, t1) and Badra (t2) — so every scoped account has real work in view.
    { id: 'u8', azureOid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', email: 'ahmed.abdulrahman@alwaha.iq', role: 'OPERATOR_ADMIN', operatorId: 'op-alwaha', twoFa: true, disabled: false },
    { id: 'u9', azureOid: 'oid-opuser-01', name: 'كرار محسن', email: 'karrar.mohsin@badra.iq', role: 'OPERATOR_USER', operatorId: 'op-badra', twoFa: true, disabled: false },
    { id: 'u10', azureOid: 'oid-opuser-02', name: 'علي الساعدي', email: 'ali.saedi@alwaha.iq', role: 'OPERATOR_USER', operatorId: 'op-alwaha', twoFa: true, disabled: true },
  ];

  return {
    tenders: [t1, t2, t3, t4], contracts: [c1, c2, c3, c4], vendors, audit: [], seq: 98,
    users, operators, fields, serviceContracts, holidays: [], approvalTiers: SEED_APPROVAL_TIERS,
    // no seeded override: the demo universe shows the SYSTEM DEFAULT in force for all twelve
    // companies as a fact, so the four seed tenders' tiers are the default ladder's verdict and
    // not an accident of a fixture. An approved ladder is a supervisor's act, never seed data.
    operatorTiers: {},
  };
}

/* ---------------- context ---------------- */

/**
 * v9 — the demo universe changed identity. Client decision ق3 (2026-08-20) replaced the southern
 * seed (Rumaila / West Qurna / Majnoon, which belong to Basra Oil Company and never to نفط الوسط)
 * with the 13 real MDOC-area fields and their 12 Lead Contractors, and the state root gained the
 * global approval ladder. Every operator/field/contract id changed, so a v8 blob's tenders point
 * at fields that no longer exist — the key is bumped rather than patched.
 *
 * v10 — the role vocabulary changed (client decision ق2, 2026-08-20): ROC_ADMIN became
 * MDOC_ADMIN. Unlike v9 this is NOT a universe swap — same companies, same tenders, same
 * accounts, one renamed identifier — so a v9 blob is carried forward whole and only its
 * accounts' `role` is rewritten. Audit rows are not touched: they are append-only (8.1-e) and
 * are read tolerantly instead (session.ts normalizeRole / access.ts roleKey).
 *
 * v11 — the ARCHIVE MODEL (client decision ق7, 2026-08-20): `Field` and `VendorState` gained an
 * optional `archived` flag and a documented event trail. The key moves because the store shape
 * moved (execution rule 4 of ops/CLIENT-FEEDBACK-PLAN.md), but the migration itself is a
 * pass-through: every flag is OPTIONAL and its absence already means «live», so a v10 record is
 * a valid v11 record unchanged. Nothing is rewritten — and therefore nothing is recorded either.
 * SEED_MIGRATION_V9 and ROLE_RENAME_V10 were written because those migrations really did change
 * records; a row asserting a change that never happened is the same fabrication as an unrecorded
 * one, and the audit log is not a changelog of key names.
 *
 * v12 — STAGE DEVIATION RECORD (design-finish D1, 2026-08-30): `StageState` gained the optional
 * `actualFrom` and `devReason` the closing wizard already collected and used to discard. Same
 * wholesale pass-through as v11: both fields are optional and their absence means «not recorded»,
 * so a v11 blob is a valid v12 blob unchanged — nothing rewritten, nothing appended to the log.
 *
 * v13 — PER-OPERATOR LADDERS (client decision 2026-08-25). The state root gained `operatorTiers`.
 * The migration itself is another pass-through — an absent map means «every company is on the
 * system default», which is exactly what a v12 blob meant — so nothing is rewritten and nothing is
 * appended (the v11/v12 precedent: no row for a change that did not happen).
 *
 * WHY A KEY BUMP FOR AN ADDITIVE FIELD, when `holidays` and `approvalTiers` were normalized on
 * load instead? Because the two directions are not alike. Those fields are INCIDENTAL: a v12 build
 * reading a blob that lacks them shows less, and shows it honestly. `operatorTiers` is the reverse
 * hazard — an OLD build reading a blob written by this one would not see the map at all and would
 * measure a company that has an approved ladder against the default instead. That is a silent
 * authority downgrade, not a display gap. Bumping the key means the old build never opens this
 * blob at all, which is the isolation this warrants rather than a ceremony.
 */
const KEY = 'masaar-operator-v13';
/** The immediately previous key — same universe, the per-operator ladder map is purely additive. */
const V12_KEY = 'masaar-operator-v12';
/** The key before that — same universe, additive optional stage-deviation fields only. */
const V11_KEY = 'masaar-operator-v11';
/** The key before that — same universe and vocabulary, additive archive flags only. */
const V10_KEY = 'masaar-operator-v10';
/** The key before that — same universe, retired role vocabulary (migrated through v10's path). */
const V9_KEY = 'masaar-operator-v9';
/** Pre-v9 keys, newest first — every one migrates through the same audit-preserving path. */
const LEGACY_KEYS = ['masaar-operator-v8', 'masaar-operator-v7'] as const;

export function emptyState(): State {
  return {
    tenders: [], contracts: [], vendors: [], audit: [], seq: 0, users: [], operators: [],
    fields: [], serviceContracts: [], holidays: [], approvalTiers: SEED_APPROVAL_TIERS,
    operatorTiers: {},
  };
}

const SHAPE_KEYS = ['tenders', 'contracts', 'audit', 'vendors', 'users', 'operators', 'fields', 'serviceContracts'] as const;
const hasShape = (p: unknown): p is State =>
  !!p && typeof p === 'object' && SHAPE_KEYS.every((k) => Array.isArray((p as Record<string, unknown>)[k]));

/** Normalize a persisted/loaded holidays value into Holiday[] — tolerates the early bare-string
 *  shape, drops malformed dates. Used by every load path so the store shape is uniform. */
function normHolidays(x: unknown): Holiday[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((h): Holiday => (typeof h === 'string' ? { date: h.slice(0, 10) } : { date: String((h as Holiday).date ?? '').slice(0, 10), ...((h as Holiday).name ? { name: (h as Holiday).name } : {}) }))
    .filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date));
}

/**
 * The ladder off a persisted blob. Two cases, and they are NOT the same thing:
 *
 *  · **No ladder at all** (a blob written before the field existed, or a non-object) — nothing
 *    was ever configured, so the seeded ladder (ق1: 5,000,000 / 10,000,000) applies. That is the
 *    app's documented default, not an invention.
 *  · **A ladder that is present but structurally wrong** (non-numeric, negative, inverted) — it
 *    is carried through EXACTLY AS STORED, deliberately. `approvalTierFor` is the single place
 *    that judges a ladder and it FAILS CLOSED on an unusable one, reading every request as ط3
 *    MDOC — the highest gate. Repairing the blob to seed values here would do the opposite: it
 *    would hand back a ladder nobody configured and quietly clear requests at the LOWEST gate on
 *    the strength of it. The screens already promise the conservative reading in words
 *    («approvals.explainFailClosed»: an out-of-order ladder is read as the highest tier), and a
 *    load-path repair would make that sentence untrue.
 *
 * So this function normalizes SHAPE (the two ceilings are numbers) and never policy: which
 * ladders are usable stays the engine's single judgement, in `approvalTier.ts`.
 */
function normTiers(x: unknown): ApprovalTiers {
  if (!x || typeof x !== 'object') return SEED_APPROVAL_TIERS;
  const t = x as Partial<Record<keyof ApprovalTiers, unknown>>;
  // anything that is not a number is NaN, never a coerced 0: a half-written or string-typed
  // ladder is corrupt configuration, not an absent one, so it reaches the engine as unusable
  // instead of being silently completed from seed or read as a ceiling of zero.
  const ceiling = (v: unknown): number => (typeof v === 'number' ? v : Number.NaN);
  return { operatorMaxUSD: ceiling(t.operatorMaxUSD), jmcMaxUSD: ceiling(t.jmcMaxUSD) };
}

/**
 * The per-operator ladder map off a persisted blob — SHAPE only, and by the same rule as
 * `normTiers`, one level down.
 *
 * A missing or non-object map is `{}`: nothing was ever approved, so every company is on the
 * system default — the documented meaning of an absent entry, not an invention. But an entry that
 * IS present and structurally wrong is kept exactly as stored (each ceiling through the same
 * `ceiling()`, so a string becomes NaN rather than a coerced 0): `approvalTierFor` fails closed on
 * it and reads that company's requests as ط3 MDOC. Completing a corrupt approved ladder from the
 * default here would clear its requests at a LOWER gate than anyone signed off — the precise
 * failure the fail-closed reading exists to prevent, and the one this load path must not undo.
 */
function normOperatorTiers(x: unknown): Record<string, ApprovalTiers> {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  const out: Record<string, ApprovalTiers> = {};
  for (const [id, v] of Object.entries(x as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue; // an entry that is not a ladder at all names none
    const t = v as Partial<Record<keyof ApprovalTiers, unknown>>;
    const ceiling = (n: unknown): number => (typeof n === 'number' ? n : Number.NaN);
    out[id] = { operatorMaxUSD: ceiling(t.operatorMaxUSD), jmcMaxUSD: ceiling(t.jmcMaxUSD) };
  }
  return out;
}

/**
 * Any pre-v9 blob → v9. The old universe's records cannot be re-pointed honestly (there is no
 * mapping from «الرميلة» to an MDOC field — they are different fields of different companies),
 * so the demo universe is reseeded. What survives is what the law says must survive: the
 * append-only audit log (8.1-e), in order and untouched, plus the admin-managed holiday calendar,
 * which is a fact about Iraq rather than about the demo data. `seq` never moves backwards, so a
 * generated code can never collide with one already named in the preserved log. The swap itself
 * is appended to that log — a universe replaced silently would be exactly the unrecorded act 8.1-e
 * forbids. (Unattributed on purpose: no Actor performed it; a startup migration did.)
 */
function migrateLegacy(p: Partial<State>): State {
  const seed = seedState();
  const audit = Array.isArray(p.audit) ? p.audit : [];
  return {
    ...seed,
    seq: Math.max(seed.seq, typeof p.seq === 'number' ? p.seq : 0),
    holidays: normHolidays((p as { holidays?: unknown }).holidays),
    audit: [
      ...audit,
      { ts: new Date().toISOString(), action: 'SEED_MIGRATION_V9', target: 'MDOC' },
    ],
  };
}

/**
 * v9 → v10: the role RENAME, and nothing else. Every tender, contract, account and audit row
 * survives verbatim — only `users[].role` is rewritten, because a role is a live authorization
 * fact that must speak today's vocabulary or the account silently loses its capabilities.
 *
 * The audit log is left exactly as written (8.1-e): a row that says ROC_ADMIN said so truthfully
 * on the day it was written, and history is read tolerantly (roleKey) rather than edited. The
 * rename is itself appended — but only when it actually renamed an account, since a row claiming
 * a change that never happened is the same fabrication as an unrecorded one.
 */
function migrateRoleVocabulary(s: State): State {
  const users = s.users.map((u) => {
    const current = normalizeRole(u.role);
    return current && current !== u.role ? { ...u, role: current } : u;
  });
  const renamed = users.some((u, i) => u !== s.users[i]);
  if (!renamed) return { ...s, users };
  return {
    ...s,
    users,
    // unattributed like every startup migration: no Actor performed it, and inventing one
    // would be worse than recording none.
    audit: [...s.audit, { ts: new Date().toISOString(), action: 'ROLE_RENAME_V10', target: 'MDOC_ADMIN' }],
  };
}

/** A persisted blob → the in-memory shape: only the fields that need normalizing are touched. */
function normalizeBlob(parsed: State): State {
  const p = parsed as State & { holidays?: unknown; approvalTiers?: unknown; operatorTiers?: unknown };
  return {
    ...parsed,
    holidays: normHolidays(p.holidays),
    approvalTiers: normTiers(p.approvalTiers),
    operatorTiers: normOperatorTiers(p.operatorTiers),
  };
}

function loadState(): State {
  if (isApiMode) return emptyState(); // hydrated from the server on mount
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      // holidays and approvalTiers are additive with safe defaults, so a v13 blob written before
      // either existed is still valid — normalize on load rather than bumping the key again.
      // (An early build stored holidays as bare date strings; normalize those to { date }.)
      if (hasShape(parsed)) return normalizeBlob(parsed);
    }
    // v12 → v13: `operatorTiers` is additive and its absence means «every company is on the system
    // default» — the standing truth before the override existed — so the blob IS the migration.
    // Every tender, contract, account, field, vendor and audit row survives verbatim, and nothing
    // is appended to the log because nothing about the data changed.
    const v12 = localStorage.getItem(V12_KEY);
    if (v12) {
      const parsed: unknown = JSON.parse(v12);
      if (hasShape(parsed)) return normalizeBlob(parsed);
    }
    // v11 → v12: the stage-deviation fields are optional and absent means «not recorded», so the
    // blob IS the migration — every tender, contract, account, field, vendor and audit row
    // survives verbatim.
    const v11 = localStorage.getItem(V11_KEY);
    if (v11) {
      const parsed: unknown = JSON.parse(v11);
      if (hasShape(parsed)) return normalizeBlob(parsed);
    }
    // v10 → v11 → v12: the archive flags are optional and absent means «live», so the blob IS the
    // migration — every tender, contract, account, field, vendor and audit row survives verbatim.
    const v10 = localStorage.getItem(V10_KEY);
    if (v10) {
      const parsed: unknown = JSON.parse(v10);
      if (hasShape(parsed)) return normalizeBlob(parsed);
    }
    // v9 → v10 → v11 → v12: same universe, renamed role vocabulary. Everything is kept; only
    // accounts move, and the additive hops above add nothing, so they compose without more passes.
    const v9 = localStorage.getItem(V9_KEY);
    if (v9) {
      const parsed: unknown = JSON.parse(v9);
      if (hasShape(parsed)) return migrateRoleVocabulary(normalizeBlob(parsed));
    }
    for (const legacy of LEGACY_KEYS) {
      const prev = localStorage.getItem(legacy);
      if (!prev) continue;
      const p = JSON.parse(prev) as Partial<State>;
      // an audit array is the one thing a legacy blob must have for the migration to mean anything
      if (Array.isArray(p.audit)) return migrateLegacy(p);
    }
  } catch {
    /* corrupted → reseed */
  }
  return seedState();
}

/**
 * Every dispatch resolves an outcome instead of returning void. Callers may
 * ignore it (the ~40 existing sites do); the ceremony work (batch 3) awaits it.
 * The promise NEVER rejects — a refused/failed server call resolves ok:false
 * AFTER the resync, so no call site needs try/catch.
 */
export type DispatchOutcome = { ok: true } | { ok: false; error: string };
export type StoreDispatch = (action: Action) => Promise<DispatchOutcome>;
/** Central error surface: shells register one to turn silent API failures into a toast. */
export type DispatchFailHandler = (error: string, actionType: string) => void;

const StoreCtx = createContext<{
  state: State;
  dispatch: StoreDispatch;
  registerDispatchFail: (handler: DispatchFailHandler | null) => void;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadState);

  // one registered central failure sink (a shell's toast); null → console fallback.
  const failRef = useRef<DispatchFailHandler | null>(null);
  const registerDispatchFail = useCallback((handler: DispatchFailHandler | null) => {
    failRef.current = handler;
  }, []);

  // local mode: persist to localStorage. api mode: state lives on the server.
  useEffect(() => {
    if (isApiMode) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full/blocked — in-memory only */
    }
  }, [state]);

  // api mode: hydrate the full state from the backend once a session exists.
  useEffect(() => {
    if (!isApiMode) return;
    const session = loadSession();
    if (!session) return;
    let cancelled = false;
    loadFullState(session.role)
      .then((s) => !cancelled && baseDispatch({ type: 'HYDRATE', state: s }))
      .catch((e) => console.error('hydrate failed', e));
    return () => {
      cancelled = true;
    };
  }, []);

  // api mode: send mutations to the server, then merge the server's truth back.
  const dispatch = useMemo<StoreDispatch>(() => {
    // local mode: the reducer applies synchronously; report success once it's queued.
    if (!isApiMode) {
      return (action: Action) => {
        baseDispatch(action);
        return Promise.resolve<DispatchOutcome>({ ok: true });
      };
    }
    return (action: Action): Promise<DispatchOutcome> => {
      // ONLY LOCAL_ONLY actions bypass the server — decoupled from NON_AUDITED so a self-auditing
      // action that DOES have a route (holidays) still goes to runAction below.
      if (CLIENT_ONLY.has(action.type)) {
        baseDispatch(action);
        return Promise.resolve<DispatchOutcome>({ ok: true });
      }
      return runAction(action)
        .then((res) => {
          if (res.tender) baseDispatch({ type: 'UPSERT_TENDER', tender: res.tender });
          if (res.reload) {
            const session = loadSession();
            if (session) return loadFullState(session.role).then((s) => baseDispatch({ type: 'HYDRATE', state: s }));
          }
        })
        .then((): DispatchOutcome => ({ ok: true }))
        .catch((e: unknown): Promise<DispatchOutcome> => {
          // server refused (a guard) or network error. Resync the affected tender
          // FIRST, then surface the failure — never reject (callers need no try/catch).
          const error = e instanceof Error ? e.message : String(e);
          const id = tenderIdOf(action);
          const resync: Promise<unknown> = id
            ? api<ApiTender>(`/tenders/${id}`)
                .then((t) => baseDispatch({ type: 'UPSERT_TENDER', tender: mapTender(t) }))
                .catch(() => {})
            : Promise.resolve();
          return resync.then((): DispatchOutcome => {
            if (failRef.current) failRef.current(error, action.type);
            else console.error('action failed', action.type, e);
            return { ok: false, error };
          });
        });
    };
  }, []);

  return <StoreCtx.Provider value={{ state, dispatch, registerDispatchFail }}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

/**
 * Register a central handler for API-mode dispatch failures — the shells wire this
 * to a toast so a refused server call is never swallowed. Unmount clears it, so the
 * shell-less public pages fall back to console.
 */
export function useRegisterDispatchFail(handler: DispatchFailHandler): void {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useRegisterDispatchFail outside StoreProvider');
  const { registerDispatchFail } = ctx;
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const stable: DispatchFailHandler = (error, actionType) => ref.current(error, actionType);
    registerDispatchFail(stable);
    return () => registerDispatchFail(null);
  }, [registerDispatchFail]);
}
