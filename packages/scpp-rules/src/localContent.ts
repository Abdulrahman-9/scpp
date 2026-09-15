/**
 * §9 — Local content (Article 25) and critical materials (Appendix I + 10.6.18). Pure rules; every
 * value here is DERIVED, never stored (C2). The clause→stage map (adjudicated with the core advisor):
 *
 *   C8.1  documents must state the 20% state-company participation  → publish gate (drafting duty)
 *   C8.2  a bidder may proceed without them WITH evidence           → derived warning (participation)
 *   C8.4  state companies compete like everyone (10.4) + 25.2       → 10.4 gate + a reviewer record
 *   C8.6  imported critical materials from approved origins         → technical-eval gate (imported only)
 *   C8.7  the MoO Vendor List is an accepted alternative to C8.6    → allowance
 *   C8.8  imported → ministry inspection + certified origin cert    → post-award stage-required docs
 *
 * Two levels the advisor insisted must NOT be conflated: C8.1 is a DRAFTING duty on the main
 * contractor ("the tender documents state…"); C8.2 is a PARTICIPATION excuse for the bidder. A
 * bidder's evidence excuses missing participation — it never excuses documents that omitted the
 * required clause. Hence two separate checks below.
 */

/* ---------------- C8.1 / C8.2 — state-company participation ---------------- */

export type LocalContentScope = 'DRILLING' | 'ENGINEERING_CONSTRUCTION' | 'HEAVY_MATERIALS' | 'OTHER';

/** The scopes the §9 participation requirement can apply to (drilling / engineering-construction /
 *  heavy materials). `ENGINEERING_CONSTRUCTION` is named in full so an EPC tender cannot slip past. */
const LOCAL_CONTENT_SCOPES: readonly LocalContentScope[] = ['DRILLING', 'ENGINEERING_CONSTRUCTION', 'HEAVY_MATERIALS'];

/**
 * C8.1/C8.2 apply only to an ABOVE-authority tender in one of the three scopes. `aboveFA` must be the
 * fail-closed authority signal (aboveOwnFA — a null/unresolvable FA counts as above), never a fresh
 * hand comparison.
 */
export function localContentApplies(scope: LocalContentScope, aboveFA: boolean): boolean {
  return aboveFA && LOCAL_CONTENT_SCOPES.includes(scope);
}

/**
 * C8.1 (drafting) — when the requirement applies, the tender documents MUST carry the 20%-participation
 * clause. This is a publish-blocking condition (it joins the 11.1 hard checks in checkAnnouncement), so
 * it constrains only the NEXT publication and never a document already public.
 */
export function localContentClauseSatisfied(applies: boolean, clauseAffixed: boolean): boolean {
  return !applies || clauseAffixed;
}

export type StateResponseStatus = 'accepted' | 'pending' | 'declined';

export interface StateCompanyResponse {
  company: string;
  status: StateResponseStatus;
  /** documented justification for non-participation (C8.2) — an audit-grade record (who/when/document),
   *  NOT a checkbox. Its presence is exactly what turns a missing participation into a lawful exemption. */
  evidence?: string;
}

export type LocalContentStatus = 'not-required' | 'compliant' | 'exempt' | 'violating';

/**
 * C8.2 (participation) — DERIVED. `compliant` when a state company participates; `exempt` when it does
 * not but a documented justification exists (the lawful path of 25/C8.2); `violating` ONLY when the
 * requirement applies, no state company participates, and NO justification is on record. Note: this is
 * NOT "under 20%" — the 20% is a proposed figure in the documents, never an automatic breach threshold.
 */
export function localContentStatus(applies: boolean, responses: readonly StateCompanyResponse[]): LocalContentStatus {
  if (!applies) return 'not-required';
  if (responses.some((r) => r.status === 'accepted')) return 'compliant';
  return responses.some((r) => !!r.evidence?.trim()) ? 'exempt' : 'violating';
}

/* ---------------- C8.5 / C8.6 / C8.7 — critical materials & origin ---------------- */

/**
 * C8.6 seed — the approved origins, VERBATIM from the governing text (spec §9): Europe, Japan, USA,
 * Canada. Reference data seeded to the governing values; any expansion (Korea, the Gulf…) is a
 * ministerial edit through a governed action, never a code change.
 */
export const APPROVED_ORIGINS: readonly string[] = ['Europe', 'Japan', 'USA', 'Canada'];

/**
 * C8.5 seed — the critical-materials list (Appendix I + 10.6.18). Reference data (editable via a
 * governed action); the seed mirrors the categories the spec enumerates in §9.
 */
export const CRITICAL_MATERIALS: readonly { id: string; ar: string; en: string }[] = [
  { id: 'wellhead', ar: 'رؤوس الآبار', en: 'Wellheads' },
  { id: 'wellhead-accessories', ar: 'ملحقات رؤوس الآبار', en: 'Wellhead accessories' },
  { id: 'xmas-tree', ar: 'أشجار الميلاد', en: 'Christmas trees' },
  { id: 'completion', ar: 'معدات الإكمال', en: 'Completion equipment' },
  { id: 'tubing', ar: 'أنابيب الإنتاج', en: 'Production tubing' },
  { id: 'liners', ar: 'البطانات', en: 'Liners' },
  { id: 'production-valves', ar: 'الصمامات المؤثرة على الإنتاج', en: 'Production-affecting valves' },
  { id: 'pumps-610', ar: 'مضخات API 610', en: 'API 610 pumps' },
  { id: 'compressors-617', ar: 'ضواغط API 617', en: 'API 617 compressors' },
  { id: 'compressors-618', ar: 'ضواغط API 618', en: 'API 618 compressors' },
  { id: 'compressors-619', ar: 'ضواغط API 619', en: 'API 619 compressors' },
  { id: 'turbines', ar: 'التوربينات', en: 'Turbines' },
  { id: 'oil-processing', ar: 'معدات معالجة النفط', en: 'Oil-processing equipment' },
  { id: 'gas-processing', ar: 'معدات معالجة الغاز', en: 'Gas-processing equipment' },
  { id: 'control-systems', ar: 'أنظمة السيطرة', en: 'Control systems' },
  { id: 'metering', ar: 'أنظمة القياس', en: 'Metering systems' },
  { id: 'esd', ar: 'أنظمة الأمان والإغلاق الطارئ', en: 'Safety / ESD systems' },
];

/** A single bidder's declaration for one critical material in its offer (C8.6). Origin is a property
 *  of the OFFER, not of the shared catalogue. */
export interface MaterialDeclaration {
  materialId: string;
  imported: boolean;
  origin?: string; // where it was made or assembled
  /** the origin of the OEM that authorized it — C8.6 requires this to be an approved origin ("من تلك المناشئ") */
  oemAuthorizedFrom?: string;
  onMooList?: boolean; // C8.7 — chosen from the MoO Vendor List
}

export type OriginVerdict =
  | { ok: true; reason: 'domestic' | 'approved-origin' | 'oem-from-approved' | 'moo-list' }
  | { ok: false; reason: 'incomplete-declaration' | 'unapproved-origin' };

/**
 * C8.6 — the FIRST question is "imported?": a domestic (Iraqi-made) material always passes, so the
 * gate can never invert §9's purpose by rejecting local manufacture. An imported material passes only
 * via an approved origin, an OEM authorization FROM an approved origin (not a bare "authorized"), or
 * MoO-list membership (C8.7). Fail closed: an imported material with nothing approved declared cannot
 * pass — a bare "imported" is a rejection, not an unknown.
 */
export function criticalOriginVerdict(d: MaterialDeclaration, approvedOrigins: readonly string[] = APPROVED_ORIGINS): OriginVerdict {
  if (!d.imported) return { ok: true, reason: 'domestic' };
  if (d.onMooList) return { ok: true, reason: 'moo-list' };
  if (d.origin && approvedOrigins.includes(d.origin)) return { ok: true, reason: 'approved-origin' };
  if (d.oemAuthorizedFrom && approvedOrigins.includes(d.oemAuthorizedFrom)) return { ok: true, reason: 'oem-from-approved' };
  if (!d.origin && !d.oemAuthorizedFrom) return { ok: false, reason: 'incomplete-declaration' };
  return { ok: false, reason: 'unapproved-origin' };
}

/**
 * A bidder may be marked technically qualified (SET_TECHNICAL:pass) only if EVERY declared critical
 * material clears C8.6 (10.6.18). Returns the first failing declaration (for the audit/UI), or null.
 */
export function bidderOriginBlocker(decls: readonly MaterialDeclaration[], approvedOrigins: readonly string[] = APPROVED_ORIGINS): MaterialDeclaration | null {
  return decls.find((d) => !criticalOriginVerdict(d, approvedOrigins).ok) ?? null;
}

/* ---------------- C8.8 — post-award document obligations ---------------- */

/**
 * C8.8 — imported critical materials REQUIRE a ministry-approved-body inspection and a certified
 * origin document, after contract (10.6.17/10.6.19). Enforced through the existing stageCanClose
 * machinery: these become dynamically-required documents on the post-award stages, so the stage
 * cannot close without them. Not an award gate (the obligation is post-contract), but a real one.
 */
export const CRITICAL_IMPORT_DOCS: readonly string[] = ['inspection-cert', 'origin-cert'];

export function criticalImportDocs(hasImportedCritical: boolean): readonly string[] {
  return hasImportedCritical ? CRITICAL_IMPORT_DOCS : [];
}
