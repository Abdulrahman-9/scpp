// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import {
  crossRowIdBlock, emptyRow, fieldIdsFor, operatorIdFor, operatorSectionGate, planChain, slugify,
  verifyOperator, verifyRow,
  type FieldDraft, type OwnedRecords, type RegistryNames, type StoreFacts,
} from '../src/admin/OperatorFieldsWizard';
import type { State } from '../src/store';
import { saveSession } from '../src/session';

/**
 * Client request 9 — «إضافة مشغّل وحقوله»: one checklist form instead of two screens.
 *
 * The commit path is what matters and it is deliberately NOT a new action: the dialog dispatches
 * the EXISTING governed writes in sequence — CREATE_OPERATOR, then one CREATE_FIELD per row (each
 * creating the field WITH its Service Contract, §7.1). So the test asserts what the store ends up
 * holding and what the append-only log ends up saying, not what the component rendered.
 */

/* ---------------- pure gates ---------------- */

const REG: RegistryNames = {
  operatorNames: ['شركة نفط الواحة الصينية'],
  operatorIds: ['op-alwaha'],
  fieldCodes: ['AHDAB'],
  fieldIds: ['f-ahdab'],
};

describe('slugify / id derivation — the machine key is previewed, never a surprise', () => {
  it('folds an English name into a latin id fragment', () => {
    expect(slugify('  Midland Oil Co. Ltd  ')).toBe('midland-oil-co-ltd');
  });

  it('yields nothing for an Arabic-only name — an id is a key, not a transliteration', () => {
    expect(slugify('شركة نفط الواحة')).toBe('');
  });

  it('falls back rather than shipping a bare `op-` prefix', () => {
    expect(operatorIdFor('', 'شركة نفط الواحة', 'k9x')).toBe('op-k9x');
    expect(operatorIdFor('AlWaha', 'شركة نفط الواحة', 'k9x')).toBe('op-alwaha');
  });

  it('derives the field id, contract id and contract CODE from one key — one lineage', () => {
    expect(fieldIdsFor(' ahdab ', 'fb')).toEqual({ fieldId: 'f-ahdab', contractId: 'sc-ahdab', contractCode: 'SC-AHDAB' });
  });

  /**
   * The blocker this phase closed: `slugify` folds punctuation and truncates, so it is not
   * injective. Two rows of one batch used to claim ONE field id, which let a REFUSED row pass
   * verification against its sibling's record and be printed on the receipt.
   */
  it('gives two codes that FOLD to one slug two different ids', () => {
    const a = fieldIdsFor('JALAWLA', '1');
    const b = fieldIdsFor('JALAWLA-', '2');
    expect(a.fieldId).toBe('f-jalawla');       // the readable key survives for a plain code
    expect(b.fieldId).not.toBe(a.fieldId);
    expect(b.contractId).not.toBe(a.contractId);
    expect(b.contractCode).not.toBe(a.contractCode);
  });

  it('is a pure function of the CODE — same code, same ids, whatever the row fallback', () => {
    expect(fieldIdsFor('JALAWLA-', 'x')).toEqual(fieldIdsFor('  jalawla-  ', 'y'));
  });

  it('still derives from the code when the code folds to nothing at all', () => {
    const arabic = fieldIdsFor('رقعة', '7');
    expect(arabic.fieldId).not.toBe('f-7');                       // not the row-index fallback
    expect(arabic.fieldId).toBe(fieldIdsFor('رقعة', '99').fieldId); // deterministic across rows
  });
});

describe('operatorSectionGate — mirrors the CREATE_OPERATOR guards', () => {
  it('demands a name', () => {
    expect(operatorSectionGate('   ', 'op-x', REG)).toBe('operators.nameRequired');
  });

  it('refuses a duplicate company name and a duplicate derived id, distinctly', () => {
    expect(operatorSectionGate('شركة نفط الواحة الصينية', 'op-x', REG)).toBe('operators.dupName');
    expect(operatorSectionGate('اسم جديد', 'op-alwaha', REG)).toBe('opfields.dupId');
  });

  it('clears a clean company', () => {
    expect(operatorSectionGate('شركة نفط ديالى', 'op-diyala', REG)).toBeNull();
  });
});

/* ---------------- the chain planner + the store-truth verification ----------------
 *
 * These two pure functions ARE the dialog's honesty. The commit is a chain of CLIENT_ONLY
 * dispatches, which resolve ok:true even when the reducer refused, so the dialog can never learn
 * from a dispatch what happened. Instead: `planChain` judges the WHOLE chain against the current
 * registry before anything is sent (so a mid-chain refusal is unreachable short of a race), and
 * `verifyRow` resolves each row BY ITS UNIQUE CODE afterwards and reads the record back (so the
 * receipt quotes the registry, never the form).
 */

const REASON = 'تسجيل شركة مشغّلة جديدة وحقولها بموجب عقد الخدمة المصادق عليه بكتاب 2026/144';
const TODAY = '2026-08-20';

/** One filled field row. */
const row = (key: number, code: string, name = `حقل ${key}`, fa = '2500000'): FieldDraft =>
  ({ ...emptyRow(key), name, code, fa });

const planOf = (rows: FieldDraft[], over: { reg?: RegistryNames; owned?: OwnedRecords; reason?: string } = {}) =>
  planChain({
    name: 'شركة نفط ديالى', nameEn: 'Diyala', opId: 'op-diyala',
    reason: over.reason ?? REASON, rows, reg: over.reg ?? REG, today: TODAY, owned: over.owned,
  });

describe('planChain — the PRE-GATE: the whole chain is judged before a single dispatch', () => {
  it('clears a clean batch and hands one distinct id to every row', () => {
    const p = planOf([row(1, 'JALAWLA'), row(2, 'JALAWLA-')]);
    expect(p.blocked).toBeNull();
    expect(p.createOperator).toBe(true);
    expect(new Set(p.rows.map((r) => r.fieldId)).size).toBe(2);
    expect(p.rows.map((r) => r.code)).toEqual(['JALAWLA', 'JALAWLA-']); // normalized to the key
  });

  it('blocks the WHOLE chain on a duplicate code between rows — and flags BOTH, either may change', () => {
    const p = planOf([row(1, 'JALAWLA'), row(2, 'jalawla')]);
    expect(p.rowMsgs).toEqual(['opfields.dupCodeRow', 'opfields.dupCodeRow']);
    expect(p.blocked).toEqual({ rowKey: 1, msg: 'opfields.dupCodeRow' });
  });

  it('blocks a row whose DERIVED id the registry already holds, even when its code is free', () => {
    // a registry whose ids and codes have drifted apart: the id is the collision, not the code
    const reg: RegistryNames = { ...REG, fieldIds: ['f-ahdab', 'f-jalawla'] };
    expect(planOf([row(1, 'JALAWLA')], { reg }).blocked).toEqual({ rowKey: 1, msg: 'fields.dupCode' });
  });

  it('blocks a code the registry already holds', () => {
    expect(planOf([row(1, 'AHDAB')]).blocked).toEqual({ rowKey: 1, msg: 'fields.dupCode' });
  });

  it('refuses in dispatch order — the company, then the rows, then the justification', () => {
    const bad = planOf([row(1, 'AHDAB')], { reason: 'قصير' });
    expect(bad.blocked!.msg).toBe('fields.dupCode');       // the row, not the reason
    expect(bad.reasonMsg).toBe('access.reasonMin');        // which is still reported on its section
    expect(planOf([row(1, 'JALAWLA')], { reason: 'قصير' }).blocked)
      .toEqual({ rowKey: null, msg: 'access.reasonMin' });
    expect(planOf([]).blocked).toEqual({ rowKey: null, msg: 'opfields.needOneField' });
  });

  /**
   * The invariant `fieldIdsFor` is built to satisfy, asserted anyway: the derivation could regress,
   * and a regression must cost a blocked commit rather than a half-written registry.
   */
  it('asserts the id invariant on its own: a batch claiming one id is blocked at the second row', () => {
    expect(crossRowIdBlock([
      { key: 1, fieldId: 'f-x', contractId: 'sc-x' },
      { key: 2, fieldId: 'f-x', contractId: 'sc-y' },
    ])).toEqual({ rowKey: 2, msg: 'opfields.dupIdRow' });
    expect(crossRowIdBlock([
      { key: 1, fieldId: 'f-x', contractId: 'sc-x' },
      { key: 2, fieldId: 'f-y', contractId: 'sc-y' },
    ])).toBeNull();
  });
});

describe('planChain — the re-commit path skips what THIS dialog already made, resolved by CODE', () => {
  /** The registry as it stands after a partial commit: the company and row 1 landed. */
  const AFTER_PARTIAL: RegistryNames = {
    operatorNames: [...REG.operatorNames, 'شركة نفط ديالى'],
    operatorIds: [...REG.operatorIds, 'op-diyala'],
    fieldCodes: [...REG.fieldCodes, 'JALAWLA'],
    fieldIds: [...REG.fieldIds, 'f-jalawla'],
  };
  const OWNED: OwnedRecords = { operatorId: 'op-diyala', fieldCodes: ['JALAWLA'] };

  it('does not read its own work as a duplicate — otherwise the button would gate itself shut', () => {
    expect(planOf([row(1, 'JALAWLA'), row(2, 'QARATAPA')], { reg: AFTER_PARTIAL }).blocked)
      .toEqual({ rowKey: null, msg: 'operators.dupName' });
    const p = planOf([row(1, 'JALAWLA'), row(2, 'QARATAPA')], { reg: AFTER_PARTIAL, owned: OWNED });
    expect(p.blocked).toBeNull();
  });

  it('re-dispatches neither the company nor the row that stands — the log records acts, not retries', () => {
    const p = planOf([row(1, 'JALAWLA'), row(2, 'QARATAPA')], { reg: AFTER_PARTIAL, owned: OWNED });
    expect(p.createOperator).toBe(false);
    expect(p.rows.map((r) => r.skip)).toEqual([true, false]);
  });

  it('would make the record again if it had since disappeared — the registry is asked, not the memory', () => {
    const p = planOf([row(1, 'JALAWLA')], { reg: REG, owned: OWNED });
    expect(p.createOperator).toBe(true);
    expect(p.rows[0]!.skip).toBe(false);
  });

  it('still blocks a code the registry holds that this dialog did NOT make', () => {
    expect(planOf([row(1, 'AHDAB')], { reg: AFTER_PARTIAL, owned: OWNED }).blocked)
      .toEqual({ rowKey: 1, msg: 'fields.dupCode' });
  });
});

describe('verifyRow / verifyOperator — the receipt is read off the STORE, never off the form', () => {
  const OPERATORS = [{ id: 'op-diyala', name: 'شركة نفط ديالى', nameEn: 'Diyala' }];
  const facts = (over: Partial<StoreFacts> = {}): StoreFacts =>
    ({ operators: OPERATORS, fields: [], serviceContracts: [], ...over });
  const ONE = () => planOf([row(1, 'JALAWLA', 'حقل جلولاء')]);

  it('quotes the record the registry actually holds, not the values that were sent', () => {
    const p = ONE();
    const stored = facts({
      // the registry kept a contract code of its own — the receipt must print THAT one
      fields: [{ id: 'f-jalawla', code: 'JALAWLA', name: 'حقل جلولاء', operatorId: 'op-diyala' }],
      serviceContracts: [{ id: 'sc-jalawla', code: 'SC-LEGACY-01', fieldId: 'f-jalawla', financialAuthorityUSD: 2_500_000 }],
    });
    expect(verifyRow(p.rows[0]!, p, stored, TODAY)).toEqual({
      ok: true,
      record: { fieldId: 'f-jalawla', code: 'JALAWLA', name: 'حقل جلولاء', contractCode: 'SC-LEGACY-01', faUSD: 2_500_000 },
    });
  });

  it('names a row the registry never took, with the reason RE-DERIVED from the registry as it stands', () => {
    const p = ONE();
    // another record already holds the id this row derives: the reducer refused on `dup-field`,
    // and the CLIENT_ONLY dispatch had no way to say so
    const stored = facts({ fields: [{ id: 'f-jalawla', code: 'LEGACY-07', name: 'رقعة قديمة', operatorId: 'op-diyala' }] });
    expect(verifyRow(p.rows[0]!, p, stored, TODAY)).toEqual({ ok: false, msg: 'fields.dupCode' });
  });

  it('falls back to a plain refusal when nothing in the registry explains the absence', () => {
    const p = ONE();
    expect(verifyRow(p.rows[0]!, p, facts(), TODAY)).toEqual({ ok: false, msg: 'opfields.failedRefused' });
  });

  it('reports a row EDITED after its record landed instead of asserting a receipt for it', () => {
    const p = planOf([row(1, 'JALAWLA', 'الاسم الجديد')]);
    const stored = facts({
      fields: [{ id: 'f-jalawla', code: 'JALAWLA', name: 'الاسم القديم', operatorId: 'op-diyala' }],
      serviceContracts: [{ id: 'sc-jalawla', code: 'SC-JALAWLA', fieldId: 'f-jalawla', financialAuthorityUSD: 2_500_000 }],
    });
    expect(verifyRow(p.rows[0]!, p, stored, TODAY)).toEqual({ ok: false, msg: 'opfields.mismatchName' });
  });

  it('reports a stored authority that disagrees with the form', () => {
    const p = ONE();
    const stored = facts({
      fields: [{ id: 'f-jalawla', code: 'JALAWLA', name: 'حقل جلولاء', operatorId: 'op-diyala' }],
      serviceContracts: [{ id: 'sc-jalawla', code: 'SC-JALAWLA', fieldId: 'f-jalawla', financialAuthorityUSD: 900 }],
    });
    expect(verifyRow(p.rows[0]!, p, stored, TODAY)).toEqual({ ok: false, msg: 'opfields.mismatchFa' });
  });

  it('reports a field the registry gave to another company, and one born with no contract', () => {
    const p = ONE();
    const elsewhere = facts({ fields: [{ id: 'f-jalawla', code: 'JALAWLA', name: 'حقل جلولاء', operatorId: 'op-alwaha' }] });
    expect(verifyRow(p.rows[0]!, p, elsewhere, TODAY)).toEqual({ ok: false, msg: 'opfields.mismatchOperator' });

    const contractless = facts({ fields: [{ id: 'f-jalawla', code: 'JALAWLA', name: 'حقل جلولاء', operatorId: 'op-diyala' }] });
    expect(verifyRow(p.rows[0]!, p, contractless, TODAY)).toEqual({ ok: false, msg: 'opfields.mismatchContract' });
  });

  it('verifies the company by its id AND the name that was sent', () => {
    const p = ONE();
    expect(verifyOperator(p, facts({ operators: [] }))).toEqual({ ok: false, msg: 'opfields.failedRefused' });
    expect(verifyOperator(p, facts({ operators: [{ id: 'op-diyala', name: 'اسم آخر' }] })))
      .toEqual({ ok: false, msg: 'opfields.mismatchName' });
    expect(verifyOperator(p, facts()))
      .toEqual({ ok: true, record: { id: 'op-diyala', name: 'شركة نفط ديالى', nameEn: 'Diyala' } });
  });
});

/* ---------------- the commit chain, through the real dialog ---------------- */

/**
 * Mount the REAL screen and open the wizard through its own trigger, so the test also pins that
 * the Operators registry actually reaches this dialog (request 9 replaced the old modal there).
 * The store's own persistence is the read-back channel: in local mode every committed state is
 * written to the key on the spot, so the blob is the store's truth rather than a component prop.
 */
function mount() {
  window.location.hash = '#/admin/operators';
  const utils = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'إضافة مشغّل وحقوله' }));
  return { ...utils, read: (): State => JSON.parse(localStorage.getItem('masaar-operator-v13')!) as State };
}

const type = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** The numbered section carrying this heading — «الاسم بالإنجليزية» exists in more than one. */
const section = (title: string) => screen.getByText(title).closest('.cf-sec') as HTMLElement;
/** The nth repeatable field row. */
const rowAt = (i: number) => screen.getAllByText(/^الحقل \d+$/)[i]!.closest('.cf-row') as HTMLElement;
/** Fill one field row with a usable field + service contract. */
const fillRow = (i: number, name: string, code: string, fa: string) => {
  const r = within(rowAt(i));
  fireEvent.change(r.getByLabelText('اسم الحقل'), { target: { value: name } });
  fireEvent.change(r.getByLabelText('الرمز'), { target: { value: code } });
  fireEvent.change(r.getByLabelText('السلطة المالية بالدولار'), { target: { value: fa } });
};

beforeEach(() => {
  localStorage.clear();
  // only a SUPER_ADMIN may open the form, and the wizard attributes every write to that actor
  saveSession({ name: 'م. مصطفى الكرخي', role: 'SUPER_ADMIN', oid: 'oid-super-01' });
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/** Fill section 1 + the first field row + the justification. */
function fillOne() {
  type('اسم الشركة', 'شركة نفط ديالى');
  fireEvent.change(within(section('بيانات المشغّل')).getByLabelText('الاسم بالإنجليزية (اختياري)'), { target: { value: 'Diyala' } });
  fillRow(0, 'حقل جلولاء', 'jalawla', '2500000');
  fireEvent.change(screen.getByLabelText('المسوّغ'), { target: { value: REASON } });
}

describe('the merged wizard commits the chain of EXISTING governed actions', () => {
  it('creates the operator and TWO fields, each with its Service Contract (§7.1)', async () => {
    const { read } = mount();
    fillOne();
    fireEvent.click(screen.getByRole('button', { name: 'أضف حقلاً آخر' }));
    fillRow(1, 'حقل قره تبة', 'qaratapa', '1800000');

    const before = read();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /سجّل المشغّل/ }));
    });
    const s = read();

    expect(s.operators).toHaveLength(before.operators.length + 1);
    expect(s.operators.at(-1)).toMatchObject({ id: 'op-diyala', name: 'شركة نفط ديالى', nameEn: 'Diyala' });
    expect(s.fields).toHaveLength(before.fields.length + 2);
    expect(s.fields.slice(-2).map((f) => f.code)).toEqual(['JALAWLA', 'QARATAPA']);
    // a field is born WITH its authority, so it can raise a tender at once
    expect(s.serviceContracts.slice(-2).map((c) => c.code)).toEqual(['SC-JALAWLA', 'SC-QARATAPA']);
    expect(s.serviceContracts.at(-2)!.financialAuthorityUSD).toBe(2_500_000);
    expect(s.fields.slice(-2).every((f) => f.operatorId === 'op-diyala')).toBe(true);
  });

  it('lands exactly THREE audit rows — one per governed write, each attributed and applied', async () => {
    const { read } = mount();
    fillOne();
    fireEvent.click(screen.getByRole('button', { name: 'أضف حقلاً آخر' }));
    fillRow(1, 'حقل قره تبة', 'qaratapa', '1800000');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /سجّل المشغّل/ }));
    });
    const audit = read().audit;

    expect(audit).toHaveLength(3);
    expect(audit.map((a) => a.action)).toEqual(['CREATE_OPERATOR', 'CREATE_FIELD', 'CREATE_FIELD']);
    expect(audit.every((a) => a.outcome === 'applied')).toBe(true);
    expect(audit.every((a) => a.by?.oid === 'oid-super-01')).toBe(true);
    // the same justification carries all three — it is ONE act recorded three times, honestly
    expect(audit.map((a) => a.target)).toEqual(['شركة نفط ديالى', 'حقل جلولاء', 'حقل قره تبة']);
  });

  it('shows the success receipt: the operator id and every code that now exists', async () => {
    const { read } = mount();
    fillOne();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /سجّل المشغّل/ }));
    });

    // every line of the receipt is a record RESOLVED FROM THE STORE by its unique code
    const stored = read().fields.find((f) => f.code === 'JALAWLA')!;
    expect(stored).toBeTruthy();
    // scoped to the receipt: the registry behind the dialog shows money of its own
    const receipt = within(screen.getByRole('dialog'));
    expect(receipt.getByText('تمّ التسجيل')).toBeTruthy();
    expect(receipt.getByText('op-diyala')).toBeTruthy();
    expect(receipt.getByText(stored.name)).toBeTruthy();
    expect(receipt.getByText('JALAWLA')).toBeTruthy();
    expect(receipt.getByText('SC-JALAWLA')).toBeTruthy();
    expect(receipt.getByText('$2,500,000')).toBeTruthy(); // Latin digits, mono
    // …and it says so, rather than letting the reader assume the form was echoed back
    expect(receipt.getByText('كل سطر أعلاه مقروء من السجل بعد التثبيت، لا من النموذج')).toBeTruthy();
  });

  it('keeps the commit button shut until all three sections are satisfied', () => {
    mount();
    const commit = () => screen.getByRole('button', { name: /سجّل المشغّل/ }) as HTMLButtonElement;
    expect(commit().disabled).toBe(true);

    type('اسم الشركة', 'شركة نفط ديالى');
    expect(commit().disabled).toBe(true); // no field row yet

    fillRow(0, 'حقل جلولاء', 'JALAWLA', '2500000');
    expect(commit().disabled).toBe(true); // no justification yet

    fireEvent.change(screen.getByLabelText('المسوّغ'), { target: { value: REASON } });
    expect(commit().disabled).toBe(false);
  });

  it('names the collision instead of greying out: a code the registry already holds', () => {
    mount();
    type('اسم الشركة', 'شركة نفط ديالى');
    fireEvent.change(within(rowAt(0)).getByLabelText('اسم الحقل'), { target: { value: 'حقل جلولاء' } });
    fireEvent.change(within(rowAt(0)).getByLabelText('الرمز'), { target: { value: 'AHDAB' } }); // seeded
    expect(within(rowAt(0)).getByText('رمز الحقل مستخدم مسبقًا.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /سجّل المشغّل/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('appends and removes field rows, and never lets the last one go', () => {
    mount();
    expect(screen.getAllByText(/^الحقل \d+$/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'احذف هذا الصف' })).toBeNull(); // nothing to remove

    fireEvent.click(screen.getByRole('button', { name: 'أضف حقلاً آخر' }));
    expect(screen.getAllByText(/^الحقل \d+$/)).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'احذف هذا الصف' })[1]!);
    expect(screen.getAllByText(/^الحقل \d+$/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'احذف هذا الصف' })).toBeNull();
  });

  it('states the SYSTEM DEFAULT ladder, tagged as such, while the company is being registered', () => {
    mount();
    // د9 — ق1's «one ladder for all» was superseded on 2026-08-25: what a company under
    // registration is measured by is the default, and the tag says that rather than implying
    // it is the only ladder there is
    expect(screen.getByText('سلّم الموافقات الافتراضي النظامي — يسري على هذه الشركة ما لم يُعتمد لها سلّم خاص')).toBeTruthy();
    const ladderTag = document.querySelector('.wz-field__l .ad-ladder__src');
    expect(ladderTag?.textContent).toBe('الافتراضي النظامي');
    expect(ladderTag?.classList.contains('ad-ladder__src--own')).toBe(false);
    expect(screen.getByText('≤ $5,000,000')).toBeTruthy();
    expect(screen.getByText('> $10,000,000')).toBeTruthy();
  });

  it('says out loud that the commit is not transactional — no fabricated atomicity', () => {
    mount();
    expect(screen.getByText(/لا يوجد تراجع جماعي/)).toBeTruthy();
  });
});
