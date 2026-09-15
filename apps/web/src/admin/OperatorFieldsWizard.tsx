import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { DevBadge } from '../operator/DevBadge';
import { Icon } from '../operator/Icon';
import { govReasonValid, todayIso, useStore, type Actor, type StoreDispatch } from '../store';
import { useAdminUi } from './AdminShell';
import { Modal } from './Modal';
import { LadderSourceTag, TierPill, tierRange, TIER_ORDER } from './TierPill';
import { useActor } from './UserActions';

/* ------------------------------------------------------------------ *
 * «إضافة مشغّل وحقوله» — client request 9.
 *
 * Every oil field has exactly ONE operating company, so registering a company and registering
 * its fields were never two errands: the old flow made the user cross two screens (Operators →
 * Fields) and re-pick the company they had just created. This is one checklist form (م4): three
 * numbered sections in ONE dialog, each gated on the one before it, committed by the EXISTING
 * governed actions — CREATE_OPERATOR, then CREATE_FIELD per row (which creates the field WITH
 * its Service Contract, §7.1, so the field can raise a tender the moment it exists).
 *
 * It is NOT transactional, and the UI says so instead of pretending. There is no multi-record
 * endpoint and no rollback action — un-creating a record would be exactly the silent deletion
 * 8.1-e forbids.
 *
 * ── The honesty machinery ──────────────────────────────────────────
 * These actions are CLIENT_ONLY: `dispatch` resolves ok:true the moment the reducer is handed the
 * action, while the reducer may still have REFUSED it (an audited refusal leaves state untouched).
 * So the dialog can never learn from the dispatch what happened. Two rules follow, and everything
 * below is built out of them:
 *
 *  1. PRE-GATE — the WHOLE chain is judged against the CURRENT store before anything is
 *     dispatched (`planChain`). The pure gates mirror the reducer guard for guard, and the plan
 *     adds what a per-row gate cannot see: duplicate codes and duplicate DERIVED IDS between the
 *     rows of one batch. A mid-chain refusal is therefore unreachable short of a true race.
 *  2. STORE TRUTH — after each dispatch the row is resolved BY ITS UNIQUE CODE in the store and
 *     read back (`verifyRow`). The receipt renders those resolved records, never the form; a row
 *     whose record is missing — or whose stored name/authority disagrees with the form — is
 *     reported as a failure naming that row, with the refusal reason re-derived from the gates.
 *     The chain STOPS there: no row after it is dispatched, which is what lets the failure note
 *     say «ما أُنشئ قبله قائم» literally.
 * ------------------------------------------------------------------ */

/** One field row being entered. `key` is a stable React identity, never persisted. */
export interface FieldDraft {
  key: number;
  name: string;
  nameEn: string;
  code: string;
  fa: string;
  signedOn: string;
  expiresOn: string;
}

const DEFAULT_SIGNED = '2024-01-01';
const DEFAULT_EXPIRES = '2031-01-01';

export const emptyRow = (key: number): FieldDraft => ({
  key, name: '', nameEn: '', code: '', fa: '', signedOn: DEFAULT_SIGNED, expiresOn: DEFAULT_EXPIRES,
});

/* ---------------- id derivation ---------------- */

/**
 * A latin id fragment from a display name. Arabic yields nothing (by design — an id is a machine
 * key, not a transliteration attempt), which is why the caller falls back to a time-based suffix
 * rather than shipping `op-`.
 */
export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}

/** The operator id the form will claim — previewed live so the machine key is never a surprise. */
export function operatorIdFor(nameEn: string, name: string, fallback: string): string {
  return `op-${slugify(nameEn) || slugify(name) || fallback}`;
}

/** FNV-1a 32-bit as hex — a short, stable fingerprint of one string. */
function digest(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Field id and Service Contract id/code all derive from the field CODE — one key, one lineage.
 *
 * COLLISION-PROOF, deliberately: `slugify` folds punctuation and truncates, so it is NOT injective
 * — 'JALAWLA' and 'JALAWLA-' both fold to 'jalawla', and two rows of one batch used to claim the
 * SAME id (which then let a refused row pass verification against its sibling's record). The CODE
 * is the unique key — gated against the registry and between rows — so the id is derived from it
 * in a way that cannot collide: the readable slug stands whenever it is a faithful round-trip of
 * the code, otherwise a deterministic digest of the CODE follows a `--` separator that `slugify`
 * can never emit (it collapses every run of non-alphanumerics to a single '-'). Same code → same
 * id, always, which is also what makes the re-commit skip path safe.
 */
export function fieldIdsFor(code: string, fallback: string): { fieldId: string; contractId: string; contractCode: string } {
  const upper = code.trim().toUpperCase();
  const plain = slugify(code);
  const key = !upper
    ? fallback
    : plain && plain === upper.toLowerCase()
      ? plain
      : `${plain || 'code'}--${digest(upper)}`;
  return { fieldId: `f-${key}`, contractId: `sc-${key}`, contractCode: `SC-${upper}` };
}

/* ---------------- pure gates (tested) ---------------- */

export interface RegistryNames {
  operatorNames: readonly string[];
  operatorIds: readonly string[];
  fieldCodes: readonly string[];
  fieldIds: readonly string[];
}

/**
 * The records THIS dialog has already created and verified in the store. A re-commit after a
 * partial failure must not read its own work as a duplicate (it would gate the button shut), and
 * must not dispatch it twice (a second refusal row for an act already recorded).
 */
export interface OwnedRecords {
  operatorId: string | null;
  fieldCodes: readonly string[];
}

const NOTHING_OWNED: OwnedRecords = { operatorId: null, fieldCodes: [] };

/** The registry the gates read, taken from the store exactly as it stands. */
export function registryNamesOf(facts: StoreFacts): RegistryNames {
  return {
    operatorNames: facts.operators.map((o) => o.name),
    operatorIds: facts.operators.map((o) => o.id),
    fieldCodes: facts.fields.map((f) => f.code),
    fieldIds: facts.fields.map((f) => f.id),
  };
}

/** Section 1 — the company itself. Mirrors the CREATE_OPERATOR guards (dup id, dup name). */
export function operatorSectionGate(name: string, opId: string, reg: RegistryNames, owned: OwnedRecords = NOTHING_OWNED): string | null {
  if (!name.trim()) return 'operators.nameRequired';
  const mine = owned.operatorId === opId; // our own earlier commit is not a collision
  if (mine) return null;
  if (reg.operatorNames.some((n) => n.trim() === name.trim())) return 'operators.dupName';
  if (reg.operatorIds.includes(opId)) return 'opfields.dupId';
  return null;
}

/**
 * Section 2, per row — mirrors the CREATE_FIELD guards one for one (dup field id/code, FA > 0,
 * signedOn < expiresOn), plus the «born unusable» check the existing add-field form already
 * enforces: a contract that expired yesterday grants no authority today (§7.1 C2).
 */
export function fieldRowGate(
  row: FieldDraft,
  siblings: readonly FieldDraft[],
  reg: RegistryNames,
  today: string,
  owned: OwnedRecords = NOTHING_OWNED,
): string | null {
  const code = row.code.trim().toUpperCase();
  if (!row.name.trim()) return 'fields.nameRequired';
  if (!code) return 'fields.codeRequired';
  const mine = owned.fieldCodes.includes(code);
  if (!mine && reg.fieldCodes.some((c) => c.trim().toUpperCase() === code)) return 'fields.dupCode';
  if (siblings.some((s) => s.key !== row.key && s.code.trim().toUpperCase() === code)) return 'opfields.dupCodeRow';
  if (!mine && reg.fieldIds.includes(fieldIdsFor(row.code, String(row.key)).fieldId)) return 'fields.dupCode';
  if (!(Number(row.fa) > 0)) return 'operators.faInvalid';
  if (!(row.signedOn < row.expiresOn)) return 'fields.datesInvalid';
  if (!(row.expiresOn > today)) return 'fields.expiryPast';
  return null;
}

/* ---------------- the chain planner (pure) ---------------- */

/** One row as the chain will dispatch it — code normalized, ids derived, position fixed. */
export interface PlannedRow {
  key: number;
  /** 1-based position in the form — the number a failure note names */
  n: number;
  fieldId: string;
  contractId: string;
  contractCode: string;
  /** normalized UPPER — the unique key the verification pass resolves by */
  code: string;
  name: string;
  nameEn?: string;
  faUSD: number;
  signedOn: string;
  expiresOn: string;
  /** this dialog already created it and the registry still holds it → do not dispatch again */
  skip: boolean;
  /** the source draft, kept so a refusal reason can be re-derived from the gates */
  draft: FieldDraft;
}

/** Where the chain is refused, and the i18n key that says why. `rowKey: null` = not a row. */
export interface PlanBlock { rowKey: number | null; msg: string }

export interface ChainPlan {
  operatorId: string;
  operatorName: string;
  operatorNameEn?: string;
  reason: string;
  /** false when the company already stands from an earlier attempt of THIS dialog */
  createOperator: boolean;
  rows: PlannedRow[];
  /** section-1 refusal (i18n key) or null */
  operatorMsg: string | null;
  /** per-row refusal (i18n key) or null, aligned with `rows` */
  rowMsgs: (string | null)[];
  /** section-3 refusal (i18n key) or null */
  reasonMsg: string | null;
  /** the FIRST refusal in dispatch order. Non-null → NOTHING may be dispatched. */
  blocked: PlanBlock | null;
}

/**
 * The invariant `fieldIdsFor` is built to satisfy, asserted anyway: no two rows of one batch may
 * claim the same machine id. It fires BEFORE anything is dispatched, so a regression in the id
 * derivation would cost a blocked commit — never a half-written registry with two rows pointing
 * at one record. Reported against the SECOND row, which is the one the user must change.
 */
export function crossRowIdBlock(rows: readonly Pick<PlannedRow, 'key' | 'fieldId' | 'contractId'>[]): PlanBlock | null {
  const fieldIds = new Set<string>();
  const contractIds = new Set<string>();
  for (const r of rows) {
    if (fieldIds.has(r.fieldId) || contractIds.has(r.contractId)) return { rowKey: r.key, msg: 'opfields.dupIdRow' };
    fieldIds.add(r.fieldId);
    contractIds.add(r.contractId);
  }
  return null;
}

/**
 * The whole commit, decided before any of it happens. Every message the dialog shows — the section
 * gates, the per-row notes, the footer — is read off this one plan, so what the user is told and
 * what the commit will actually attempt can never drift apart.
 */
export function planChain(input: {
  name: string;
  nameEn: string;
  opId: string;
  reason: string;
  rows: readonly FieldDraft[];
  reg: RegistryNames;
  today: string;
  owned?: OwnedRecords;
}): ChainPlan {
  const { name, nameEn, opId, reason, rows, reg, today } = input;
  const owned = input.owned ?? NOTHING_OWNED;

  const planned: PlannedRow[] = rows.map((r, i) => {
    const code = r.code.trim().toUpperCase();
    return {
      key: r.key,
      n: i + 1,
      ...fieldIdsFor(r.code, String(r.key)),
      code,
      name: r.name.trim(),
      nameEn: r.nameEn.trim() || undefined,
      faUSD: Number(r.fa),
      signedOn: r.signedOn,
      expiresOn: r.expiresOn,
      // owned AND still standing: a record this dialog made that someone since removed would have
      // to be made again, so the registry is asked rather than the memory.
      skip: !!code && owned.fieldCodes.includes(code) && reg.fieldCodes.some((c) => c.trim().toUpperCase() === code),
      draft: r,
    };
  });

  const rowMsgs = rows.map((r) => fieldRowGate(r, rows, reg, today, owned));
  const idBlock = crossRowIdBlock(planned);
  if (idBlock) {
    const at = planned.findIndex((p) => p.key === idBlock.rowKey);
    if (at >= 0 && rowMsgs[at] == null) rowMsgs[at] = idBlock.msg;
  }

  const operatorMsg = operatorSectionGate(name, opId, reg, owned);
  const reasonMsg = govReasonValid(reason) ? null : 'access.reasonMin';

  const firstRow = rowMsgs.findIndex((m) => m !== null);
  const blocked: PlanBlock | null =
    operatorMsg ? { rowKey: null, msg: operatorMsg }
    : rows.length === 0 ? { rowKey: null, msg: 'opfields.needOneField' }
    : firstRow >= 0 ? { rowKey: planned[firstRow]!.key, msg: rowMsgs[firstRow]! }
    : reasonMsg ? { rowKey: null, msg: reasonMsg }
    : null;

  return {
    operatorId: opId,
    operatorName: name.trim(),
    operatorNameEn: nameEn.trim() || undefined,
    reason: reason.trim(),
    createOperator: owned.operatorId !== opId || !reg.operatorIds.includes(opId),
    rows: planned,
    operatorMsg,
    rowMsgs,
    reasonMsg,
    blocked,
  };
}

/* ---------------- store-truth verification (pure) ---------------- */

/** The slice of the store the verification reads — structurally satisfied by `State`. */
export interface StoreFacts {
  operators: readonly { id: string; name: string; nameEn?: string }[];
  fields: readonly { id: string; code: string; name: string; nameEn?: string; operatorId: string }[];
  serviceContracts: readonly { id: string; code: string; fieldId: string; financialAuthorityUSD: number }[];
}

/** What the registry actually holds for the company — the receipt's only source for it. */
export interface StoredOperator { id: string; name: string; nameEn?: string }
/** What the registry actually holds for one row — the receipt's only source for it. */
export interface StoredRow { fieldId: string; code: string; name: string; contractCode: string; faUSD: number }

export type Verdict<T> = { ok: true; record: T } | { ok: false; msg: string };

/** Did the company land, under the name that was sent? */
export function verifyOperator(plan: ChainPlan, facts: StoreFacts): Verdict<StoredOperator> {
  const o = facts.operators.find((x) => x.id === plan.operatorId);
  if (!o) return { ok: false, msg: 'opfields.failedRefused' };
  if (o.name.trim() !== plan.operatorName) return { ok: false, msg: 'opfields.mismatchName' };
  return { ok: true, record: { id: o.id, name: o.name, nameEn: o.nameEn } };
}

/**
 * Resolve one row BY ITS UNIQUE CODE and read the record back. The form is never the source: a row
 * edited after its record landed, a refusal the CLIENT_ONLY dispatch could not report, and a code
 * the registry gave to a different field all surface here as a named failure instead of a receipt
 * line the store cannot back. When the record is simply absent the reason is re-derived by running
 * the row gate against the registry as it stands — the same predicate the reducer refused on.
 */
export function verifyRow(row: PlannedRow, plan: ChainPlan, facts: StoreFacts, today: string): Verdict<StoredRow> {
  const f = facts.fields.find((x) => x.code.trim().toUpperCase() === row.code);
  if (!f) {
    const why = fieldRowGate(row.draft, plan.rows.map((p) => p.draft), registryNamesOf(facts), today);
    return { ok: false, msg: why ?? 'opfields.failedRefused' };
  }
  if (f.operatorId !== plan.operatorId) return { ok: false, msg: 'opfields.mismatchOperator' };
  if (f.name.trim() !== row.name) return { ok: false, msg: 'opfields.mismatchName' };
  const c = facts.serviceContracts.find((x) => x.fieldId === f.id);
  if (!c) return { ok: false, msg: 'opfields.mismatchContract' };
  if (c.financialAuthorityUSD !== row.faUSD) return { ok: false, msg: 'opfields.mismatchFa' };
  return { ok: true, record: { fieldId: f.id, code: f.code, name: f.name, contractCode: c.code, faUSD: c.financialAuthorityUSD } };
}

/* ---------------- the dialog ---------------- */

type Phase = 'form' | 'committing' | 'done' | 'failed';

/**
 * The chain, mid-flight. `at` is the cursor (-1 = the company, i ≥ 0 = the i-th row) and `stage`
 * is where that step is: handed to the store, awaiting the dispatch promise, or ready to be read
 * back. Keeping `wait` explicit is what makes the effect safe to re-run when the store changes —
 * the store changing is precisely the event the verification is waiting for.
 */
interface Run {
  plan: ChainPlan;
  at: number;
  stage: 'send' | 'wait' | 'verify';
  operator: StoredOperator | null;
  made: StoredRow[];
}

export default function OperatorFieldsWizard({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const today = todayIso();

  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [rows, setRows] = useState<FieldDraft[]>([emptyRow(1)]);
  const [reason, setReason] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [owned, setOwned] = useState<OwnedRecords>(NOTHING_OWNED);
  const [run, setRun] = useState<Run | null>(null);
  const [pending, setPending] = useState<null | { operator: StoredOperator; made: StoredRow[] }>(null);
  const [failure, setFailure] = useState<null | { at: number; msg: string }>(null);
  /** steps of the CURRENT run already handed to the store — a double-invoked effect must not
   *  dispatch the same governed write twice (React StrictMode remounts effects in development). */
  const sentRef = useRef<Set<number>>(new Set());

  // the id is derived, so it is shown rather than revealed after the fact
  const [fallback] = useState(() => Date.now().toString(36));
  const opId = operatorIdFor(nameEn, name, fallback);

  const reg: RegistryNames = useMemo(() => registryNamesOf(state), [state]);

  // ONE plan drives every gate the user reads AND the commit itself — they cannot disagree.
  const plan = useMemo(
    () => planChain({ name, nameEn, opId, reason, rows, reg, today, owned }),
    [name, nameEn, opId, reason, rows, reg, today, owned],
  );

  const sec1 = plan.operatorMsg;
  const sec2 = rows.length === 0 ? 'opfields.needOneField' : plan.rowMsgs.find((m) => m !== null) ?? null;
  const sec3 = plan.reasonMsg;

  const s1ok = sec1 === null;
  const s2ok = s1ok && sec2 === null;
  const s3ok = s2ok && sec3 === null;
  const gate = plan.blocked?.msg ?? null;

  const setRow = (key: number, patch: Partial<FieldDraft>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, emptyRow(Math.max(0, ...rs.map((r) => r.key)) + 1)]);
  const removeRow = (key: number) => setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.key !== key)));

  /**
   * The chain, one step at a time: send → wait → verify-against-the-store → advance. The effect
   * re-runs on every store change, which is exactly the signal the verify stage needs; the `wait`
   * stage is what keeps that re-entry from dispatching the same action twice.
   */
  useEffect(() => {
    if (phase !== 'committing' || !run || !actor) return;

    if (run.stage === 'wait') return;

    if (run.stage === 'send') {
      const action = actionFor(run, actor);
      // a step this dialog already committed is skipped, not re-dispatched: the log records acts,
      // not retries of acts already recorded. It is still verified below, from the store.
      if (!action) {
        setRun((r) => (r ? { ...r, stage: 'verify' } : r));
        return;
      }
      if (sentRef.current.has(run.at)) return;
      sentRef.current.add(run.at);
      setRun((r) => (r ? { ...r, stage: 'wait' } : r));
      // The outcome is deliberately not read: CLIENT_ONLY dispatches resolve ok:true even when the
      // reducer refused. It is still awaited so that the day these actions gain endpoints a server
      // refusal stops the chain here rather than being discovered three records later.
      void dispatch(action).then(() => setRun((r) => (r ? { ...r, stage: 'verify' } : r)));
      return;
    }

    const fail = (at: number, msg: string) => {
      setFailure({ at, msg });
      setRun(null);
      setPhase('failed');
      toast(t('opfields.toastFailed'));
    };

    if (run.at === -1) {
      const v = verifyOperator(run.plan, state);
      if (!v.ok) return fail(-1, v.msg);
      setOwned((o) => ({ ...o, operatorId: run.plan.operatorId }));
      setRun({ ...run, at: 0, stage: 'send', operator: v.record });
      return;
    }

    const row = run.plan.rows[run.at]!;
    const v = verifyRow(row, run.plan, state, today);
    if (!v.ok) return fail(run.at, v.msg);
    const made = [...run.made, v.record];
    setOwned((o) => (o.fieldCodes.includes(row.code) ? o : { ...o, fieldCodes: [...o.fieldCodes, row.code] }));
    if (run.at + 1 < run.plan.rows.length) {
      setRun({ ...run, at: run.at + 1, stage: 'send', made });
      return;
    }
    setPending({ operator: run.operator!, made });
    setRun(null);
    setPhase('done');
  }, [phase, run, state, actor, dispatch, today, t, toast]);

  const commit = () => {
    if (!actor) return;
    // The PRE-GATE. Re-planned from the store as it is at this instant, not from the render that
    // drew the button: nothing is dispatched unless every row would be accepted.
    const fresh = planChain({ name, nameEn, opId, reason, rows, reg: registryNamesOf(state), today, owned });
    if (fresh.blocked) return;
    sentRef.current = new Set();
    setFailure(null);
    setPending(null);
    setPhase('committing');
    setRun({ plan: fresh, at: -1, stage: 'send', operator: null, made: [] });
  };

  /* ---- success: every line below is a record READ BACK from the registry ---- */
  if (phase === 'done' && pending) {
    return (
      <Modal
        title={t('opfields.doneTitle')} sub={pending.operator.name} onClose={onClose} wide
        footer={<><span style={{ flex: 1 }} /><button className="op-btn-primary" onClick={onClose}>{t('opfields.doneClose')}</button></>}
      >
        <div className="wz-note wz-note--ok">
          <Icon name="check" size={15} strokeWidth={2} />
          <span>{t('opfields.doneBody', { name: pending.operator.name, n: fmtCount(pending.made.length, lang) })}</span>
        </div>
        <div className="cf-made">
          <div className="cf-made__row">
            <Icon name="building" size={14} />
            <span dir="auto">{pending.operator.name}</span>
            <span className="op-code">{pending.operator.id}</span>
          </div>
          {pending.made.map((m) => (
            <div key={m.fieldId} className="cf-made__row">
              <Icon name="layers" size={14} />
              <span dir="auto">{m.name}</span>
              <span className="op-code">{m.code}</span>
              <span className="op-code">{m.contractCode}</span>
              <span className="op-code">{fmtMoney(m.faUSD)}</span>
            </div>
          ))}
        </div>
        <div className="wz-gate" style={{ marginBlockStart: 10 }}>{t('opfields.doneVerified')}</div>
        <div className="wz-gate" style={{ marginBlockStart: 6 }}>{t('opfields.doneAudit')}</div>
      </Modal>
    );
  }

  const busy = phase === 'committing';

  return (
    <Modal
      title={t('opfields.title')} sub={t('opfields.sub')} onClose={onClose} wide
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <span className={`wz-gate${s3ok ? ' wz-gate--ok' : ''}`}>{gate ? t(gate) : t('access.auditNote')}</span>
        <button className="op-btn-primary" aria-busy={busy} disabled={!!plan.blocked || busy || !actor} onClick={commit}>
          {busy ? t('opfields.committing') : t('opfields.commit', { n: fmtCount(rows.length, lang) })}
        </button>
      </>}
    >
      {/* No server route exists for either action — say so in API mode instead of implying a write. */}
      {isApiMode && (
        <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>
          <Icon name="alert" size={15} />
          <span>{t('opfields.localOnly')}</span>
          <DevBadge label={t('dev.local')} title={t('opfields.localOnly')} />
        </div>
      )}
      {phase === 'failed' && failure && (
        <div className="wz-note wz-note--danger" style={{ marginBlockEnd: 12 }}>
          <Icon name="alert" size={15} />
          <span>
            {failure.at === -1
              ? t('opfields.failedOperator')
              : t('opfields.failedRow', { n: fmtCount(failure.at + 1, lang) })}
            {' '}{t(failure.msg)}
            {' '}{t('opfields.failedKept')}
          </span>
        </div>
      )}

      {/* ---- 1. the company ---- */}
      <Section n={1} title={t('opfields.s1')} done={s1ok} active={!s1ok} note={t('opfields.s1note')}>
        <div className="cf-grid">
          <div className="wz-field">
            <label className="wz-field__l" htmlFor="ofw-name">{t('operators.name')}</label>
            <input id="ofw-name" className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="wz-field">
            <label className="wz-field__l" htmlFor="ofw-nameen">{t('operators.nameEn')}</label>
            <input id="ofw-nameen" className="wz-in" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
        </div>
        <span className="cf-slug">{t('opfields.idPreview')}: {opId}</span>
        <div className="wz-note wz-note--info">{t('operators.faViaContract')}</div>
      </Section>

      {/* ---- 2. its fields ---- */}
      <Section n={2} title={t('opfields.s2')} done={s2ok} active={s1ok && !s2ok} locked={!s1ok} note={t('opfields.s2note')}>
        {rows.map((r, i) => (
          <div key={r.key} className="cf-row">
            <div className="cf-row__head">
              <span className="cf-row__n">{t('opfields.rowN', { n: fmtCount(i + 1, lang) })}</span>
              {rows.length > 1 && (
                <button type="button" className="cf-row__rm" onClick={() => removeRow(r.key)}>{t('opfields.removeRow')}</button>
              )}
            </div>
            <div className="cf-grid cf-grid--3">
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fn-${r.key}`}>{t('fields.name')}</label>
                <input id={`ofw-fn-${r.key}`} className="wz-in" dir="auto" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })} />
              </div>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fc-${r.key}`}>{t('fields.code')}</label>
                <input id={`ofw-fc-${r.key}`} className="wz-in wz-in--mono" value={r.code} onChange={(e) => setRow(r.key, { code: e.target.value })} />
              </div>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fa-${r.key}`}>{t('operators.faField')}</label>
                <input id={`ofw-fa-${r.key}`} className="wz-in wz-in--mono" type="number" min={1} value={r.fa} onChange={(e) => setRow(r.key, { fa: e.target.value })} />
              </div>
            </div>
            <div className="cf-grid cf-grid--3" style={{ marginBlockStart: 10 }}>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fe-${r.key}`}>{t('fields.nameEn')}</label>
                <input id={`ofw-fe-${r.key}`} className="wz-in" dir="ltr" value={r.nameEn} onChange={(e) => setRow(r.key, { nameEn: e.target.value })} />
              </div>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fs-${r.key}`}>{t('fields.signedOn')}</label>
                {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
                <input id={`ofw-fs-${r.key}`} className="wz-in wz-in--mono" type="date" value={r.signedOn} onChange={(e) => setRow(r.key, { signedOn: e.target.value })} />
              </div>
              <div className="wz-field">
                <label className="wz-field__l" htmlFor={`ofw-fx-${r.key}`}>{t('fields.expiresOn')}</label>
                {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
                <input id={`ofw-fx-${r.key}`} className="wz-in wz-in--mono" type="date" value={r.expiresOn} onChange={(e) => setRow(r.key, { expiresOn: e.target.value })} />
              </div>
            </div>
            <div className="wz-gate" style={{ marginBlockStart: 8 }}>
              {plan.rowMsgs[i] ? t(plan.rowMsgs[i]!) : t('opfields.rowReady', { code: fieldIdsFor(r.code, '').contractCode })}
            </div>
          </div>
        ))}
        <button type="button" className="cf-add" onClick={addRow}>
          <Icon name="plus" size={14} />
          {t('opfields.addRow')}
        </button>
        <div className="wz-note wz-note--info">{t('fields.contractIntro')}</div>
      </Section>

      {/* ---- 3. review + justification ---- */}
      <Section n={3} title={t('opfields.s3')} done={s3ok} active={s2ok && !s3ok} locked={!s2ok} note={t('opfields.s3note')}>
        <table className="op-tbl">
          <thead>
            <tr>
              <th>{t('fields.colField')}</th>
              <th style={{ width: 130 }}>{t('fields.code')}</th>
              <th style={{ width: 150 }}>{t('operators.faField')}</th>
              <th style={{ width: 150 }}>{t('fields.colContract')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="op-tbl__row">
                <td><span dir="auto">{r.name.trim() || '—'}</span></td>
                <td><span className="op-code">{r.code.trim().toUpperCase() || '—'}</span></td>
                <td><span className="op-code">{Number(r.fa) > 0 ? fmtMoney(Number(r.fa)) : '—'}</span></td>
                <td><span className="op-code">{r.code.trim() ? fieldIdsFor(r.code, '').contractCode : '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* The SYSTEM DEFAULT approval ladder, read-only: the bands this company's future requests
            will be measured against are stated while it is being registered, not discovered later.
            د9 — a company under registration has no ladder of its OWN yet (approving one is a
            later, separately justified act from the registry itself), so what is shown is the
            default, and the tag says exactly that rather than implying it is the only ladder. */}
        <div className="wz-field">
          <span className="wz-field__l">{t('operators.ladderTitle')} <LadderSourceTag own={false} /></span>
          <div className="ad-ladder" style={{ marginBlockStart: 6 }}>
            {TIER_ORDER.map((tier) => (
              <div key={tier} className="ad-ladder__row">
                <TierPill tier={tier} tiers={state.approvalTiers} />
                <span>{t(`tier.body.${tier}`)}</span>
                <span className="ad-ladder__band">{tierRange(tier, state.approvalTiers)}</span>
              </div>
            ))}
          </div>
          <div className="ad-ladder__note">{t('operators.ladderNote')}</div>
        </div>

        <div className="wz-field">
          <label className="wz-field__l" htmlFor="ofw-reason">{t('access.reason')}</label>
          <textarea id="ofw-reason" className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%' }} />
        </div>
        <div className="wz-note wz-note--info">{t('opfields.notAtomic')}</div>
      </Section>
    </Modal>
  );
}

/** The numbered gated section: the counter becomes a check the moment the section is satisfied. */
function Section({ n, title, note, done, active, locked, children }: {
  n: number; title: string; note: string; done: boolean; active?: boolean; locked?: boolean; children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const cls = `cf-sec${done ? ' cf-sec--done' : active ? ' cf-sec--on' : ''}${locked ? ' cf-sec--locked' : ''}`;
  return (
    <section className={cls}>
      <div className="cf-sec__head">
        {/* the counter becomes a check — no aria-hidden either way: hiding it when done would
            drop the completion signal, and the footer gate names the first unsatisfied section */}
        <span className="cf-sec__n">
          {done ? <Icon name="check" size={13} strokeWidth={2.4} /> : fmtCount(n, lang)}
        </span>
        <span className="cf-sec__t">{title}</span>
        <span className="cf-sec__s">{locked ? t('opfields.locked') : note}</span>
      </div>
      <div className="cf-sec__body">{children}</div>
    </section>
  );
}

/** The governed write this step of the chain performs, or null when the record already stands. */
function actionFor(run: Run, actor: Actor): Parameters<StoreDispatch>[0] | null {
  const { plan, at } = run;
  if (at === -1) {
    if (!plan.createOperator) return null;
    return {
      type: 'CREATE_OPERATOR', operatorId: plan.operatorId, name: plan.operatorName,
      nameEn: plan.operatorNameEn, reason: plan.reason, by: actor,
    };
  }
  const row = plan.rows[at]!;
  if (row.skip) return null;
  return {
    type: 'CREATE_FIELD',
    fieldId: row.fieldId, operatorId: plan.operatorId, name: row.name, nameEn: row.nameEn,
    code: row.code, contractId: row.contractId, contractCode: row.contractCode,
    financialAuthorityUSD: row.faUSD, signedOn: row.signedOn, expiresOn: row.expiresOn,
    reason: plan.reason, by: actor,
  };
}
