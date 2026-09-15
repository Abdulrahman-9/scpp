// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { stageByKey } from '@masaar/scpp-rules';
import { calendarDaysBetween, workingDaysBetween } from '@masaar/working-days';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import { calendarOf, reducer, seedState, todayIso, type State, type Tender } from '../src/store';

/**
 * Batch د11 — the tender file (ops/DESIGN-FINISH-PLAN.md §2-ب, items ت1–ت7).
 *
 * Four facts only a mounted file can hold:
 *
 * 1. THE FUNNEL IS A COUNTER, NOT A LEAK (ت4 · 12.4.2). The reference's «الشركات المتنافسة» card
 *    is three bars. Three bars are harmless; three bars beside the names and prices they were
 *    derived from are a disclosure. The guard seeds a tender whose bidders HAVE names and prices,
 *    at an evaluation step where 12.4.2 still holds, and demands neither appears in the card.
 * 2. THE LOG IS THIS TENDER'S (ت1). `actionTarget` writes the tender CODE — and its raw id when
 *    the tender was absent at write time — so the tab is seeded with both shapes plus a row that
 *    belongs to a DIFFERENT tender, and must show exactly the first two.
 * 3. THE STRIP AGREES WITH THE ROW (ت2). A summary figure that can disagree with the row it
 *    summarises is worse than no figure: the KPI deviation and the timeline's own chip are
 *    asserted to print the SAME string, and that string is the working-day count, not the
 *    calendar one (the two differ by weeks over the seeded span).
 * 4. NO USER, NO CONTACT (ت5 · س١٨). The reference prints «جهة الاتصال» always. Here it is
 *    derived from `state.users`, so an operator with no enabled account gets no contact line at
 *    all rather than a plausible-looking name.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const KEY = 'masaar-operator-v13';
const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };
/** Far past relative to any clock this suite ever runs on. */
const PAST = '2020-01-05';

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});
afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

const card = (heading: string): HTMLElement => screen.getByText(heading).closest('section') as HTMLElement;
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
/** One cell of the ت2 strip, by its label — scoped, because «الحيود» is also a timeline column. */
const kpi = (label: string): HTMLElement =>
  [...document.querySelectorAll('.file-kpi__cell')].find((c) => c.querySelector('.file-kpi__l')?.textContent === label) as HTMLElement;
/** A source file with its comments removed — the standing `visualRefresh` rule: a ban asserted on
 *  raw text would fail on the very prose that explains the ban. */
const codeOf = (p: string): string => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/* ------------------------------------------------------------------ */
/*  ت4 — the competing-companies funnel                                */
/* ------------------------------------------------------------------ */

describe('د11-ت4 — the funnel counts, and 12.4.2 leaves it nothing to hide', () => {
  /** t1 at evaluationStep 1 (technical analysis): prices exist in the record, none may be shown. */
  function pricedState(): State {
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    t1.evaluationStep = 1;
    t1.bidders = t1.bidders.map((b, i) => ({ ...b, priceUSD: 4_100_000 + i * 90_000 }));
    return s;
  }

  it('prints the three derived counts — applied, technically passed, priced', () => {
    const s = pricedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    at('#/operator/t/t1', s);

    const funnel = card('الشركات المتنافسة');
    const values = [...funnel.querySelectorAll('.file-funnel__v')].map((e) => e.textContent);
    expect(values).toEqual([
      String(t1.bidders.length),
      String(t1.bidders.filter((b) => b.technicalResult === 'pass').length),
      String(t1.bidders.filter((b) => b.priceUSD != null).length),
    ]);
    // and the counts are not all equal, so the funnel is measuring rather than repeating one number
    expect(new Set(values).size).toBeGreaterThan(1);
  });

  it('never carries a bidder name or a price, on a tender where both exist', () => {
    const s = pricedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    at('#/operator/t/t1', s);

    const funnel = card('الشركات المتنافسة');
    const text = funnel.textContent ?? '';
    for (const b of t1.bidders) {
      expect(text, `the funnel prints «${b.name}»`).not.toContain(b.name);
      expect(text, 'the funnel prints a price').not.toContain(String(b.priceUSD));
      expect(text).not.toContain(b.priceUSD!.toLocaleString('en-US'));
    }
    expect(text).not.toContain('$');
    // the gate is PRINTED, not merely obeyed — a reader can see why no names are here
    expect(text).toContain('12.4.2');
  });

  it('says so plainly when nothing has been registered yet', () => {
    at('#/operator/t/t2', seedState()); // t2 has no bidders
    expect(within(card('الشركات المتنافسة')).getByText(/لا شركات مسجّلة بعد/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  ت1 — the log tab                                                   */
/* ------------------------------------------------------------------ */

describe('د11-ت1 — the log tab is READ-ONLY and filtered to this tender', () => {
  function auditedState(): State {
    const s = seedState();
    s.audit = [
      { ts: '2026-06-01T08:00:00.000Z', action: 'PLAN_STAGE', target: 'AH-DRL-0212', by: { oid: 'oid-opadmin-01', name: 'م. أحمد عبد الرحمن', role: 'OPERATOR_ADMIN' } },
      { ts: '2026-06-02T09:00:00.000Z', action: 'TOGGLE_DOC', target: 'BD-MNT-0098' },
      { ts: '2026-06-03T10:00:00.000Z', action: 'ADD_BIDDER', target: 't1' }, // the id fallback shape
    ];
    return s;
  }

  it('shows the rows written against this tender — by code AND by the raw-id fallback', () => {
    at('#/operator/t/t1', auditedState());
    openTab('السجل');

    const rows = [...document.querySelectorAll('.file-log tbody tr')];
    expect(rows).toHaveLength(2);
    const text = rows.map((r) => r.textContent).join(' ');
    expect(text).toContain('PLAN_STAGE');
    expect(text).toContain('ADD_BIDDER');
    // the row belonging to the OTHER tender is absent
    expect(text).not.toContain('TOGGLE_DOC');
  });

  it('names the actor where one was stored and «—» where none was — never an invented name', () => {
    const s = auditedState();
    s.audit.push({ ts: '2026-06-04T11:00:00.000Z', action: 'SET_EVAL_STEP', target: 'AH-DRL-0212' });
    at('#/operator/t/t1', s);
    openTab('السجل');

    const cells = [...document.querySelectorAll('.file-log tbody tr')].map((r) => r.lastElementChild?.textContent);
    expect(cells).toContain('م. أحمد عبد الرحمن');
    expect(cells).toContain('—');
  });

  it('offers no control at all — no button, field or link inside the panel', () => {
    at('#/operator/t/t1', auditedState());
    openTab('السجل');

    const panel = document.querySelector('[role="tabpanel"]')!;
    expect(panel.querySelectorAll('button, input, select, textarea, a, [contenteditable]')).toHaveLength(0);
  });

  it('stays honest on a tender no action has ever touched', () => {
    at('#/operator/t/t3', seedState());
    openTab('السجل');
    expect(screen.getByText(/لا قيود على هذه المناقصة بعد/)).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  ت1 — the BIRTH row of a tender created at runtime                  */
/* ------------------------------------------------------------------ */

/**
 * The seeded fixtures above are hand-written rows; these two are not. A tender BORN through the
 * reducer is the case the tab exists for, and it is the case a budget-code target cannot serve:
 * `CREATE_TENDER` carries no `tenderId`, so the target has to be resolved after the tender is
 * minted. Both guards run on the SAME budget line deliberately — the naive repair (matching
 * `budgetCode` in the tab) would pass the first and fail the second by showing one tender the
 * birth row of its sibling.
 */
describe('د11-ت1 — a runtime-created tender owns its birth row, and only its own', () => {
  /** The same request twice, on ONE budget line — what a budget-code target cannot tell apart. */
  const request = (n: number) =>
    ({
      type: 'CREATE_TENDER',
      operatorId: 'op-alwaha',
      fieldId: 'f-ahdab',
      title: { ar: `تجهيز مضخات ${n}`, en: `Pump supply ${n}` },
      budgetCode: 'AH-PMP-3',
      estimatedValueUSD: 1_500_000,
      methodId: 7,
    }) as const;

  function bornState(): { s: State; first: Tender; second: Tender } {
    const s = reducer(reducer(seedState(), request(1)), request(2));
    const [second, first] = s.tenders; // CREATE_TENDER prepends, so newest is first
    return { s, first: first!, second: second! };
  }

  it('shows the birth row inside the created tender\'s own file', () => {
    const { s, second } = bornState();
    expect(second.code, 'fixture: the code and the budget line must be different strings').not.toBe(second.budgetCode);

    at(`#/operator/t/${second.id}`, s);
    openTab('السجل');

    const text = [...document.querySelectorAll('.file-log tbody tr')].map((r) => r.textContent).join(' ');
    expect(text, 'the file carries no record of its own creation').toContain('CREATE_TENDER');
  });

  it('never shows the birth row of a SIBLING drawn on the same budget code', () => {
    const { s, first, second } = bornState();
    expect(first.budgetCode).toBe(second.budgetCode); // fixture: one budget line, two tenders
    expect(first.code).not.toBe(second.code);

    at(`#/operator/t/${second.id}`, s);
    openTab('السجل');

    // the DOM check comes FIRST and stands alone: it is what a budget-code filter would trip on
    const rows = [...document.querySelectorAll('.file-log tbody tr')];
    expect(rows.filter((r) => r.textContent?.includes('CREATE_TENDER')), 'a sibling\'s birth row leaked in').toHaveLength(1);
    expect(rows, 'the tab shows a row this tender never produced').toHaveLength(1);
    // …and the reason it can: the log holds BOTH births under two DISTINCT targets
    expect(s.audit.filter((a) => a.action === 'CREATE_TENDER').map((a) => a.target)).toEqual([first.code, second.code]);
  });
});

/* ------------------------------------------------------------------ */
/*  ت2 — the KPI facts strip                                           */
/* ------------------------------------------------------------------ */

describe('د11-ت2 — the strip is four derived facts, in working days', () => {
  /** t1 with its running stage long overdue and every closed stage closed on plan. */
  function overdueState(): State {
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    const cur = t1.stages.find((x) => x.key === 'tech-analysis')!;
    cur.plannedTo = PAST;
    return s;
  }

  it('prints the WORKING-day deviation, and the timeline chip prints the very same string', () => {
    const s = overdueState();
    at('#/operator/t/t1', s);

    const wd = workingDaysBetween(PAST, todayIso(), calendarOf(s));
    const cal = calendarDaysBetween(PAST, todayIso());
    expect(wd, 'the fixture must separate the two counts').not.toBe(cal);

    const cell = kpi('الحيود');
    // grouped Latin digits, the product's one number style (`fmtCount`)
    expect(cell.textContent).toContain(wd.toLocaleString('en-US'));
    expect(cell.textContent, 'the strip printed CALENDAR days').not.toContain(cal.toLocaleString('en-US'));

    // …and it agrees with the row it summarises: the overdue stage's own chip
    const row = [...document.querySelectorAll('.file-tl__row')].find((r) => r.querySelector('.file-tl__dot--delayed'))!;
    expect(row.querySelector('.op-dev')!.textContent).toBe(cell.querySelector('.op-dev')!.textContent);
  });

  it('counts the running stage\'s documents — received over required, from the store', () => {
    const s = seedState();
    at('#/operator/t/t1', s);
    // t1's current stage is tech-analysis: one required document (evaluation-report), none uploaded
    expect(kpi('مستندات المرحلة').textContent).toContain('0 / 1');
  });

  it('names the current stage from the rule engine, not from a label in the screen', () => {
    const s = seedState();
    at('#/operator/t/t1', s);
    const name = stageByKey('tech-analysis')!.ar;
    expect(kpi('المرحلة الحالية').textContent).toContain(name);
    // the estimate is the store's figure, formatted — not a rounded restatement
    expect(kpi('القيمة التقديرية').textContent).toContain('4,200,000');
  });
});

/* ------------------------------------------------------------------ */
/*  ت5 — the submitting-operator card                                  */
/* ------------------------------------------------------------------ */

describe('د11-ت5 — the operator card derives its contact, or shows none (س١٨)', () => {
  it('reads the company from state.operators and the contact from its first ENABLED account', () => {
    at('#/operator/t/t1', seedState()); // op-alwaha → u8 enabled, u10 disabled
    const c = card('المشغّل المقدِّم');
    expect(c.textContent).toContain('شركة نفط الواحة الصينية');
    expect(c.textContent).toContain('حقل الأحدب النفطي');
    expect(within(c).getByText('م. أحمد عبد الرحمن')).toBeTruthy();
    expect(c.textContent, 'the DISABLED account was offered as the contact').not.toContain('علي الساعدي');
  });

  it('prints NO contact line for an operator with no account in the registry', () => {
    const s = seedState();
    expect(s.users.some((u) => u.operatorId === 'op-fze'), 'fixture: op-fze must have no account').toBe(false);
    at('#/operator/t/t3', s); // t3 → op-fze

    const c = card('المشغّل المقدِّم');
    expect(c.textContent).toContain('FZE');
    expect(c.textContent, 'a contact line appeared with nobody to put in it').not.toContain('جهة الاتصال');
    expect(c.querySelectorAll('.file-siderow')).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  ت3 · ت6 · ت7                                                       */
/* ------------------------------------------------------------------ */

describe('د11-ت3 — the method/authority card restates no clause and no threshold', () => {
  it('reads the clause off METHODS and the band off the LIVE ladder in the store', () => {
    const s = seedState();
    at('#/operator/t/t3', s); // 7.8M — the JMC band under the seeded ladder
    const c = card('الأسلوب والصلاحية');
    expect(c.querySelector('.m-clause')!.textContent).toBe('SCPP 11.1'); // METHODS' own clause
    expect(c.querySelector('.ad-tier')!.className).toContain('ad-tier--jmc');
  });

  it('follows the ladder when the ladder moves — the band is not a literal', () => {
    const s = seedState();
    s.approvalTiers = { ...s.approvalTiers, operatorMaxUSD: 9_000_000 };
    at('#/operator/t/t3', s); // 7.8M now sits inside the operator's own authority
    expect(card('الأسلوب والصلاحية').querySelector('.ad-tier')!.className).toContain('ad-tier--operator');
  });

  it('types no clause of its own in the source', () => {
    for (const p of ['apps/web/src/operator/FileSide.tsx', 'apps/web/src/operator/TenderDetail.tsx']) {
      expect(codeOf(p), `${p} hard-codes an SCPP clause`).not.toMatch(/SCPP\s*(Rev|§|\d)/);
    }
  });
});

describe('د11-ت6 — copying the code is a real act that cannot break the page', () => {
  it('writes the code and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    at('#/operator/t/t1', seedState());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم المناقصة' }));
    });
    expect(writeText).toHaveBeenCalledWith('AH-DRL-0212');
    expect(await screen.findByText(/نُسخ رقم المناقصة/)).toBeTruthy();
  });

  it('survives a browser that offers no clipboard at all — it says so and stays mounted', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    at('#/operator/t/t1', seedState());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم المناقصة' }));
    });
    expect(await screen.findByText(/تعذّر النسخ/)).toBeTruthy();
    expect(document.querySelector('.file-codechip')!.textContent).toBe('AH-DRL-0212'); // still mounted
  });

  it('survives a REFUSED clipboard permission the same way', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    at('#/operator/t/t1', seedState());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم المناقصة' }));
    });
    expect(await screen.findByText(/تعذّر النسخ/)).toBeTruthy();
  });
});

describe('د11-ت7 — the stage bubbles are numbered by THIS tender\'s stage list', () => {
  it('numbers 1..n where n is the path\'s own stage count, on two different paths', () => {
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    const t2 = s.tenders.find((x) => x.id === 't2')!;
    expect(t1.stages.length).not.toBe(t2.stages.length); // no constant can satisfy both

    at('#/operator/t/t1', s);
    const a = [...document.querySelectorAll('.file-tl__dot')].map((e) => e.textContent);
    expect(a).toEqual(t1.stages.map((_, i) => String(i + 1)));

    document.body.innerHTML = '';
    at('#/operator/t/t2', s);
    const b = [...document.querySelectorAll('.file-tl__dot')].map((e) => e.textContent);
    expect(b).toEqual(t2.stages.map((_, i) => String(i + 1)));
  });

  it('keeps the د4 pulsing tag and the month axis untouched', () => {
    at('#/operator/t/t1', seedState());
    expect(document.querySelectorAll('.file-tl__now-dot').length).toBe(1);
    expect(document.querySelectorAll('.file-tl__month').length).toBeGreaterThan(0);
  });
});
