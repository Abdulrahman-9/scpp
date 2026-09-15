# Masaar (مسار) — Backend Alignment & Admin Feature Development Plan

> Produced after the frontend "3-layer" redesign (batches 1–4). Assesses backend/DB compatibility with the new UI and plans the additive work. Governing law: SCPP Rev 1.0.
> Scope: `apps/api` (NestJS), `packages/db/schema.prisma`, reusing `@masaar/scpp-rules` and `@masaar/working-days`.

## Implementation status (2026-07-16)

**Implemented & verified** (api + web typecheck clean · 165 tests · web build · `prisma schema is valid`):
- Item 0 (stagePlan on create) · **Item 1** fairness presenter `tender.presenter.ts` (+6 tests) · **Item 2** bidder↔vendor eligibility 10.4/14.3 (+3) · **Item 3** vendor lifecycle + `VendorEvent` model + `VendorsModule` (+4) · **Item 4** entity 360° `GET /vendors/:id` · **Item 5** tender cancel/suspend/resume + `TenderStatus` + `loadScopedActive` gate (+3) · **Item 6** MCT mutations meeting/agreement/estimate/notify-final (+1) · **Item 7** ±20% band binding at `ratify` + `CalendarService` (+2) · **Item 8** `ContractsModule` VO/extension/LD/guarantee caps §18–21 (+2) · **Item 9** `UsersModule` (last-super-admin + scope guards, +3) · **Item 10** `HolidaysModule` feeding CalendarService · **CC-1** `RolesGuard` async + `ROLE_REFUSED` audit · **CC-2** `auth/scope.ts` shared predicate. Registry module deleted (moved to vendors/contracts — no dead code). Two Prisma migrations (VendorEvent, TenderStatus) applied to the schema + client regenerated.

**Deferred (need infra the local env lacks):**
- **CC-3 DB-level append-only** — `REVOKE UPDATE, DELETE ON "AuditLog","VendorEvent"` needs a live DB migration (the *application* layer already enforces append-only: `AuditService`/`VendorEvent` expose only create+read). Ship with the first real migration.
- **CC-6 frontend wiring** — the new admin endpoints (vendor governance, MCT, cancel, contract caps, users, holidays) have no consuming UI yet (the redesign delivered the admin shell + follow-up room + re-skinned read screens). Add `endpoints.ts` calls + `types.ts` shapes when those admin sub-UIs are built — adding them now would be dead code.

## Compatibility verdict

The redesigned frontend reuses the existing store actions 1:1, and `apps/web/src/api/endpoints.ts` routes every one (`CREATE_TENDER`, `PLAN_STAGE`, `SET_ANNOUNCEMENT`, `PUBLISH_ANNOUNCEMENT`, `SET_EVAL_STEP`, `ADD_BIDDER`, `SET_TECHNICAL`, `SET_PRICE`, `TOGGLE_DOC`, `COMPLETE_STAGE`, `RATIFY`, `RETURN_WITH_NOTES`) to an endpoint that already exists in `TendersController` with correct `@Roles` guards and engine checks. **The tender lifecycle API is compatible as-is; nothing in it needs re-planning.** Everything below is additive: one serialization-layer fix (fairness masking — a compliance leak, not a breaking change), seven new admin feature areas, and two small Prisma migrations.

## Item 0 (DONE) — `CREATE_TENDER` stagePlan
The request wizard's generated planned dates now flow to the API: `CreateTenderDto.stagePlan` (validated nested array, ISO dates, max 20) + `TendersService.create` spreads `plannedFrom/plannedTo` into the `stages.create` block (unknown keys ignored). Implemented & verified (typecheck + 141 tests + build green).

---

## Phase 1 — Fairness masking, vendor governance, entity 360°

### 1. Server-side fairness redaction (12.4.2 / rule #9) — **M**
`TendersService.list()/get()` (and every mutation, which all `return this.loadScoped()`) serialize full bidder `name/vendorId/technicalResult/priceUSD` to every role at every state — masking is client-only today. Add a pure, testable presenter `apps/api/src/tenders/tender.presenter.ts` → `presentTender(tender, user)` applied as the last line of every service method returning a tender:
- **Price rule (hard, all roles incl. SUPER_ADMIN):** emit `priceUSD` only when `isPriceVisible(EVAL_STEPS[evaluationStep], { technicalResult })` is true; else `null`. Excluded bidders' prices never on the wire, ever.
- **Identity rule (role + award state):** pre-award, `ROC_ADMIN`/`AUDITOR` get anonymized `"مقدم عطاء N"` (index by stable sorted `bidder.id`) + `vendorId: null`; operators (own tender) + `EVALUATION` see real identities (they run 12.4 evaluation); post-award (`ratification RATIFIED` or stage `ratify`/`sign`/all-closed) everyone sees all. Policy in one exported `REDACTION_POLICY` table.
- Read-side only — no DTO/Prisma change. Client presentational mask becomes redundant (keep as belt-and-braces).
- Tests: table-driven over (role × evaluationStep × technicalResult × ratification).

### 2. Bidder ↔ Vendor linking + eligibility (10.4) — **S**
Extend existing `POST /tenders/:id/bidders`: `AddBidderDto` gains optional `vendorId`. When present, load `Vendor`, run `vendorEligible({suspended,blacklisted,inDispute})` + refuse when `banUntil` is future (14.3). `@@unique([tenderId,vendorId])` already enforces one-bid-per-vendor. Audit `ADD_BIDDER` (currently missing) + `ADD_BIDDER_REFUSED (10.4)`.

### 3. Vendor lifecycle: suspend / lift / ban / scores — **M**
**Migration M1:** append-only `VendorEvent` model (`kind: SUSPEND|LIFT_SUSPENSION|BAN|LIFT_BAN|SCORE_EDIT`, `reason`, `payload Json?`, `byUserId`, `on`). New `apps/api/src/vendors/` module (move `GET /vendors` here, path unchanged). Endpoints (`@Roles ROC_ADMIN, SUPER_ADMIN`, each in `$transaction` = flag + event):
- `POST /vendors/:id/suspend` — `reason ≥20 chars`; refuse if already suspended.
- `POST /vendors/:id/lift-suspension` — refuse if not suspended.
- `POST /vendors/:id/ban` — `banUntil` + `reason ≥20`; **14.3 cap:** refuse `banUntil > today+12mo`.
- `PATCH /vendors/:id/scores` — 0–100 each + `reason ≥20`.
- **No DELETE — ever.** Audit each + `*_REFUSED`.

### 4. Entity 360° profile — `GET /vendors/:id` — **M**
`@Roles SUPER_ADMIN, ROC_ADMIN, EVALUATION, AUDITOR`. Include `events` (history) + `bidders → tender (ratification, contract, stages)`. Response `VendorProfile`: base vendor + events trail + `participation[]` (per bid: tender, method, technicalResult, priceUSD, `won` via `lowestQualified` + ratified) + computed `stats` (bids, pass rate, wins, win rate). **All prices pass through the item-1 presenter — never a raw include.**

## Phase 2 — Tender governance, MCT cycle, contract caps

### 5. Tender cancel / suspend (إلغاء / تعليق) — **M**
**Migration M2:** `Tender.status TenderStatus @default(ACTIVE)` (`ACTIVE|SUSPENDED|CANCELLED`) + `statusReason/statusChangedOn/statusChangedBy`. No delete. `POST /tenders/:id/{cancel,suspend,resume}` (operator+ROC+super, operator-scoped), `justification ≥20 chars` mandatory in DTO. Cancel refused if `ratification` or `contract` exists. **Cross-cutting:** add `loadScopedActive()` (= `loadScoped` + refuse when `status !== ACTIVE`) and switch every existing mutation to it; reads stay plain (cancelled tenders visible). Audit + `*_REFUSED`.

### 6. MCT cycle mutations (6.9.1/6.9.2/6.9.4) — **M**
Prereq **CalendarService** (`apps/api/src/calendar/`): `getCalendar()` → `{ weekend:[5,6], holidays: from Holiday table }` — every server WD calc uses it, never the default. Endpoints (`@Roles ROC_ADMIN, SUPER_ADMIN`, `mct` must exist):
- `POST /mct/meeting` — record `meetingHeldOn`; late (>14 WD) still recorded (6.9.2 → LC prevails), clause in audit.
- `POST /mct/agreement` — `agreedEstimateUSD` + date; **refuse** unless `mctCycleStatus` yields `prevailingEstimate === 'AGREED'` (void after 21 WD, 6.9.1).
- `PATCH /mct` — `mctEstimateUSD` (for the 6.9.1 MCT-prevails path).
- `POST /mct/notify-final` — 6.9.4; refuse unless `RATIFIED`.

### 7. Enforce ±20% band at ratify (6.9.3/13.3/13.6) — **S**
Make `ratify()` binding: resolve accredited estimate via `mctCycleStatus` prevailing (like store `accreditedEstimate`), `lowestQualified(bidders)`, `awardVerdict`. Refuse when `PENDING` or `verdict.action !== 'award'` → `RATIFY_REFUSED (clause)`. No migration.

### 8. Contract post-award mutations, §18–§21 caps — **M**
New `apps/api/src/contracts/` (move `GET /contracts`). `@Roles ROC_ADMIN, SUPER_ADMIN`, each in `$transaction` (re-read siblings → sum → cap → insert):
- `POST /variation-orders` — `variationOrdersCap` 18.1 ≤10%.
- `POST /extensions` — `extensionCap` 19.3 ≤25%.
- `POST /liquidated-damages` — `liquidatedDamagesCap` 21.2 ≤10%.
- `POST /guarantees` — `bidBondValid`/`performanceBondValid`/`advanceGuaranteeValid`.
- Return `capResult` so the UI meter shows risk ≥80%. Audit + `*_REFUSED (clause)`.
- **8b (optional):** `POST /tenders/:id/contract` to sign at the `sign` stage (seed-only today) — confirm with product.

## Phase 3 — Platform administration

### 9. User & role management — **M**
New `apps/api/src/users/`, **`@Roles SUPER_ADMIN` only**, no DELETE (`disabled:true` terminal — User anchors AuditLog). `GET/POST/PATCH`. Guards: operator roles require `operatorId`, non-operator must not; refuse disabling/demoting the **last enabled SUPER_ADMIN**; refuse self-disable/self-demote. Audit `USER_CREATE/UPDATE/ROLE_CHANGE` + refused.

### 10. Holiday calendar — **S**
New `apps/api/src/holidays/` (or fold into calendar). `GET /holidays` (any authed role — client planning needs it), `POST`/`DELETE` (`ROC_ADMIN, SUPER_ADMIN`). Single reader = `CalendarService`. **Wire `GET /holidays` into `endpoints.ts`** so client `IRAQ_CALENDAR` (currently `holidays: []`) hydrates — else client countdowns and server verdicts disagree.

## Cross-cutting

- **CC-1 Audit refused attempts (8.1-e):** every new guard writes `*_REFUSED` before throwing; make `RolesGuard` async + record `ROLE_REFUSED {method} {route}`; DTO 400s stay un-audited (documented).
- **CC-2 Company scope:** extract the scope predicate to `apps/api/src/auth/scope.ts`; new tender mutations use `loadScopedActive`.
- **CC-3 Append-only:** `VendorEvent` create+read only; raw SQL migration `REVOKE UPDATE, DELETE ON "AuditLog","VendorEvent"` from the API role; no hard-delete anywhere (users→disabled, vendors→suspended/ban, tenders→CANCELLED, contract lines→compensating rows).
- **CC-4 Single binding site per rule** (price lock, announcement, docs, 7.2, 10.4, 14.3, MCT WD, ±20%, caps, guarantees) — table in the plan maps each engine fn to its one server call site. Convert Prisma `Decimal`→`Number` + enum casing at the boundary.
- **CC-5 Migrations:** M1 (VendorEvent, Phase 1), M2 (TenderStatus + 4 cols, Phase 2). Item 1 needs none — masking can ship first.
- **CC-6 Frontend wiring:** each endpoint → typed call in `endpoints.ts` + wire type in `types.ts` (`ApiVendorProfile`, `ApiTender.status`, `ApiMct.finalValueNotified`, `ApiHoliday`) + mapper. Tender flows untouched.
- **CC-7 Testing priority:** (1) presenter table tests; (2) cap boundaries at 10/25/10% + 79.9/80% risk; (3) WD-deadline with seeded Holiday across 14/21 WD; (4) every `*_REFUSED` asserts a row landed before the throw.

**Sequencing:** Item 1 first (active leak) → 2→3→4 (each feeds the next) → 5–8 (independent bar the presenter wrap) → 10 with/before 6 (CalendarService). Phase 1 ≈ 4 items, Phase 2 ≈ 4, Phase 3 ≈ 2.
