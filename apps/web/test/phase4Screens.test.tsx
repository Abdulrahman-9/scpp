// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import i18n from '../src/i18n';
import { saveSession } from '../src/session';
import { seedState, type State } from '../src/store';

const KEY = 'masaar-operator-v13';
const SUPER = { name: 'م. علي الحسيني', role: 'SUPER_ADMIN' as const, oid: 'oid-super-01' };

/**
 * Phase 4, on real screens (client requests 7, 10, 15, 16, 17).
 *
 * The derivations are pinned in phase4Derive.test.ts. What only a mounted screen can prove is the
 * promise the wave rests on: a declared filter narrows the ROWS it claims to, the stamp on the
 * page describes the rows actually there, and the sections the client asked to have removed are
 * gone rather than merely hidden.
 *
 * The seeded portfolio these tests argue from:
 *   AH-DRL-0212  4.2M   DRILLING                  created 2026-04-28  op-alwaha
 *   BD-MNT-0098  0.85M  OTHER                     created 2026-05-10
 *   MN-EPC-0305  7.8M   ENGINEERING_CONSTRUCTION  created 2026-04-20
 *   B7-FAC-0331  12.4M  ENGINEERING_CONSTRUCTION  created 2026-05-25
 * — which puts one request in each ladder band except JMC, which holds MN-EPC-0305 alone.
 */

beforeEach(() => {
  localStorage.clear();
  saveSession(SUPER);
});

afterEach(async () => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
  if (i18n.language !== 'ar') await i18n.changeLanguage('ar');
});

function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/** Follow a link the way a click does — including the re-sync every registry depends on. */
function follow(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

const stamp = () => (document.querySelector('.reg-stamp') as HTMLElement).textContent ?? '';
const codes = (...c: string[]) => c;
const shows = (code: string) => screen.queryByText(code) !== null;

/**
 * Capture every CSV a run of `act` downloads, with its filename — jsdom neither navigates nor
 * exposes Blob text synchronously, so the parts are read at construction and the anchor's click
 * is what pairs a file with its name.
 */
function captureCsv(run: () => void): { name: string; text: string }[] {
  const files: { name: string; text: string }[] = [];
  const origUrl = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  const OrigBlob = globalThis.Blob;
  let pending = '';
  class TextBlob extends OrigBlob {
    __text: string;
    constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
      super(parts, opts);
      this.__text = parts.map(String).join('');
    }
  }
  globalThis.Blob = TextBlob as unknown as typeof Blob;
  URL.createObjectURL = ((b: Blob) => {
    pending = (b as unknown as { __text?: string }).__text ?? '';
    return 'blob:test';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    files.push({ name: this.download, text: pending });
  };
  try {
    run();
  } finally {
    globalThis.Blob = OrigBlob;
    URL.createObjectURL = origUrl;
    URL.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  }
  return files;
}

/** The data rows of a stamped CSV: line 1 is the stamp, line 2 the header. */
const dataRows = (csv: string) => csv.replace(/^﻿/, '').split('\n').slice(2);

/* ================================================================== */
/*  1 — the declared filters land the rows they claim (request 7)      */
/* ================================================================== */
describe('#/admin/tenders — the value window (request 7)', () => {
  it('keeps a request sitting exactly on either bound and drops the ones outside', () => {
    at('#/admin/tenders?vmin=4200000&vmax=7800000');
    // 4.2M is the floor and 7.8M the ceiling — both inclusive
    expect(shows('AH-DRL-0212')).toBe(true);
    expect(shows('MN-EPC-0305')).toBe(true);
    expect(shows('BD-MNT-0098')).toBe(false); // 0.85M, below
    expect(shows('B7-FAC-0331')).toBe(false); // 12.4M, above
  });

  it('re-filters in place when only the window moves — no remount, no stale table', () => {
    at('#/admin/tenders?vmin=10000000');
    expect(shows('B7-FAC-0331')).toBe(true);
    expect(shows('AH-DRL-0212')).toBe(false);
    follow('#/admin/tenders?vmax=1000000');
    expect(shows('BD-MNT-0098')).toBe(true);
    expect(shows('B7-FAC-0331')).toBe(false);
  });

  it('shows the window as a removable chip that widens the registry and rewrites the address', () => {
    at('#/admin/tenders?vmin=10000000');
    const chip = [...document.querySelectorAll('.reg-chip')]
      .find((c) => c.textContent?.includes('القيمة من')) as HTMLElement;
    expect(chip.textContent).toContain('$10,000,000');
    fireEvent.click(within(chip).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toBe('#/admin/tenders');
    expect(shows('AH-DRL-0212')).toBe(true);
  });

  it('NAMES a crossed window instead of answering «no rows match»', () => {
    at('#/admin/tenders?vmin=10000000&vmax=1000000');
    // the control itself flags the crossed ends…
    expect(document.querySelector('.reg-range--bad .reg-range__warn')?.textContent).toBe('المدى مقلوب');
    // …and the empty state says WHY, instead of «لا مناقصة تطابق» which would be a different claim
    expect((document.querySelector('.op-empty') as HTMLElement).textContent)
      .toContain('الحد الأدنى أكبر من الحد الأعلى');
  });

  it('ignores a malformed bound entirely — a tampered link widens, never empties', () => {
    at('#/admin/tenders?vmin=notanumber');
    for (const c of codes('AH-DRL-0212', 'BD-MNT-0098', 'MN-EPC-0305', 'B7-FAC-0331')) {
      expect(shows(c)).toBe(true);
    }
    expect(stamp()).toContain('بلا فلاتر');
  });
});

describe('#/admin/tenders — the creation-date window, the scope and the tier (request 7)', () => {
  it('narrows by creation date, both ends inclusive', () => {
    at('#/admin/tenders?from=2026-04-28&to=2026-05-10');
    expect(shows('AH-DRL-0212')).toBe(true);  // created on the floor
    expect(shows('BD-MNT-0098')).toBe(true);  // created on the ceiling
    expect(shows('MN-EPC-0305')).toBe(false); // 2026-04-20
    expect(shows('B7-FAC-0331')).toBe(false); // 2026-05-25
  });

  it('narrows by §9 work scope, and a request with none recorded reads as «أخرى»', () => {
    at('#/admin/tenders?scope=ENGINEERING_CONSTRUCTION');
    expect(shows('MN-EPC-0305')).toBe(true);
    expect(shows('B7-FAC-0331')).toBe(true);
    expect(shows('AH-DRL-0212')).toBe(false);
    follow('#/admin/tenders?scope=DRILLING');
    expect(shows('AH-DRL-0212')).toBe(true);
    expect(shows('MN-EPC-0305')).toBe(false);
  });

  it('narrows by the approval tier the GLOBAL ladder derives, ceilings inclusive', () => {
    at('#/admin/tenders?tier=JMC');   // 5M < v ≤ 10M
    expect(shows('MN-EPC-0305')).toBe(true);
    expect(shows('AH-DRL-0212')).toBe(false); // 4.2M → OPERATOR
    expect(shows('B7-FAC-0331')).toBe(false); // 12.4M → MDOC
    follow('#/admin/tenders?tier=MDOC');
    expect(shows('B7-FAC-0331')).toBe(true);
    expect(shows('MN-EPC-0305')).toBe(false);
  });

  it('combines dimensions — every one of them narrows the same set', () => {
    at('#/admin/tenders?scope=ENGINEERING_CONSTRUCTION&vmax=10000000');
    expect(shows('MN-EPC-0305')).toBe(true);
    expect(shows('B7-FAC-0331')).toBe(false);
  });

  it('writes a select choice back into the address, so the URL stays shareable', () => {
    at('#/admin/tenders');
    fireEvent.change(screen.getByLabelText('كل الطبقات'), { target: { value: 'MDOC' } });
    expect(window.location.hash).toBe('#/admin/tenders?tier=MDOC');
  });

  it('clears every dimension in ONE address rewrite, and SAYS how many it is about to drop (ق5)', () => {
    at('#/admin/tenders?tier=MDOC&scope=ENGINEERING_CONSTRUCTION&vmin=1000');
    // the count is the button's own promise: three narrowings are standing, so it offers to undo
    // three — «مسح» with no number leaves the reader guessing what disappears
    const clear = screen.getAllByRole('button', { name: 'مسح الفلاتر (3)' })[0]!;
    fireEvent.click(clear);
    expect(window.location.hash).toBe('#/admin/tenders');
  });
});

/**
 * PHASE-4 FIX — a range bound is committed, not typed into the address.
 *
 * Every keystroke used to rewrite the hash, so typing `100` pushed three history entries and
 * filtered the table twice against numbers nobody meant (`1`, then `10`). Back stopped meaning
 * «the view before the filter» and started meaning «one character ago», and the stamp truthfully
 * described windows the reader had never asked for. The draft now lives in the control until blur
 * or Enter.
 */
describe('the range ends commit on blur/Enter — one deliberate act, one history entry', () => {
  /** every hash value observed across a sequence of events, so a WRITE is visible as a transition */
  function transitions(run: (snap: () => void) => void): string[] {
    const seen: string[] = [window.location.hash];
    run(() => seen.push(window.location.hash));
    return seen.filter((h, i) => i > 0 && h !== seen[i - 1]);
  }

  it('writes the address ONCE for three keystrokes followed by a blur', () => {
    at('#/admin/tenders');
    const input = document.getElementById('atn-val-min') as HTMLInputElement;
    const moves = transitions((snap) => {
      for (const v of ['4', '42', '4200000']) { fireEvent.change(input, { target: { value: v } }); snap(); }
      fireEvent.blur(input);
      snap();
    });
    expect(moves).toEqual(['#/admin/tenders?vmin=4200000']);
    // and the box shows what the reader typed the whole way through
    expect(input.value).toBe('4200000');
  });

  it('commits on Enter without waiting for focus to leave', () => {
    at('#/admin/tenders');
    const input = document.getElementById('atn-val-max') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5000000' } });
    expect(window.location.hash).toBe('#/admin/tenders');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(window.location.hash).toBe('#/admin/tenders?vmax=5000000');
  });

  it('narrows the table on commit, so the rows and the address move together', () => {
    at('#/admin/tenders');
    const input = document.getElementById('atn-val-min') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '10000000' } });
    expect(shows('AH-DRL-0212')).toBe(true); // nothing has happened yet
    fireEvent.blur(input);
    expect(shows('B7-FAC-0331')).toBe(true);
    expect(shows('AH-DRL-0212')).toBe(false);
    expect(stamp()).toContain('عدد الصفوف: 1');
  });

  it('follows the address when the bound moves from somewhere else', () => {
    at('#/admin/tenders?vmin=10000000');
    const input = document.getElementById('atn-val-min') as HTMLInputElement;
    expect(input.value).toBe('10000000');
    follow('#/admin/tenders');
    expect(input.value).toBe('');
  });

  /**
   * `min={0}` DECLARES that a negative USD window is meaningless; it does not prevent one being
   * typed, and `-5` is a value the browser keeps. The URL contract refuses it (`AMOUNT_RE`), so
   * the write is refused too — and the end says why, in the same `wz-gate` voice every other
   * refusal in the product uses. The two dishonest alternatives are writing it (an address
   * claiming a filter the reader would ignore) and wiping it (deleting text nobody asked to lose).
   */
  it('REFUSES a bound the URL contract would not accept, and says so beside the input', () => {
    at('#/admin/tenders');
    const input = document.getElementById('atn-val-min') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-5' } });
    expect(screen.getByText('قيمة غير صالحة — لم تُطبَّق')).toBeTruthy();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('atn-val-min-bad');
    fireEvent.blur(input);
    expect(window.location.hash).toBe('#/admin/tenders');
    // the reader's own text is still there to correct — not wiped
    expect(input.value).toBe('-5');
    // fractions past cents are refused for the same reason: it is not a shape the address accepts
    fireEvent.change(input, { target: { value: '1234.567' } });
    expect(screen.getByText('قيمة غير صالحة — لم تُطبَّق')).toBeTruthy();
    fireEvent.change(input, { target: { value: '5000000' } });
    expect(screen.queryByText('قيمة غير صالحة — لم تُطبَّق')).toBeNull();
    fireEvent.blur(input);
    expect(window.location.hash).toBe('#/admin/tenders?vmin=5000000');
  });
});

describe('#/admin/contracts — the value and signing windows, and the completion select (request 7)', () => {
  it('narrows contracts by value, inclusive at both ends', () => {
    at('#/admin/contracts?vmin=6800000&vmax=9200000');
    expect(shows('FM-CON-0191')).toBe(true);  // 6.8M — the floor
    expect(shows('MN-CON-0205')).toBe(true);  // 9.2M — the ceiling
    expect(shows('AH-CON-0188')).toBe(false); // 12.5M
    expect(shows('EB-CON-0176')).toBe(false); // 3.4M
  });

  it('narrows contracts by SIGNING date, not by any other date on the record', () => {
    at('#/admin/contracts?from=2026-01-01');
    expect(shows('AH-CON-0188')).toBe(true);  // 2026-02-15
    expect(shows('FM-CON-0191')).toBe(true);  // 2026-05-20
    expect(shows('MN-CON-0205')).toBe(false); // 2025-11-10
    expect(shows('EB-CON-0176')).toBe(false); // 2025-03-01
  });

  it('surfaces the completion bucket as a SELECT over the same `?prog=` the histogram writes', () => {
    at('#/admin/contracts');
    fireEvent.change(screen.getByLabelText('كل نسب الإنجاز'), { target: { value: '25-50' } });
    expect(window.location.hash).toBe('#/admin/contracts?prog=25-50');
    expect(shows('AH-CON-0188')).toBe(true);
    expect(shows('EB-CON-0176')).toBe(false);
  });
});

describe('#/admin/fields and #/admin/entities — the archive as a URL dimension (request 7)', () => {
  it('puts the field registry\'s archive side in the address', () => {
    at('#/admin/fields');
    fireEvent.click(screen.getByRole('button', { name: /^المؤرشفة/ }));
    expect(window.location.hash).toBe('#/admin/fields?arch=archived');
  });

  it('stamps the DEFAULT live view even though the address is silent about it', () => {
    at('#/admin/fields');
    expect(stamp()).toContain('الأرشيف: العاملة');
  });

  it('widens «أزل كل المرشّحات» to BOTH sides of the archive, never back to the default narrowing', () => {
    at('#/admin/fields?op=op-alwaha&arch=archived');
    // the chip row and the empty state both offer it — either one must widen the same way
    fireEvent.click(screen.getAllByRole('button', { name: 'أزل كل المرشّحات' })[0]!);
    expect(window.location.hash).toBe('#/admin/fields?arch=all');
  });

  /**
   * PHASE-4 FIX — a default is not a filter.
   *
   * The entity registry defaults to `all` (request 14: every entity, archived ones muted), which
   * is the WIDEST view. Stamping it printed «الأرشيف: الكل» in the active-filters clause of an
   * unnarrowed export and raised a removable chip whose dismiss removed nothing. Both claims were
   * checkable and both were false, so the default is no longer named — while `live`/`archived`,
   * which really do narrow, still are.
   */
  it('does NOT stamp the entity registry\'s default archive view — the widest view is not a filter', () => {
    at('#/admin/entities');
    expect(stamp()).toContain('بلا فلاتر');
    expect(stamp()).not.toContain('الأرشيف');
    // and no dismissible chip claims a narrowing that is not there
    expect([...document.querySelectorAll('.reg-chip')]
      .some((c) => c.textContent?.includes('الأرشيف'))).toBe(false);
  });

  it('stamps the entity archive once it REALLY narrows, and dismissing it deletes the parameter', () => {
    at('#/admin/entities');
    fireEvent.click(screen.getByRole('button', { name: /^المؤرشفة/ }));
    expect(window.location.hash).toBe('#/admin/entities?arch=archived');
    expect(stamp()).toContain('الأرشيف: المؤرشفة');
    const chip = [...document.querySelectorAll('.reg-chip')]
      .find((c) => c.textContent?.includes('الأرشيف')) as HTMLElement;
    fireEvent.click(within(chip).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    // truly removed — not rewritten as `arch=all`, which would re-raise the chip on the next read
    expect(window.location.hash).toBe('#/admin/entities');
    expect(stamp()).toContain('بلا فلاتر');
  });
});

/* ================================================================== */
/*  2 — the stamp travels with the rows (request 7 + methodology م5)   */
/* ================================================================== */
describe('the export/print stamp says exactly what the screen shows', () => {
  it('prints «بلا فلاتر» with the row count and the date on an unnarrowed registry', () => {
    at('#/admin/tenders');
    expect(stamp()).toMatch(/^الفلاتر النشطة: بلا فلاتر · عدد الصفوف: 4 · تاريخ الإصدار: \d{4}-\d{2}-\d{2}$/);
  });

  it('names every active dimension, and the row count follows the narrowing', () => {
    at('#/admin/tenders?tier=MDOC');
    expect(stamp()).toContain('طبقة الموافقة: ط3 · MDOC');
    expect(stamp()).toContain('عدد الصفوف: 1');
  });

  it('counts the SEARCH box too — a filter that never reaches the address still reaches the file', () => {
    at('#/admin/tenders');
    fireEvent.change(screen.getByPlaceholderText('ابحث بالرمز أو العنوان'), { target: { value: 'AH-DRL' } });
    expect(stamp()).toContain('بحث: AH-DRL');
    expect(stamp()).toContain('عدد الصفوف: 1');
    // and it never pushes a history entry for a keystroke
    expect(window.location.hash).toBe('#/admin/tenders');
  });

  it('writes that same sentence as the FIRST line of the CSV, above the header', () => {
    const files = captureCsv(() => {
      at('#/admin/tenders?tier=MDOC');
      fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
    });
    const csv = files.map((f) => f.text).join('');
    const [first, header] = csv.replace(/^﻿/, '').split('\n');
    expect(first).toContain('الفلاتر النشطة: طبقة الموافقة: ط3 · MDOC');
    expect(first).toContain('عدد الصفوف: 1');
    expect(header).toBe('"code","title","operator","field","method","scope","estimatedValueUSD","tier","createdOn","stage","status","deviationWd","ratification"');
  });

  /**
   * PHASE-4 FIX — the three registries that exported with no stamp at all.
   *
   * `Approvals`, `Users` and `Operators` wrote filtered CSVs carrying no sentence about the filter
   * that produced them: once such a file leaves the browser there is nothing in it to distinguish
   * a one-tier chain, or one company's accounts, from the whole register. Each now declares its
   * dimensions the same way the other five do, shows the sentence on screen, and writes it into
   * the file. `test/registry.test.ts` pins that no call site can lose it again.
   */
  it('stamps the approval chain with the tier and the pending gate the link actually applied', () => {
    at('#/admin/approvals?tier=JMC&pending=1');
    expect(stamp()).toContain('طبقة الموافقة: ط2 · JMC');
    // a FLAG prints its value alone — «بوابة: نعم» is not how this reads in Arabic
    expect(stamp()).toContain('بانتظار القرار فقط');
    // and the count is the rows on the page, not the whole chain
    expect(stamp()).toMatch(/عدد الصفوف: \d+/);
    const claimed = Number(/عدد الصفوف: (\d+)/.exec(stamp())![1]);
    expect(document.querySelectorAll('.op-tbl tbody tr')).toHaveLength(claimed);
  });

  it('stamps the access registry with the role it is narrowed to, and counts those rows', () => {
    at('#/admin/users');
    expect(stamp()).toContain('بلا فلاتر');
    fireEvent.click(screen.getByRole('button', { name: /^مشرف رئيسي/ }));
    expect(stamp()).toContain('الدور: مشرف رئيسي');
    const claimed = Number(/عدد الصفوف: (\d+)/.exec(stamp())![1]);
    expect(document.querySelectorAll('.op-tbl tbody tr')).toHaveLength(claimed);
  });

  it('stamps the operators registry, and its «بلا فلاتر» is as much a claim as any other', () => {
    at('#/admin/operators');
    expect(stamp()).toMatch(/^الفلاتر النشطة: بلا فلاتر · عدد الصفوف: \d+ · تاريخ الإصدار: \d{4}-\d{2}-\d{2}$/);
  });

  it('stamps the A4 weekly report — a printed page that names no scope cannot be audited', () => {
    at('#/operator/reports/weekly');
    const s = (document.querySelector('.rp-stamp') as HTMLElement).textContent ?? '';
    expect(s).toContain('النطاق:');
    expect(s).toContain('الفلاتر النشطة: بلا فلاتر');
    expect(s).toContain('تاريخ الإصدار:');
  });

  it('stamps the A4 tender report with its FAIRNESS MASK — the one narrowing a printout hides', () => {
    at('#/operator/t/t1/report');
    const s = () => (document.querySelector('.rp-stamp') as HTMLElement).textContent ?? '';
    expect(s()).toContain('النطاق: المناقصة AH-DRL-0212');
    expect(s()).toContain('وضع الإظهار:');
    const before = s();
    fireEvent.click(screen.getByRole('button', { name: 'كامل (بعد الإحالة)' }));
    expect(s()).not.toBe(before); // the stamp follows the mask, because the page's content does
  });
});

/* ================================================================== */
/*  3 — the time-compliance screen (request 10)                        */
/* ================================================================== */
describe('#/admin/schedule — «الامتثال الزمني» (request 10)', () => {
  it('is reachable at its own address and is NOT the legacy §9 compliance screen', () => {
    at('#/admin/schedule');
    expect(screen.getByRole('heading', { name: 'الامتثال الزمني' })).toBeTruthy();
    // the §9 screen's own sections must not be here
    expect(screen.queryByText('المحتوى المحلي (§9 / المادة 25)')).toBeNull();
  });

  it('tabulates planned against actual per request, and marks the completed one on its LAST CLOSED stage', () => {
    at('#/admin/schedule');
    for (const c of codes('AH-DRL-0212', 'BD-MNT-0098', 'MN-EPC-0305', 'B7-FAC-0331')) {
      expect(shows(c)).toBe(true);
    }
    // three of the four seeded requests run past their current stage's planned close
    expect(screen.getAllByText('متأخرة').length).toBeGreaterThan(0);
  });

  it('carries a KPI strip whose average names the rows it was computed from', () => {
    at('#/admin/schedule');
    // the KPI label, not the row pill that shares its wording — the verdict and the count are
    // deliberately the same sentence, so the strip is selected by its own anatomy
    const strip = document.querySelector('.ad-kpis') as HTMLElement;
    expect(within(strip).getByText('ضمن الجدول')).toBeTruthy();
    expect(within(strip).getByText('متوسط الحيود (يوم عمل)')).toBeTruthy();
    expect(screen.getByText(/محسوب من \d+ مرحلة ذات خطة/)).toBeTruthy();
  });

  it('explains its windows honestly, including the two different UNITS on one screen', () => {
    at('#/admin/schedule');
    const explain = document.querySelector('.reg-explain') as HTMLElement;
    expect(within(explain).getByText(/بأيام العمل/)).toBeTruthy();
    expect(within(explain).getByText(/بالنقاط المئوية لا بالأيام/)).toBeTruthy();
    expect(within(explain).getByText(/«لا خطة» ليست «لا انحراف»/)).toBeTruthy();
  });

  it('holds a second table for contracts, with its own unit named', () => {
    at('#/admin/schedule');
    expect(screen.getByText('العقود — التقدّم مقابل المخطط')).toBeTruthy();
    expect(shows('AH-CON-0188')).toBe(true);
  });

  it('filters by operating company and by status through the SHARED URL vocabulary', () => {
    at('#/admin/schedule?op=op-alwaha');
    expect(shows('AH-DRL-0212')).toBe(true);
    expect(shows('BD-MNT-0098')).toBe(false);
    follow('#/admin/schedule?status=delayed');
    // the SAME `status` vocabulary every other registry uses, so a pasted link means one thing
    expect(stamp()).toContain('الحالة: متأخر');
    expect(stamp()).toContain('عدد الصفوف: 3'); // the three late REQUESTS — this stamp's own table
  });

  /**
   * PHASE-4 FIX — one stamp cannot describe two tables.
   *
   * The screen carried a single stamp counting `tenders + contracts` (7) above an export that
   * wrote the 3 tender rows, and it named `status` — which the contract table never reads. Three
   * checkable claims, three of them false. The split is per TABLE: each stamp counts its own rows,
   * names only the filters that actually applied to it, and is written by its own button into its
   * own file. Two units in one flat CSV would need a second header row mid-table anyway.
   */
  describe('the two tables are two stamped exports, never one', () => {
    const stamps = () => [...document.querySelectorAll('.reg-stamp')].map((e) => e.textContent ?? '');

    it('stamps each table with ITS own scope and ITS own row count', () => {
      at('#/admin/schedule');
      const [tenders, contracts] = stamps();
      expect(stamps()).toHaveLength(2);
      expect(tenders).toMatch(/النطاق: 4 مناقصة .*عدد الصفوف: 4/);
      expect(contracts).toMatch(/النطاق: 4 عقداً .*عدد الصفوف: 4/);
    });

    it('keeps `status` OUT of the contracts stamp, because that table does not read it', () => {
      at('#/admin/schedule?status=delayed');
      const [tenders, contracts] = stamps();
      expect(tenders).toContain('الحالة: متأخر');
      expect(tenders).toContain('عدد الصفوف: 3');
      // the contract table was NOT narrowed, so its stamp must not claim it was
      expect(contracts).not.toContain('الحالة');
      expect(contracts).toContain('عدد الصفوف: 4');
      // …and the panel says so on screen rather than leaving the chip row to imply otherwise
      expect(screen.getByText(/فلتر الحالة يخص المناقصات/)).toBeTruthy();
    });

    it('says nothing about the status filter while none is applied', () => {
      at('#/admin/schedule');
      expect(screen.queryByText(/فلتر الحالة يخص المناقصات/)).toBeNull();
    });

    it('offers TWO labelled export buttons, each writing its own file with its own stamp', () => {
      const files = captureCsv(() => {
        at('#/admin/schedule?status=delayed');
        fireEvent.click(screen.getByRole('button', { name: 'تصدير جدول المناقصات (CSV)' }));
        fireEvent.click(screen.getByRole('button', { name: 'تصدير جدول العقود (CSV)' }));
      });
      expect(files.map((f) => f.name))
        .toEqual(['masaar-schedule-tenders.csv', 'masaar-schedule-contracts.csv']);

      // each file's stamp counts the DATA ROWS that file actually carries — the arithmetic the
      // single stamp got wrong (it claimed 7 above an export that wrote 3)
      for (const f of files) {
        const claimed = Number(/عدد الصفوف: (\d+)/.exec(f.text.split('\n')[0]!)![1]);
        expect(dataRows(f.text)).toHaveLength(claimed);
      }
      expect(files[0]!.text).toContain('الحالة: متأخر');
      expect(files[1]!.text).not.toContain('الحالة: متأخر');
      // two units, two header rows — never stacked into one flat table
      expect(files[0]!.text.split('\n')[1]).toContain('"stageDeviationWd"');
      expect(files[1]!.text.split('\n')[1]).toContain('"variancePct"');
    });
  });

  /**
   * PHASE-4 FIX — the follow-up room's tile calls this screen its DECOMPOSITION, and that claim
   * is only true if the two surfaces print the same number. They now share one derivation
   * (`allTimeSchedulePct`), so this test can compare the rendered figures directly.
   */
  it('prints the follow-up room\'s all-time ratio in its own header, to the digit', () => {
    at('#/admin');
    const tileValue = (screen.getByText('الالتزام بالجداول').closest('a') as HTMLElement)
      .querySelector('.ad-kpi__v')!.textContent;
    expect(tileValue).toMatch(/^\d+%$/);

    follow('#/admin/schedule');
    const header = document.querySelector('.ad-kpis') as HTMLElement;
    const kpi = within(header).getByText('الالتزام بالجداول — منذ البداية').closest('.ad-kpi') as HTMLElement;
    expect(kpi.querySelector('.ad-kpi__v')!.textContent).toBe(tileValue);
    // and it names the window that makes it different from the four filtered tiles beside it
    expect(kpi.querySelector('.ad-kpi__win')!.textContent).toBe('منذ البداية · المحفظة كلها');
    expect(document.querySelector('.reg-explain')!.textContent)
      .toContain('لا تتأثر بمرشّحات هذه الشاشة');
  });

  it('keeps that header figure FIXED while the screen\'s own filtered windows move', () => {
    at('#/admin/schedule');
    const allTime = () => (document.querySelector('.ad-kpi .ad-kpi__v') as HTMLElement).textContent;
    const before = allTime();
    follow('#/admin/schedule?op=op-alwaha&status=delayed');
    // it is portfolio-wide and all-time by construction — a filter that moved it would mean the
    // tile and this screen had silently drifted apart again
    expect(allTime()).toBe(before);
    // …while the tender stamp beside it does follow both filters
    expect(stamp()).toContain('الشركة:');
    expect(stamp()).toContain('الحالة: متأخر');
  });
});

/* ================================================================== */
/*  4 — the two ministry lists (request 15 / ق5)                       */
/* ================================================================== */
describe('«قائمة الوزارة» is two registers, and every surface that shows one says so (ق5)', () => {
  it('discloses BOTH definitions with the rule each one governs, on the entity registry', () => {
    at('#/admin/entities');
    const explain = document.querySelector('.reg-explain') as HTMLElement;
    expect(within(explain).getByText(/الشركات الحكومية الخمس \(المادة 25\)/)).toBeTruthy();
    expect(within(explain).getByText(/قائمة مجهّزي الوزارة/)).toBeTruthy();
    // and which rule reads which, cited
    expect(explain.textContent).toContain('SCPP 25 · C8.1/C8.2');
    expect(explain.textContent).toContain('SCPP C8.7');
  });

  it('states the overlap from LIVE counts, so the explanation cannot drift from the registry', () => {
    at('#/admin/entities');
    const explain = document.querySelector('.reg-explain') as HTMLElement;
    // seeded: 5 Article-25 companies, 7 on the suppliers list, 4 on both
    expect(explain.textContent).toContain('5 شركة حكومية بالمادة 25');
    expect(explain.textContent).toContain('7 جهة في قائمة المجهّزين');
    expect(explain.textContent).toContain('4 في القائمتين معاً');
  });

  it('offers the two registers as two SEPARATE chips, each counted', () => {
    at('#/admin/entities');
    const five = screen.getByRole('button', { name: /الشركات الحكومية الخمس/ });
    expect(within(five).getByText('5')).toBeTruthy();
    const moo = screen.getByRole('button', { name: /^قائمة مجهّزي الوزارة/ });
    expect(within(moo).getByText('7')).toBeTruthy();
  });

  it('narrows to the Article-25 five, and marks them on the NAME rather than as a capability', () => {
    at('#/admin/entities');
    fireEvent.click(screen.getByRole('button', { name: /الشركات الحكومية الخمس/ }));
    expect(shows('شركة الحفر العراقية')).toBe(false); // private, on the suppliers list only
    const row = screen.getByText(/IDC/).closest('tr') as HTMLElement;
    expect(within(row).getByText('حكومية — المادة 25')).toBeTruthy();
  });

  it('renames the ambiguous column: the registry column now says WHICH list it means', () => {
    at('#/admin/entities');
    expect(screen.getAllByText('قائمة مجهّزي الوزارة').length).toBeGreaterThan(0);
    expect(screen.queryByRole('columnheader', { name: 'قائمة الوزارة' })).toBeNull();
  });

  it('carries the same disclosure onto the §9 compliance screen', () => {
    at('#/admin/compliance');
    expect(screen.getByText(/ما الفرق بين «قائمة الوزارة» و«الشركات الحكومية الخمس»؟/)).toBeTruthy();
  });
});

/* ================================================================== */
/*  5 — the vendor report and the 60-day removal (requests 16 + 17)    */
/* ================================================================== */
describe('#/admin/reports — the vendor section (request 16 / ق6)', () => {
  it('classifies each entity from the scopes it actually competed in, caveat on the face of it', () => {
    at('#/admin/reports');
    expect(screen.getByRole('heading', { name: /تقرير الموردين/ })).toBeTruthy();
    expect(screen.getByText(/مشتق من نطاقات مشاركاتها — بانتظار التصنيف الرسمي/)).toBeTruthy();
  });

  it('bands financial capacity on the CLIENT\'s own ladder and justifies the choice on the page', () => {
    at('#/admin/reports');
    const explain = [...document.querySelectorAll('.reg-explain')]
      .find((e) => e.textContent?.includes('شرائح القدرة المالية')) as HTMLElement;
    expect(explain.textContent).toContain('$5,000,000');
    expect(explain.textContent).toContain('$10,000,000');
    expect(explain.textContent).toContain('تتحرّك كلما تحرّكت البيانات');
  });

  it('prints «غير محدَّد» for an entity with no clear leading scope, never a guessed one', () => {
    at('#/admin/reports');
    // the five Article-25 companies have bid on nothing in the seed
    expect(screen.getAllByText('غير محدَّد').length).toBeGreaterThanOrEqual(5);
  });

  it('stamps the vendor table with its own scope and row count', () => {
    at('#/admin/reports');
    const stamps = [...document.querySelectorAll('.reg-stamp')].map((e) => e.textContent ?? '');
    expect(stamps.some((s) => s.includes('النطاق: كل الجهات المسجّلة') && s.includes('عدد الصفوف: 9'))).toBe(true);
  });

  /**
   * PHASE-4 FIX — a leaderboard is a claim about SEQUENCE.
   *
   * The table sorted a private copy by compliance while the CSV wrote store order, so the file's
   * first row was not the leaderboard's first row. «What the user sees is what is exported» held
   * for the rows and failed for their order, which is the only thing a leaderboard asserts. One
   * sorted array now feeds both.
   */
  it('exports the compliance table in the ORDER the leaderboard renders', () => {
    const files = captureCsv(() => {
      at('#/admin/reports');
      fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' }));
    });
    const onScreen = [...document.querySelectorAll('.dtable')][0]!
      .querySelectorAll('tbody tr');
    const screenCodes = [...onScreen].map((r) => r.querySelector('td')!.textContent);
    const csvCodes = dataRows(files[0]!.text).map((l) => l.split(',')[0]!.replace(/"/g, ''));
    expect(csvCodes).toEqual(screenCodes);
    expect(csvCodes.length).toBe(4);
  });
});

describe('the «ضمانات تنتهي خلال 60 يوماً» section is REMOVED from Reports (request 17)', () => {
  it('no longer renders the section, its heading or its empty state', () => {
    at('#/admin/reports');
    expect(screen.queryByText('ضمانات تنتهي خلال 60 يوماً')).toBeNull();
    expect(screen.queryByText('لا ضمانات منتهية قريباً')).toBeNull();
  });

  it('leaves the derived bell notice untouched — the client kept that one', () => {
    at('#/admin/reports');
    fireEvent.click(screen.getByRole('button', { name: /الإشعارات/ }));
    // AH-CON-0188 carries a performance bond expiring 2026-07-20
    expect(screen.getAllByText(/ضمان ينتهي في/).length).toBeGreaterThan(0);
  });

  it('keeps the contracts registry KPI, which reads the same rule from a different surface', () => {
    at('#/admin/contracts');
    expect(screen.getByText('ضمانات تنتهي خلال 60 يوماً')).toBeTruthy();
  });
});

/* ================================================================== */
/*  6 — English parity                                                 */
/* ================================================================== */
describe('English mirror — the new surfaces render, with the same Latin digits and links', () => {
  it('renders the schedule screen, the stamp and the vendor report in English', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    at('#/admin/schedule');
    expect(screen.getByRole('heading', { name: 'Time compliance' })).toBeTruthy();
    expect(stamp()).toMatch(/^Scope: .+ · Active filters: No filters · Rows: \d+ · Generated: \d{4}-\d{2}-\d{2}$/);

    follow('#/admin/reports');
    expect(screen.getByRole('heading', { name: /Vendor report/ })).toBeTruthy();
    expect(screen.getByText(/pending the official classification/)).toBeTruthy();
    expect(screen.queryByText('Guarantees expiring within 60 days')).toBeNull();
  }, 20000);

  // A language flip re-renders the whole admin surface; solo these run in ~2.5s, but under the
  // full parallel suite the 5s default has twice produced a load-flake. The generous ceiling is
  // for scheduler contention only — a real hang still fails.
  it('keeps the two ministry-list definitions distinct in English too', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    at('#/admin/entities');
    const explain = document.querySelector('.reg-explain') as HTMLElement;
    expect(explain.textContent).toContain('The five state companies (Article 25)');
    expect(explain.textContent).toContain('Ministry suppliers list');
  }, 20000);

  it('keeps a filter destination language-independent — a translated href would be a second contract', async () => {
    await act(async () => { await i18n.changeLanguage('en'); });
    at('#/admin');
    const tile = screen.getByText('Schedule compliance').closest('a') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('#/admin/schedule');
  }, 20000);
});

/** The seeded store is the argument these tests make — assert it has not silently moved. */
describe('the seed the assertions above rest on', () => {
  it('still holds four requests, four contracts and nine entities', () => {
    const s = seedState();
    expect(s.tenders).toHaveLength(4);
    expect(s.contracts).toHaveLength(4);
    expect(s.vendors).toHaveLength(9);
    expect(s.vendors.filter((v) => v.isStateCompany)).toHaveLength(5);
    expect(s.vendors.filter((v) => v.mooListed)).toHaveLength(7);
  });
});
