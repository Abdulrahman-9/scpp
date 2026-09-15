// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { stageDeviationWorkingDays } from '@masaar/scpp-rules';
import { calendarOf, seedState, sessionScopedTenders, type State } from '../src/store';
import { saveSession } from '../src/session';

/**
 * Batch D8 — product honesty debts (ops/DESIGN-FINISH-PLAN.md §3).
 *
 * D3: the closing wizard used to compute its deviation WITHOUT the holiday calendar while every
 *     display slice passes it — so a holiday inside the window made the wizard promise one figure
 *     and the file show another after closing. The wizard now uses calendarOf(state), and the
 *     figure it shows IS the figure the closed stage carries.
 * D1: the wizard collected the actual start date and the classified deviation reason, then
 *     dropped both from the action. They now ride COMPLETE_STAGE and land on the stage.
 * D4: the local views (inbox / register / shell search) read every company's tenders; an
 *     operator session must see ITS company only — the same judgement the server makes
 *     (apps/api/src/auth/scope.ts operatorScopeWhere). Platform roles keep the full portfolio.
 */

const KEY = 'masaar-operator-v13';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/* ---------------- D3 + D1 — the closing wizard, through the real screen ---------------- */

describe('D3/D1 — CompleteWizard honors the holiday calendar and keeps what it collected', () => {
  /** Seed with t2 (بدرة) ready to close its `approval` stage, and a holiday INSIDE the window:
   *  plannedTo 2026-06-20 (Sat) → actual 2026-06-24 (Wed) spans Sun 21 / Mon 22 / Tue 23 / Wed 24;
   *  2026-06-22 is declared a holiday, so the honest working-day deviation is 3, not 4. */
  function seedWizardState(): void {
    const s = seedState();
    const t2 = s.tenders.find((x) => x.id === 't2')!;
    const approval = t2.stages.find((x) => x.key === 'approval')!;
    approval.uploadedDocs = ['stage-report'];
    s.holidays = [{ date: '2026-06-22', name: 'عطلة اختبارية' }];
    localStorage.setItem(KEY, JSON.stringify(s));
    saveSession({ name: 'كرار محسن', role: 'OPERATOR_USER', oid: 'oid-opuser-01', company: 'مشروع بدرة', companyId: 'op-badra' });
  }

  it('shows the calendar-aware figure, and the closed stage carries the same number + the record', async () => {
    seedWizardState();
    window.location.hash = '#/operator/t/t2/w/complete';
    const { container } = render(<App />);

    // step 0 — the actual dates; `from` defaults to plannedFrom (2026-05-30)
    const dates = container.querySelectorAll('input[type="date"]');
    expect(dates).toHaveLength(2);
    fireEvent.change(dates[1]!, { target: { value: '2026-06-24' } });

    // the wizard's promise: 3 working days late (the 2026-06-22 holiday excluded) — the old
    // calendar-less arithmetic would have said 4
    expect(screen.getAllByText('تأخير 3 ي.ع').length).toBeGreaterThan(0);
    expect(screen.queryByText('تأخير 4 ي.ع')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // → documents (complete)
    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // → deviation reason

    // D1 — classify and detail the reason (≥ 15 chars)
    fireEvent.click(screen.getByRole('button', { name: 'تأخر جهة النشر' }));
    const note = 'تأخر جهة النشر عن الموعد المتفق عليه أسبوعاً كاملاً';
    fireEvent.change(container.querySelector('textarea.wz-ta')!, { target: { value: note } });
    fireEvent.click(screen.getByRole('button', { name: 'التالي' })); // → confirm

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'أغلق المرحلة' }));
    });

    const stored = JSON.parse(localStorage.getItem(KEY)!) as State;
    const stage = stored.tenders.find((x) => x.id === 't2')!.stages.find((x) => x.key === 'approval')!;
    // D1 — nothing collected was thrown away
    expect(stage.actualTo).toBe('2026-06-24');
    expect(stage.actualFrom).toBe('2026-05-30');
    expect(stage.devReason).toEqual({ cat: 'publisherDelay', note });
    // D3 — the post-close chip arithmetic (derive.ts stageDevWd) yields the SAME figure the
    // wizard displayed: 3 working days, the holiday excluded
    expect(stageDeviationWorkingDays(stage.plannedTo!, stage.actualTo!, calendarOf(stored))).toBe(3);
  });
});

/* ---------------- D4 — company scope in the local views ---------------- */

describe('D4 — «جلسة الواحة لا ترى مناقصات بدرة» in the inbox, the register and the shell search', () => {
  const alwahaSession = () =>
    saveSession({ name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN', oid: 'oid-opadmin-01', company: 'شركة نفط الواحة الصينية', companyId: 'op-alwaha' });

  it('inbox: lists AlWaha work only — the Badra tender is not a task here', () => {
    alwahaSession();
    window.location.hash = '#/operator';
    render(<App />);

    expect(screen.getAllByText('AH-DRL-0212').length).toBeGreaterThan(0); // t1 — this company
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();                 // t2 — بدرة
    expect(screen.queryByText('MN-EPC-0305')).toBeNull();                 // t3 — FZE
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();                 // t4 — CNOOC
  });

  it('register: rows, header count and KPI read the company scope only', () => {
    alwahaSession();
    window.location.hash = '#/operator/tenders';
    render(<App />);

    expect(screen.getAllByText('AH-DRL-0212').length).toBeGreaterThan(0);
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();
    expect(screen.queryByText('حفر آبار تطويرية — حقل الأحدب')).toBeTruthy();
    expect(screen.queryByText('صيانة محطة الضخ المركزية — حقل بدرة')).toBeNull();
  });

  it('shell search: finds this company, answers «لا نتائج» for the other one', () => {
    alwahaSession();
    window.location.hash = '#/operator';
    render(<App />);
    const search = screen.getByLabelText('ابحث بالاسم أو الرمز — يقفز للملف');

    fireEvent.change(search, { target: { value: 'BD-MNT' } });
    expect(screen.getByText('لا نتائج لـ«BD-MNT»')).toBeTruthy();
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();

    fireEvent.change(search, { target: { value: 'AH-DRL' } });
    // the result panel's row (the inbox behind it lists the code too, so count, don't single)
    expect(screen.getAllByText('AH-DRL-0212').length).toBeGreaterThan(1);
  });

  it('platform roles keep the whole portfolio — the mirror scopes, it never blinds oversight', () => {
    saveSession({ name: 'د. سارة الجبوري', role: 'MDOC_ADMIN', oid: 'oid-roc-01' });
    expect(sessionScopedTenders(seedState())).toHaveLength(4);

    alwahaSession();
    const scoped = sessionScopedTenders(seedState());
    expect(scoped.map((x) => x.id)).toEqual(['t1']);
  });
});
