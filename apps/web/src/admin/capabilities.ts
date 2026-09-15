import type { ApiRole } from '../session';

/**
 * The capability register — the on-screen source of authority for the access-governance section.
 *
 * Every row corresponds to a handler that actually exists in `apps/api/src/**\/*.controller.ts`.
 * Nothing here is a UI preference: `roles` is the literal `@Roles(...)` list, `scoped` records
 * whether the handler funnels through `operatorScopeWhere`/`loadScoped`, and `guard` distinguishes
 * a real role restriction from an undecorated handler (which `roles.guard.ts` lets through for any
 * authenticated session) from pure session plumbing.
 *
 * Keep `apps/web/test/capabilities.test.ts` green — it pins the counts this screen renders.
 * Re-extract after any controller change and bump CAP_REV + CAP_EXTRACTED_ON.
 */

export type CapDomain = 'tenders' | 'mct' | 'contracts' | 'vendors' | 'users' | 'audit' | 'holidays' | 'system';

/**
 * 'roles'   — @Roles present → an enforced role restriction.
 * 'open'    — no @Roles → any authenticated session passes (roles.guard.ts returns true on empty metadata).
 * 'session' — @Public() or session plumbing → excluded from every capability counter.
 */
export type Guard = 'roles' | 'open' | 'session';

export interface Capability {
  id: string;
  domain: CapDomain;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  route: string;
  /** the literal @Roles(...) set; empty for open/session rows */
  roles: ApiRole[];
  /** runs through loadScoped/operatorScopeWhere — an effective limit only for operator roles */
  scoped: boolean;
  /** loadScopedActive: refused (400) on a cancelled or suspended tender */
  stateGated: boolean;
  /**
   * SCPP clause cited in the handler's comments; empty when the code cites none.
   *
   * Rendered SECTION-FIRST so the value always opens with the section number (pinned by
   * capabilities.test.ts): a handler commented «§9 C8.1» is written `9-C8.1`, the same shape
   * `8.1-e` already uses for a lettered sub-clause. The section is what a reader looks up.
   */
  clause: string;
  guard: Guard;
  label: { ar: string; en: string };
  /** an impactful action: writes, and actually role-restricted */
  mutating: boolean;
  /**
   * Roles the specification document grants this capability to, but the server's guard refuses.
   * Recorded rather than resolved: the screen shows the divergence instead of silently
   * siding with either the spec or the code. Source: `_handoff_masaar_website/spec.html` §3.
   */
  specGrants?: ApiRole[];
}

// re-extracted from EVERY *.controller.ts on 2026-08-20 (phase-5 verification sweep), and the
// count MOVED: 43 → 46. The three added rows are not new endpoints — they are three §9 local-content
// handlers that have been on `TendersController` since the §9 wave and were simply never extracted:
// `setLocalContentClause` (C8.1), `setStateResponse` (C8.2) and `setBidderMaterials` (C8.6). Each
// carries a real `@Roles(...)` decorator, so each was already an ENFORCED restriction the matrix
// silently omitted — a register that under-reports the guarded surface is worse than no register,
// because it reads as an audit of the whole thing.
//
// This is a correction of THIS FILE, not a change in the server: no decorator moved, no role gained
// or lost anything. What changed is that the screen now shows all 46 of the handlers the guard
// actually protects instead of 43 of them.
//
// The 2026-08-20b sweep (the JMC_APPROVER addition, client request 19ب) remains true and is
// unaffected: `ratifyAward` and `returnWithNotes` carry JMC_APPROVER from `RATIFY_ROLES`, and the
// joint committee still reaches exactly those two guarded capabilities plus the three undecorated
// reads — none of the three rows added here admits it.
export const CAP_REV = 'gt-2026-08-20c';
export const CAP_EXTRACTED_ON = '2026-08-20';

/** The seven domains that enter the counted universe, in display order. */
export const COUNTED_DOMAINS: CapDomain[] = ['tenders', 'mct', 'contracts', 'vendors', 'users', 'audit', 'holidays'];

const OPERATOR_ROLES: ApiRole[] = ['OPERATOR_ADMIN', 'OPERATOR_USER', 'SUPER_ADMIN'];
const GOV: ApiRole[] = ['MDOC_ADMIN', 'SUPER_ADMIN'];
const VENDOR_READ: ApiRole[] = ['SUPER_ADMIN', 'MDOC_ADMIN', 'EVALUATION', 'AUDITOR'];
/**
 * `RATIFY_ROLES` in tenders.controller.ts — the ONLY two rows the joint committee reaches. The
 * decorator admits the seat; the ق1 band decides which of the three may sign a given tender, and
 * that second gate lives in TendersService (it is not a role grant, so it is not a column here).
 */
const RATIFY: ApiRole[] = ['MDOC_ADMIN', 'SUPER_ADMIN', 'JMC_APPROVER'];
const ALL_ROLES: ApiRole[] = [
  'SUPER_ADMIN', 'MDOC_ADMIN', 'JMC_APPROVER', 'EVALUATION', 'AUDITOR', 'OPERATOR_ADMIN', 'OPERATOR_USER',
];

/** Shorthand: every field is explicit at the call site except the derived `mutating`. */
const cap = (c: Omit<Capability, 'mutating'>): Capability => ({
  ...c,
  mutating: c.method !== 'GET' && c.guard === 'roles',
});

export const CAPABILITIES: Capability[] = [
  /* ---------------- tenders (20: 18 guarded + 2 open) ---------------- */
  cap({
    id: 'listTenders', domain: 'tenders', method: 'GET', route: '/api/tenders',
    roles: [], scoped: true, stateGated: false, clause: '12.4.2', guard: 'open',
    label: { ar: 'استعراض المناقصات', en: 'List tenders' },
  }),
  cap({
    id: 'getTender', domain: 'tenders', method: 'GET', route: '/api/tenders/:id',
    roles: [], scoped: true, stateGated: false, clause: '12.4.2', guard: 'open',
    label: { ar: 'استعراض تفاصيل المناقصة', en: 'View tender detail' },
  }),
  cap({
    id: 'createTender', domain: 'tenders', method: 'POST', route: '/api/tenders',
    roles: OPERATOR_ROLES, scoped: true, stateGated: false, clause: '7.2', guard: 'roles',
    label: { ar: 'إنشاء طلب التعاقد وتحديد الأسلوب', en: 'Create a procurement request' },
  }),
  cap({
    id: 'publishAnnouncement', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/publish',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '8.1-e', guard: 'roles',
    label: { ar: 'نشر الإعلان', en: 'Publish the announcement' },
  }),
  cap({
    id: 'setBidderPrice', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/price',
    roles: ['OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN'], scoped: true, stateGated: true, clause: '12.4.2', guard: 'roles',
    label: { ar: 'إدخال الأسعار التجارية', en: 'Enter commercial prices' },
  }),
  cap({
    id: 'completeStage', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/complete-stage',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'إغلاق المرحلة الإجرائية', en: 'Close a procedural stage' },
  }),
  cap({
    id: 'ratifyAward', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/ratify',
    roles: RATIFY, scoped: true, stateGated: true, clause: '6.9.3', guard: 'roles',
    label: { ar: 'مصادقة الإحالة', en: 'Ratify the award' },
  }),
  cap({
    id: 'returnWithNotes', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/return',
    roles: RATIFY, scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'إعادة المعاملة مع الملاحظات', en: 'Return with notes' },
  }),
  cap({
    id: 'planStage', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/plan',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'تخطيط مدد المراحل', en: 'Plan stage durations' },
  }),
  cap({
    id: 'patchAnnouncement', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/announcement',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'تحرير بيانات الإعلان قبل النشر', en: 'Edit announcement before publishing' },
  }),
  cap({
    id: 'setEvaluationStep', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/eval-step',
    roles: ['OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN'], scoped: true, stateGated: true, clause: '12.4', guard: 'roles',
    label: { ar: 'تحديد مرحلة التقييم الجارية', en: 'Set the current evaluation step' },
  }),
  cap({
    id: 'addBidder', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/bidders',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '10.4', guard: 'roles',
    label: { ar: 'تسجيل مقدّم عطاء', en: 'Register a bidder' },
  }),
  cap({
    id: 'setTechnicalResult', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/technical',
    roles: ['OPERATOR_ADMIN', 'OPERATOR_USER', 'EVALUATION', 'SUPER_ADMIN'], scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'إدخال نتائج التقييم الفني', en: 'Enter technical evaluation results' },
  }),
  /**
   * The three §9 local-content handlers (tenders.controller.ts:124/131/138). Every one is
   * `@Roles(...OPERATOR_ROLES)` — the SAME list as publish, and deliberately so on the controller's
   * own reasoning: the C8.1 attestation IS the gate publication passes, so whoever may publish is
   * exactly whoever may state that the documents carry the clause. All three funnel through
   * `loadScopedActive`, hence scoped + stateGated.
   */
  cap({
    id: 'setLocalContentClause', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/local-content-clause',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '9-C8.1', guard: 'roles',
    label: { ar: 'إقرار إلحاق بند المشاركة المحلية بالوثائق', en: 'Attest the local-content clause is affixed' },
  }),
  cap({
    id: 'setStateResponse', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/state-response',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '9-C8.2', guard: 'roles',
    label: { ar: 'تثبيت ردّ شركة حكومية بمسوّغ موثّق', en: 'Record a state company’s documented response' },
  }),
  cap({
    id: 'setBidderMaterials', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/bidders/:bidderId/materials',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '9-C8.6', guard: 'roles',
    label: { ar: 'إدخال إقرارات منشأ المواد لمقدّم العطاء', en: 'Enter a bidder’s material-origin declarations' },
  }),

  cap({
    id: 'toggleStageDocument', domain: 'tenders', method: 'PATCH', route: '/api/tenders/:id/document',
    roles: OPERATOR_ROLES, scoped: true, stateGated: true, clause: '', guard: 'roles',
    label: { ar: 'إرفاق أو سحب مستمسكات المرحلة', en: 'Attach or withdraw stage documents' },
  }),
  cap({
    id: 'cancelTender', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/cancel',
    roles: ['OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN'], scoped: true, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'إلغاء المناقصة بموجب مبررات', en: 'Cancel a tender with justification' },
  }),
  cap({
    id: 'suspendTender', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/suspend',
    roles: ['OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN'], scoped: true, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'تعليق إجراءات المناقصة', en: 'Suspend tender proceedings' },
  }),
  cap({
    id: 'resumeTender', domain: 'tenders', method: 'POST', route: '/api/tenders/:id/resume',
    roles: ['OPERATOR_ADMIN', 'MDOC_ADMIN', 'SUPER_ADMIN'], scoped: true, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'استئناف إجراءات المناقصة', en: 'Resume tender proceedings' },
  }),

  /* ---------------- MCT cost cycle (4) — live in TendersController, own domain ---------------- */
  cap({
    id: 'recordMctMeeting', domain: 'mct', method: 'POST', route: '/api/tenders/:id/mct/meeting',
    roles: GOV, scoped: true, stateGated: true, clause: '6.9.2', guard: 'roles',
    label: { ar: 'تثبيت انعقاد اجتماع لجنة الكلف', en: 'Record the cost-committee meeting' },
  }),
  cap({
    id: 'recordMctAgreement', domain: 'mct', method: 'POST', route: '/api/tenders/:id/mct/agreement',
    roles: GOV, scoped: true, stateGated: true, clause: '6.9.1', guard: 'roles',
    label: { ar: 'تثبيت الاتفاق على الكلفة التخمينية', en: 'Record agreement on the estimate' },
  }),
  cap({
    id: 'setMctEstimate', domain: 'mct', method: 'PATCH', route: '/api/tenders/:id/mct',
    roles: GOV, scoped: true, stateGated: true, clause: '6.9', guard: 'roles',
    label: { ar: 'إدخال تخمين لجنة الكلف', en: 'Enter the cost-committee estimate' },
  }),
  cap({
    id: 'notifyMctFinalValue', domain: 'mct', method: 'POST', route: '/api/tenders/:id/mct/notify-final',
    roles: GOV, scoped: true, stateGated: true, clause: '6.9.4', guard: 'roles',
    label: { ar: 'تبليغ الكلفة النهائية بعد المصادقة', en: 'Notify the final ratified value' },
  }),

  /* ---------------- contracts (5) ---------------- */
  cap({
    id: 'listContracts', domain: 'contracts', method: 'GET', route: '/api/contracts',
    roles: ['SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR'], scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'استعراض العقود المبرمة', en: 'List signed contracts' },
  }),
  cap({
    id: 'addVariationOrder', domain: 'contracts', method: 'POST', route: '/api/contracts/:id/variation-orders',
    roles: GOV, scoped: false, stateGated: false, clause: '18.1', guard: 'roles',
    label: { ar: 'إصدار أمر تغييري', en: 'Issue a variation order' },
  }),
  cap({
    id: 'addExtension', domain: 'contracts', method: 'POST', route: '/api/contracts/:id/extensions',
    roles: GOV, scoped: false, stateGated: false, clause: '19.3', guard: 'roles',
    label: { ar: 'منح تمديد لمدة العقد', en: 'Grant a term extension' },
  }),
  cap({
    id: 'addLiquidatedDamage', domain: 'contracts', method: 'POST', route: '/api/contracts/:id/liquidated-damages',
    roles: GOV, scoped: false, stateGated: false, clause: '21.2', guard: 'roles',
    label: { ar: 'فرض الغرامات التأخيرية', en: 'Apply liquidated damages' },
  }),
  cap({
    id: 'addGuarantee', domain: 'contracts', method: 'POST', route: '/api/contracts/:id/guarantees',
    roles: GOV, scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'تسجيل التأمينات والكفالات', en: 'Record guarantees and bonds' },
  }),

  /* ---------------- vendors (6) ---------------- */
  cap({
    id: 'listVendors', domain: 'vendors', method: 'GET', route: '/api/vendors',
    roles: VENDOR_READ, scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'استعراض سجل المجهزين', en: 'List the vendor registry' },
  }),
  cap({
    id: 'vendorProfile', domain: 'vendors', method: 'GET', route: '/api/vendors/:id',
    roles: VENDOR_READ, scoped: false, stateGated: false, clause: '12.4.2', guard: 'roles',
    label: { ar: 'ملف المجهز ومشاركاته', en: 'Vendor profile and participation' },
  }),
  cap({
    id: 'suspendVendor', domain: 'vendors', method: 'POST', route: '/api/vendors/:id/suspend',
    roles: GOV, scoped: false, stateGated: false, clause: '10.4', guard: 'roles',
    label: { ar: 'إيقاف مجهز مؤقتاً', en: 'Suspend a vendor' },
  }),
  cap({
    id: 'liftVendorSuspension', domain: 'vendors', method: 'POST', route: '/api/vendors/:id/lift-suspension',
    roles: GOV, scoped: false, stateGated: false, clause: '10.4', guard: 'roles',
    label: { ar: 'رفع الإيقاف عن المجهز', en: 'Lift a vendor suspension' },
  }),
  cap({
    id: 'banVendor', domain: 'vendors', method: 'POST', route: '/api/vendors/:id/ban',
    roles: GOV, scoped: false, stateGated: false, clause: '14.3', guard: 'roles',
    label: { ar: 'حظر المجهز للامتناع عن التوقيع', en: 'Ban a vendor for refusing to sign' },
  }),
  cap({
    id: 'setVendorScores', domain: 'vendors', method: 'PATCH', route: '/api/vendors/:id/scores',
    roles: ['MDOC_ADMIN', 'EVALUATION', 'SUPER_ADMIN'], scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'تحديث درجات تقييم المجهز', en: 'Update vendor scores' },
  }),

  /* ---------------- users (3) — class-level @Roles('SUPER_ADMIN') ---------------- */
  cap({
    id: 'listUsers', domain: 'users', method: 'GET', route: '/api/users',
    roles: ['SUPER_ADMIN'], scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'استعراض مستخدمي المنظومة', en: 'List platform users' },
  }),
  cap({
    id: 'createUser', domain: 'users', method: 'POST', route: '/api/users',
    roles: ['SUPER_ADMIN'], scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'إنشاء حساب مستخدم', en: 'Create a user account' },
    // spec.html §3: «مدير حساب مقاول — … دعوة المستخدمين …», but users.controller.ts
    // carries a class-level @Roles('SUPER_ADMIN'). Unresolved divergence, shown on screen.
    specGrants: ['OPERATOR_ADMIN'],
  }),
  cap({
    id: 'updateUser', domain: 'users', method: 'PATCH', route: '/api/users/:id',
    roles: ['SUPER_ADMIN'], scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'تعديل صلاحيات المستخدم أو تعطيله', en: 'Change a user’s role or disable them' },
  }),

  /* ---------------- audit (1) ---------------- */
  cap({
    id: 'listAuditLog', domain: 'audit', method: 'GET', route: '/api/audit',
    roles: ['SUPER_ADMIN', 'MDOC_ADMIN', 'AUDITOR'], scoped: false, stateGated: false, clause: '6.7', guard: 'roles',
    label: { ar: 'استعراض سجل التدقيق', en: 'Read the audit log' },
  }),

  /* ---------------- holidays (3: 2 guarded + 1 open) ---------------- */
  cap({
    id: 'listHolidays', domain: 'holidays', method: 'GET', route: '/api/holidays',
    roles: [], scoped: false, stateGated: false, clause: '', guard: 'open',
    label: { ar: 'استعراض العطل الرسمية', en: 'List official holidays' },
  }),
  cap({
    id: 'addHoliday', domain: 'holidays', method: 'POST', route: '/api/holidays',
    roles: GOV, scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'إضافة عطلة رسمية', en: 'Add an official holiday' },
  }),
  cap({
    id: 'removeHoliday', domain: 'holidays', method: 'DELETE', route: '/api/holidays/:date',
    roles: GOV, scoped: false, stateGated: false, clause: '', guard: 'roles',
    label: { ar: 'حذف عطلة رسمية', en: 'Remove an official holiday' },
  }),

  /* ---------------- session & infrastructure (4) — excluded from every counter ---------------- */
  cap({
    id: 'authLogin', domain: 'system', method: 'POST', route: '/api/auth/login',
    roles: [], scoped: false, stateGated: false, clause: '', guard: 'session',
    label: { ar: 'تسجيل الدخول للمنظومة', en: 'Sign in' },
  }),
  cap({
    id: 'authLogout', domain: 'system', method: 'POST', route: '/api/auth/logout',
    roles: ALL_ROLES, scoped: false, stateGated: false, clause: '', guard: 'session',
    label: { ar: 'إنهاء الجلسة', en: 'Sign out' },
  }),
  cap({
    id: 'authMe', domain: 'system', method: 'GET', route: '/api/auth/me',
    roles: ALL_ROLES, scoped: false, stateGated: false, clause: '', guard: 'session',
    label: { ar: 'بيانات الجلسة الحالية', en: 'Current session info' },
  }),
  cap({
    id: 'healthCheck', domain: 'system', method: 'GET', route: '/api/health',
    roles: [], scoped: false, stateGated: false, clause: '', guard: 'session',
    label: { ar: 'فحص جاهزية الخدمة', en: 'Service health check' },
  }),
];

/** The universe every counter and every KPI is computed over — session/infra excluded. */
export const COUNTED: Capability[] = CAPABILITIES.filter((c) => c.guard !== 'session');
