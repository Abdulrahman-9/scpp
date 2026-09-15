// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import i18n from '../src/i18n';
import { Sparkline } from '../src/charts/Sparkline';
import { complianceSeries } from '../src/admin/dashboardDerive';
import { allTimeSchedulePct } from '../src/admin/scheduleDerive';
import { fmtMoney } from '../src/operator/derive';
import { seedState, todayIso, type State } from '../src/store';

const KEY = 'masaar-operator-v13';

/**
 * The dashboards wave, end to end (client requests 1, 2, 5, 6, 12, 13).
 *
 * The derivations are pinned in dashboardDerive.test.ts. What only a mounted screen can prove is
 * the promise the whole wave rests on: a statistic is a REAL link, and the registry it opens
 * holds exactly the rows it counted. A tile that lands on an unfiltered — or differently
 * filtered — registry typechecks perfectly and is a lie only a render can catch.
 */

const MDOC = { name: 'د. سارة الجبوري', role: 'MDOC_ADMIN' as const, oid: 'oid-roc-01' };

beforeEach(() => {
  localStorage.clear();
  saveSession(MDOC);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.location.hash = '';
  localStorage.clear();
});

/** Mount the real app at a hash, optionally over a store the test seeded first. */
function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

/** Follow a link the way a click does — including the re-sync every registry now depends on. */
function follow(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new Event('hashchange'));
  });
}

/** The admin shell renders exactly one page body; selecting it by class keeps the helper
 *  language-agnostic, which the English mirror test below depends on. */
const room = () => document.querySelector('.op-page') as HTMLElement;

describe('#/admin — the follow-up room replaces the list with counts that open (requests 1 + 5)', () => {
  it('has dropped the «مراحل متجاوزة للمخطط» panel entirely', () => {
    at('#/admin');
    expect(screen.queryByText('مراحل متجاوزة للمخطط')).toBeNull();
    expect(screen.queryByText('عبر المحفظة كلها · بأيام العمل')).toBeNull();
  });

  it('replaces it with a counted tile that opens the registry of late requests', () => {
    at('#/admin');
    const tile = screen.getByText('مراحل متأخرة').closest('a') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('#/admin/tenders?status=delayed');
    // three of the four seeded requests have run past their current stage's planned close
    expect(within(tile).getByText('3')).toBeTruthy();
  });

  it('makes every ROW-COUNTING tile a real link with a standing «افتح السجل مصفّى» affordance', () => {
    at('#/admin');
    const tiles = [...room().querySelectorAll('.ad-kpi')];
    expect(tiles).toHaveLength(7);
    const links = tiles.filter((el) => el.tagName === 'A');
    // PHASE 4: all seven now carry a destination — six count rows and open the registry holding
    // them, and the seventh (the compliance ratio) opens its decomposition, `#/admin/schedule`.
    // None hides its affordance behind a hover, and every one really carries a destination.
    expect(links).toHaveLength(7);
    expect(links.every((el) => el.getAttribute('href'))).toBe(true);
    const counting = links.filter((el) => el.getAttribute('href') !== '#/admin/schedule');
    expect(counting).toHaveLength(6);
    expect(counting.every((el) => el.querySelector('.ad-kpi__go')?.textContent?.includes('افتح السجل مصفّى'))).toBe(true);
  });

  /**
   * PHASE 4 — the planned CLOSURE of the phase-3 finding.
   *
   * «الالتزام بالجداول» is a ratio over every stage ever closed: there is no registry that can
   * hold «92%», so in phase 3 the tile was deliberately inert and said so. It was never pointed
   * at `#/admin/compliance`, which answers §9 local content and §12.2 nominations — a different
   * subject entirely, and an affordance promising a filtered registry there was a placebo twice
   * over. Client request 10 built the registry that was actually missing, so the tile links again:
   * to `#/admin/schedule`, the DECOMPOSITION of that very percentage, unfiltered by construction.
   * Its affordance therefore reads «افتح الامتثال الزمني» — a tile must never promise a narrowing
   * it does not carry — and it still names the window it measures.
   */
  it('opens the compliance ratio onto its decomposition, naming the window and NOT promising a filter', () => {
    at('#/admin');
    const label = screen.getByText('الالتزام بالجداول');
    const tile = label.closest('a') as HTMLAnchorElement;
    expect(tile).toBeTruthy();
    expect(tile.getAttribute('href')).toBe('#/admin/schedule');
    // the window the percentage measures is still stated — a destination did not replace it
    expect(tile.querySelector('.ad-kpi__win')?.textContent).toBe('منذ البداية');
    // and the affordance does NOT claim a filtered registry, because the destination is unfiltered
    const go = tile.querySelector('.ad-kpi__go')?.textContent ?? '';
    expect(go).toContain('افتح الامتثال الزمني');
    expect(go).not.toContain('افتح السجل مصفّى');
    // no tile anywhere points at the legacy §9 screen — the two subjects stay separate
    expect(room().querySelector('a[href="#/admin/compliance"]')).toBeNull();

    /*
     * PHASE-4 FIX — «decomposition» has to be arithmetic, not a hyperlink.
     *
     * The destination used to compute its own compliance figure over its own population, so the
     * tile linked to a number that did not decompose this one. Both surfaces now call
     * `allTimeSchedulePct`, and this asserts the tile prints THAT — the cross-screen half is
     * pinned in phase4Screens.test.tsx, which compares the two rendered figures directly.
     */
    expect(tile.querySelector('.ad-kpi__v')?.textContent)
      .toBe(`${allTimeSchedulePct(seedState())}%`);
  });

  it('puts the month-by-month strip directly after the tile row, so the trend sits beside the ratio', () => {
    at('#/admin');
    const strip = screen.getByText('الالتزام الزمني شهراً بشهر').closest('.ad-panel') as HTMLElement;
    expect(strip).toBeTruthy();
    expect(strip.previousElementSibling?.classList.contains('ad-kpis')).toBe(true);
  });

  it('points each tile at the registry that holds what it counted', () => {
    at('#/admin');
    const href = (label: string) => (screen.getByText(label).closest('a') as HTMLAnchorElement).getAttribute('href');
    expect(href('مناقصات مفتوحة')).toBe('#/admin/tenders?status=open');
    expect(href('بانتظار المصادقة')).toBe('#/admin/tenders?pending=1');
    expect(href('عقود في مرحلة التنفيذ')).toBe('#/admin/contracts?stage=execute');
    // the ladder tiles count only the UNDECIDED rows of a band, so they carry the gate as well
    expect(href('بانتظار موافقة اللجنة المشتركة JMC')).toBe('#/admin/approvals?tier=JMC&pending=1');
    expect(href('بانتظار موافقة نفط الوسط')).toBe('#/admin/approvals?tier=MDOC&pending=1');
  });

  /**
   * §2-ط — the two ladder tiles are two DIFFERENT authorities, and the row has to say so.
   *
   * Their dots used to carry `--tier-jmc` and `--tier-mdoc`; when the tiles were filled, both were
   * given `brand` and the room stopped distinguishing «ط2» from «ط3» at a glance. They now wear the
   * same two rungs as a fill. This asserts the NAMES on the elements — the measured half (each tone
   * resolves to its rung, the two differ, and both clear AA against the ink in either theme) is
   * gated in visualRefresh.test.tsx.
   */
  it('tells the two ladder tiles apart by tone, as their dots used to (§2-ط)', () => {
    at('#/admin');
    const toneOf = (label: string) =>
      (screen.getByText(label).closest('.ad-fill') as HTMLElement).getAttribute('data-tone');
    expect(toneOf('بانتظار موافقة اللجنة المشتركة JMC')).toBe('jmc');
    expect(toneOf('بانتظار موافقة نفط الوسط')).toBe('mdoc');
    // and no tile in the room carries an inline colour — the tone is a name the sheet resolves
    expect([...room().querySelectorAll('.ad-fill')].every((el) => !el.getAttribute('style')?.includes('color')))
      .toBe(true);
  });
});

/**
 * The governing law of the wave, at the one place it was still broken: a tile opens the registry
 * holding EXACTLY the rows it counted.
 *
 * The follow-up room's «بانتظار موافقة …» tiles count `decision === 'pending'` inside a band, but
 * `?tier=JMC` opens the whole band. While every seeded request is undecided the two numbers agree
 * by luck; ratify one and they part company. That is what these tests ratify and then measure.
 */
describe('the pending-approval tiles open exactly the signatures they counted', () => {
  const RATIFIED_T3: State = (() => {
    const s = seedState();
    const t3 = s.tenders.find((x) => x.id === 't3')!;
    t3.ratification = { status: 'ratified', on: '2026-08-18', by: 'د. سارة الجبوري' };
    return s;
  })();

  const tileCount = (label: string): number => {
    const tile = screen.getByText(label).closest('a') as HTMLAnchorElement;
    return Number(tile.querySelector('.ad-kpi__v')!.textContent);
  };
  const landedRows = (): number => document.querySelectorAll('.op-tbl tbody tr').length;

  it('agrees with the landed registry while the whole band is undecided', () => {
    at('#/admin');
    expect(tileCount('بانتظار موافقة اللجنة المشتركة JMC')).toBe(1);
    follow('#/admin/approvals?tier=JMC&pending=1');
    expect(landedRows()).toBe(1);
  });

  it('drops the tile AND the landed rows by the same one when a request is ratified', () => {
    at('#/admin', RATIFIED_T3);
    // t3 is the only JMC row and it is now decided — nobody is waiting on that signature
    expect(tileCount('بانتظار موافقة اللجنة المشتركة JMC')).toBe(0);
    follow('#/admin/approvals?tier=JMC&pending=1');
    expect(landedRows()).toBe(0);
    expect(screen.getByText('لا مناقصة تطابق الفلاتر الحالية.')).toBeTruthy();
  });

  it('is the `pending=1` gate that does it — the band alone still holds the decided row', () => {
    at('#/admin/approvals?tier=JMC', RATIFIED_T3);
    // WITHOUT the gate the destination lists a row the tile no longer counts: the exact defect
    expect(landedRows()).toBe(1);
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    // scoped to the TABLE since د12: «مُصادَق» is now also a decision chip in the toolbar (س‌ل2),
    // and the assertion is about the ROW's decision pill, not about the count of that word on screen
    expect(within(document.querySelector('.op-tbl tbody') as HTMLElement).getByText('مُصادَق')).toBeTruthy();
  });

  it('says why the registry is short, and widens it in one click', () => {
    at('#/admin/approvals?tier=JMC&pending=1', RATIFIED_T3);
    const chip = screen.getByText('بانتظار القرار فقط');
    fireEvent.click(within(chip.closest('.reg-chip') as HTMLElement).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    // dismissing rewrites the hash, so the address never describes a screen other than the one on it
    expect(window.location.hash).toBe('#/admin/approvals?tier=JMC');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
  });
});

describe('the per-company bars (request 1)', () => {
  it('draws all twelve companies, each row a real link to its own tenders', () => {
    at('#/admin');
    const bars = [...room().querySelectorAll('a.ch-bar')] as HTMLAnchorElement[];
    expect(bars).toHaveLength(12);
    expect(bars.every((a) => a.getAttribute('href')?.startsWith('#/admin/tenders?op='))).toBe(true);
  });

  it('carries the numbers in the link label — the track itself is hidden from assistive tech', () => {
    at('#/admin');
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-alwaha"]') as HTMLAnchorElement;
    expect(bar.getAttribute('aria-label')).toContain('شركة نفط الواحة الصينية');
    expect(bar.getAttribute('aria-label')).toContain('$4.2M');
    expect(bar.querySelector('.ch-bar__track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps a company with no tenders visible, with an empty track and «—» for its value', () => {
    at('#/admin');
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-kar"]') as HTMLAnchorElement;
    expect(bar).toBeTruthy();
    expect(bar.querySelectorAll('.ch-bar__seg')).toHaveLength(0);
    expect(within(bar).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('lands the row link on the tenders registry narrowed to that company, with a removable chip', () => {
    at('#/admin');
    follow('#/admin/tenders?op=op-alwaha');
    expect(screen.getByText('AH-DRL-0212')).toBeTruthy();
    expect(screen.queryByText('BD-MNT-0098')).toBeNull();

    // PHASE 4: the narrowing is printed TWICE on purpose — once as the dismissable chip, once in
    // the export stamp that the CSV and the printed page will carry. Select the chip explicitly.
    const chip = document.querySelector('.reg-chip') as HTMLElement;
    expect(chip.textContent).toContain('الشركة: شركة نفط الواحة الصينية');
    fireEvent.click(within(chip).getByRole('button'));
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    // dismissing widens the registry AND rewrites the address, so the two never drift apart
    expect(window.location.hash).toBe('#/admin/tenders');
    expect(screen.getByText('BD-MNT-0098')).toBeTruthy();
  });
});

describe('the tier donut (request 5)', () => {
  it('prints the portfolio total in the ring and every band in the legend', () => {
    at('#/admin');
    const donut = room().querySelector('.ch--donut') as HTMLElement;
    expect(donut.querySelector('.ch-donut__n')?.textContent).toBe('4');
    // the SVG is a drawing: hidden from assistive tech, and never focusable
    const svg = donut.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('[tabindex]')).toBeNull();
    expect(svg.querySelectorAll('.ch-donut__seg')).toHaveLength(3);
  });

  it('gives ط2 and ط3 a real link, and leaves ط1 inert — it opens no approval gate', () => {
    at('#/admin');
    const legend = room().querySelector('.ch--donut .ch-legend') as HTMLElement;
    expect((within(legend).getByText('ط2 · JMC').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('#/admin/approvals?tier=JMC');
    expect((within(legend).getByText('ط3 · MDOC').closest('a') as HTMLAnchorElement).getAttribute('href')).toBe('#/admin/approvals?tier=MDOC');
    expect(within(legend).getByText('ط1 · المشغّل').closest('a')).toBeNull();
  });

  it('lands a segment link on the approval chain filtered to that band', () => {
    at('#/admin');
    follow('#/admin/approvals?tier=MDOC');
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
    expect(screen.queryByText('MN-EPC-0305')).toBeNull();
  });

  it('re-syncs the chain when only the band changes — no remount, no stale table', () => {
    at('#/admin/approvals?tier=MDOC');
    expect(screen.queryByText('MN-EPC-0305')).toBeNull();
    follow('#/admin/approvals?tier=JMC');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();
  });
});

describe('the company detail (request 2)', () => {
  it('folds a per-company table of fields, project types, late requests and contracts', () => {
    at('#/admin');
    const disc = room().querySelector('details.ad-disc') as HTMLDetailsElement;
    expect(disc).toBeTruthy();
    expect(within(disc).getByText('تفصيل الشركات المشغّلة')).toBeTruthy();
    for (const head of ['الحقول', 'حفر', 'هندسة/إنشاء', 'مواد ثقيلة', 'أخرى', 'متأخرة', 'العقود'])
      expect(within(disc).getAllByText(head).length).toBeGreaterThan(0);
    expect(disc.querySelectorAll('tbody tr')).toHaveLength(12);
  });

  it('links each company name to the operators registry narrowed to it', () => {
    at('#/admin');
    const disc = room().querySelector('details.ad-disc') as HTMLElement;
    const link = within(disc).getByText('جيو-جاد الصينية').closest('a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/admin/operators?op=op-geojade');

    follow('#/admin/operators?op=op-geojade');
    // PHASE-4 FIX: it now appears TWICE — the standing chip that widens the registry, and the
    // export stamp that will travel into the CSV. This registry used to export with no stamp at
    // all, so a one-company file was byte-identical to the whole directory.
    expect(screen.getAllByText(/الشركة: جيو-جاد الصينية/).length).toBe(2);
    expect((document.querySelector('.reg-stamp') as HTMLElement).textContent)
      .toContain('الشركة: جيو-جاد الصينية');
    expect(screen.queryByText('شركة نفط الواحة الصينية')).toBeNull();
  });

  it('says out loud why a contract may belong to no company, instead of leaving zeros unexplained', () => {
    at('#/admin');
    expect(screen.getByText(/العقد الذي لا يحمل مناقصة أصل لا يُنسب إلى أحد/)).toBeTruthy();
  });
});

describe('the contracts registry (request 12c)', () => {
  it('puts the completion distribution above the table, each column a real link', () => {
    at('#/admin/contracts');
    const cols = [...document.querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    expect(cols.map((a) => a.getAttribute('href'))).toEqual([
      '#/admin/contracts?prog=0-25', '#/admin/contracts?prog=25-50',
      '#/admin/contracts?prog=50-75', '#/admin/contracts?prog=75-100',
    ]);
  });

  it('filters the table in place when a column is followed — the same screen, re-synced', () => {
    at('#/admin/contracts');
    expect(screen.getByText('EB-CON-0176')).toBeTruthy();
    follow('#/admin/contracts?prog=25-50');
    // 3/7, 2/7 and 3/7 sit in this bucket; c4 at 5/7 does not
    expect(screen.getByText('AH-CON-0188')).toBeTruthy();
    expect(screen.queryByText('EB-CON-0176')).toBeNull();
    // the chip prints the range the bucket actually HOLDS — the key '25-50' is a half-open
    // machine name, and «25–50%» beside a «0–25%» column claims 25% for both. PHASE 4: it appears
    // twice, in the chip and in the export stamp, which is exactly the WYSIWYG promise.
    expect(screen.getAllByText(/نسبة الإنجاز: 25–49%/).length).toBe(2);
    expect((document.querySelector('.reg-stamp') as HTMLElement).textContent)
      .toContain('نسبة الإنجاز: 25–49%');
  });

  it('honours the `?stage=` deep link the «عقود في مرحلة التنفيذ» tile carries', () => {
    at('#/admin/contracts?stage=execute');
    expect(screen.getByText('AH-CON-0188')).toBeTruthy();
    expect(screen.getByText('MN-CON-0205')).toBeTruthy();
    expect(screen.queryByText('FM-CON-0191')).toBeNull();
  });
});

describe('#/admin/fields — the mount-only ?op= defect is gone', () => {
  it('re-filters when the address changes on the screen already open', () => {
    at('#/admin/fields?op=op-alwaha');
    expect(screen.getByText('AHDAB')).toBeTruthy();
    expect(screen.queryByText('BADRA')).toBeNull();
    follow('#/admin/fields?op=op-badra');
    expect(screen.getByText('BADRA')).toBeTruthy();
    expect(screen.queryByText('AHDAB')).toBeNull();
  });

  it('writes the reader\'s own choice back into the address, so the URL stays shareable', () => {
    at('#/admin/fields?op=op-alwaha');
    fireEvent.change(screen.getByLabelText('كل المشغّلين'), { target: { value: 'op-badra' } });
    expect(window.location.hash).toBe('#/admin/fields?op=op-badra');
  });
});

describe('#/admin/tenders — the counted queues open exactly what they counted', () => {
  it('`?status=open` lists every unfinished request, not just the calm ones', () => {
    at('#/admin/tenders?status=open');
    for (const code of ['AH-DRL-0212', 'BD-MNT-0098', 'MN-EPC-0305', 'B7-FAC-0331'])
      expect(screen.getByText(code)).toBeTruthy();
    // the chip AND the export stamp both name it (phase 4) — the file will say what the screen says
    expect(screen.getAllByText(/مفتوحة \(لم تُنجَز بعد\)/).length).toBe(2);
  });

  it('`?pending=1` lists only the request awaiting ratification', () => {
    at('#/admin/tenders?pending=1');
    expect(screen.getByText('MN-EPC-0305')).toBeTruthy();
    expect(screen.queryByText('AH-DRL-0212')).toBeNull();
  });

  it('`?status=delayed` lists exactly the request the room counted as late', () => {
    at('#/admin/tenders?status=delayed');
    expect(screen.getByText('BD-MNT-0098')).toBeTruthy();
    // B7-FAC-0331 sits at an approval stage still inside its plan — it is late nowhere
    expect(screen.queryByText('B7-FAC-0331')).toBeNull();
  });

  it('ignores a junk filter and shows the whole registry rather than an empty one', () => {
    at('#/admin/tenders?op=op-nope&status=exploded');
    expect(screen.getByText('AH-DRL-0212')).toBeTruthy();
    expect(screen.getByText('B7-FAC-0331')).toBeTruthy();
  });
});

/* ================================================================== */
/*  د10 / ق2 — the counting tile IS the filter                        */
/* ================================================================== */

/** The four filled KPI tiles of `#/admin/tenders`, in the order the screen prints them. */
const tiles = () => [...document.querySelectorAll('.ad-kpi--fill')] as HTMLButtonElement[];
const figureOn = (tile: HTMLElement) => tile.querySelector('.ad-kpi__v')!.textContent;
/** The tender codes the table is currently listing. */
const listed = () => [...document.querySelectorAll('.op-tbl__code')].map((e) => e.textContent);

describe('#/admin/tenders — a counting tile opens EXACTLY what it counted (ق2 · law P3)', () => {
  it('renders the four as filled BUTTONS carrying a semantic tone, not decorative cards', () => {
    at('#/admin/tenders');
    const row = tiles();
    expect(row).toHaveLength(4);
    expect(row.every((el) => el.tagName === 'BUTTON')).toBe(true);
    expect(row.map((el) => el.getAttribute('data-tone'))).toEqual(['brand', 'risk', 'delayed', 'done']);
    // every tone is a NAME the stylesheet resolves — no tile carries an inline colour
    expect(row.every((el) => !el.getAttribute('style')?.includes('color'))).toBe(true);
  });

  it('lands the rows it printed — the figure and the resulting table are one arithmetic', () => {
    at('#/admin/tenders');
    const late = tiles()[2]!;
    const counted = Number(figureOn(late));
    fireEvent.click(late);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toBe('#/admin/tenders?status=delayed');
    expect(listed()).toHaveLength(counted);
    expect(listed()).toContain('BD-MNT-0098');
  });

  it('keeps counting off the OTHER narrowings, so the tile never promises rows a filter removed', () => {
    at('#/admin/tenders?op=op-alwaha');
    const total = Number(figureOn(tiles()[0]!));
    expect(total).toBe(listed().length);
    expect(total).toBeLessThan(seedState().tenders.length);
  });

  it('does NOT count itself — the figure is stable while its own narrowing is on', () => {
    // the defect this law exists to kill: a tile counting the already-narrowed set prints one
    // number before the click and a different one after, so it never landed what it showed
    at('#/admin/tenders');
    const before = figureOn(tiles()[2]!);
    follow('#/admin/tenders?status=delayed');
    expect(figureOn(tiles()[2]!)).toBe(before);
  });

  it('is a toggle: pressing the active tile widens back, in ONE address rewrite', () => {
    at('#/admin/tenders?status=delayed');
    const late = tiles()[2]!;
    expect(late.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(late);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toBe('#/admin/tenders');
  });

  it('drops the OTHER tile\'s narrowing rather than compounding it', () => {
    // «متأخرة» pressed while `?pending=1` stands must land the delayed rows it counted — not the
    // intersection, which is a smaller set than the figure on its face
    at('#/admin/tenders?pending=1');
    fireEvent.click(tiles()[2]!);
    act(() => { window.dispatchEvent(new Event('hashchange')); });
    expect(window.location.hash).toBe('#/admin/tenders?status=delayed');
  });
});

describe('#/admin/tenders — the board is a second rendering, never a second source (ق1)', () => {
  const board = () => document.querySelector('.kb');
  const openBoard = () => {
    fireEvent.click(screen.getByRole('button', { name: 'كانبان' }));
  };

  it('starts on the table and switches on a pressed control, without touching the address', () => {
    at('#/admin/tenders');
    expect(board()).toBeNull();
    openBoard();
    expect(board()).toBeTruthy();
    expect(screen.getByRole('button', { name: 'كانبان' }).getAttribute('aria-pressed')).toBe('true');
    // a rendering choice is not a filter, so it never reaches the shareable address or the stamp
    expect(window.location.hash).toBe('#/admin/tenders');
  });

  it('shows five columns — our four derived statuses plus the lifecycle one', () => {
    at('#/admin/tenders');
    openBoard();
    expect([...board()!.querySelectorAll('.kb__head')].map((h) => h.textContent?.replace(/\d+$/, '')))
      .toEqual(['قيد التنفيذ', 'تحذير', 'متأخرة', 'مكتملة', 'ملغاة']);
  });

  it('makes every card a REAL link to the file — never a clickable div', () => {
    at('#/admin/tenders');
    openBoard();
    const cards = [...board()!.querySelectorAll('.kb__card')];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((c) => c.tagName === 'A' && /^#\/admin\/review\//.test(c.getAttribute('href') ?? '')))
      .toBe(true);
  });

  it('derives from the SAME filtered rows the table would list', () => {
    at('#/admin/tenders?status=delayed');
    const fromTable = listed();
    openBoard();
    const onBoard = [...board()!.querySelectorAll('.kb__code')].map((e) => e.textContent);
    expect(onBoard).toEqual(fromTable);
  });
});

describe('#/admin/tenders — the tier column reads the ladder, never a printed threshold (ق3)', () => {
  /** The three labels of the closed tier vocabulary — the ONLY things this column may say. */
  const PILLS = ['ط1 · المشغّل', 'ط2 · JMC', 'ط3 · MDOC'];
  const pills = () => [...document.querySelectorAll('.op-tbl__row .ad-tier')] as HTMLElement[];

  it('names the approving body on every row, derived from the value', () => {
    at('#/admin/tenders');
    expect(pills()).toHaveLength(listed().length);
    expect(pills().every((p) => PILLS.includes(p.textContent ?? ''))).toBe(true);
    // MN-EPC-0305 (7.8M) sits in the joint-committee band on the seeded ladder
    const row = screen.getByText('MN-EPC-0305').closest('tr')!;
    expect(within(row).getByText('ط2 · JMC')).toBeTruthy();
    // …and 4.2M stays inside the operator's own authority
    expect(within(screen.getByText('AH-DRL-0212').closest('tr')!).getByText('ط1 · المشغّل')).toBeTruthy();
  });

  it('prints no ceiling of its own — the figures reach the cell only through `tierBand`', () => {
    at('#/admin/tenders');
    // a literal «$5,000,000» typed into this column would survive a ladder change (د9) and start
    // lying on the day the ceilings move. Nothing money-shaped may appear in the cell text…
    expect(pills().every((p) => !/[$]|,\d{3}/.test(p.textContent ?? ''))).toBe(true);
    // …while the tooltip DOES carry the band, built from the LIVE ladder in the store
    const jmc = pills().find((p) => p.textContent === 'ط2 · JMC')!;
    expect(jmc.getAttribute('title')).toContain(fmtMoney(seedState().approvalTiers.jmcMaxUSD));
  });
});

describe('the contract file states how completion is controlled (request 12)', () => {
  it('prints the formula under the progress bar, with the live denominator', () => {
    at('#/admin/contracts/c1');
    expect(screen.getByText(/النسبة = المراحل المغلقة من أصل الكل: 3 من 7 = 43%/)).toBeTruthy();
  });

  it('previews the before → after percentage inside the advance-stage confirmation', () => {
    at('#/admin/contracts/c1');
    fireEvent.click(screen.getByRole('button', { name: /إنجاز المرحلة/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('43%')).toBeTruthy();
    expect(within(dialog).getByText('57%')).toBeTruthy();
    expect(within(dialog).getByText('ستصير 4 من 7 مرحلة')).toBeTruthy();
  });
});

describe('the public home page carries the awarded portfolio (requests 6 + 13)', () => {
  it('states count, value and the completed / in-execution split', () => {
    at('#/');
    const card = screen.getByText('العقود المحالة').closest('section') as HTMLElement;
    expect(within(card).getByText('$31.9M')).toBeTruthy();
    expect(within(card).getByText('عدد العقود').nextElementSibling?.textContent).toBe('4');
    expect(within(card).getByText('منجزة (كل المراحل مغلقة)').nextElementSibling?.textContent).toBe('0');
    expect(within(card).getByText('قيد التنفيذ').nextElementSibling?.textContent).toBe('4');
  });

  it('splits the requests in flight across the ladder, and offers no link a visitor cannot use', () => {
    at('#/');
    const fig = screen.getByText('المناقصات الجارية حسب طبقة الموافقة').closest('figure') as HTMLElement;
    expect(within(fig).getByText('ط1 · المشغّل').closest('a')).toBeNull();
    expect(fig.querySelectorAll('.ch-bar__seg')).toHaveLength(3);
  });
});

describe('the schedule-compliance strip refuses to invent a trend (request 5)', () => {
  it('draws a point per measured month, or nothing at all when the store cannot support a series', () => {
    const series = complianceSeries(seedState(), todayIso());
    at('#/admin');
    const strip = screen.queryByText('الالتزام الزمني شهراً بشهر');
    if (series.length < 2) {
      // one derivable point is not a time series — the strip must be absent, not flat
      expect(strip).toBeNull();
      return;
    }
    expect(strip).toBeTruthy();
    const svg = room().querySelector('svg.ch-spark')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(series.length);
    // the number is printed beside the line: the drawing decorates a figure, it never carries it
    expect(room().querySelector('.ch-spark__v')!.textContent).toBe(`${series[series.length - 1]!.pct}%`);
  });

  it('renders nothing from a single point', () => {
    const { container } = render(<Sparkline points={[{ month: '2026-06', pct: 87, closed: 4 }]} lang="ar" />);
    expect(container.innerHTML).toBe('');
  });

  /**
   * x is TIME, not array position. `complianceSeries` skips a month that closed no stage, so an
   * index axis draws March→June with the same step as March→April — a slope the data never had.
   */
  it('spaces the points by month, so a skipped month leaves a gap instead of collapsing', () => {
    const pts = (months: string[]) => months.map((month, i) => ({ month, pct: [40, 70, 90][i]!, closed: 2 }));
    const xs = (el: HTMLElement) => el.querySelector('polyline')!.getAttribute('points')!
      .trim().split(/\s+/).map((p) => Number(p.split(',')[0]));

    // identical percentages, identical point count — only the calendar differs
    const dense = render(<Sparkline points={pts(['2026-04', '2026-05', '2026-06'])} lang="ar" />);
    const sparse = render(<Sparkline points={pts(['2026-01', '2026-05', '2026-06'])} lang="ar" />);
    const a = xs(dense.container);
    const b = xs(sparse.container);

    expect(a).not.toEqual(b);
    expect(a).toEqual([0, 60, 120]);          // three consecutive months — even thirds
    expect(b).toEqual([0, 96, 120]);          // Jan→May is four months of the five-month span
    // both still start and end at the box edges: the covered range is what the strip draws
    expect([a[0], a[2]]).toEqual([b[0], b[2]]);
  });

  it('prints the last point’s MONTH beside its percentage, at caption size', () => {
    const { container } = render(<Sparkline points={[{ month: '2026-05', pct: 62, closed: 3 }, { month: '2026-06', pct: 87, closed: 4 }]} lang="ar" />);
    expect(container.querySelector('.ch-spark__v')!.textContent).toBe('87%');
    // the number alone would read as «compliance», which is the all-time tile's claim, not this one's
    expect(container.querySelector('.ch-spark__vm')!.textContent).toBe('2026-06');
  });
});

describe('the completion histogram labels its boundaries honestly (§3-د)', () => {
  it('prints the last percentage each half-open bucket actually holds', () => {
    at('#/admin/contracts');
    const cols = [...document.querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    // '0-25%' beside '25-50%' claims 25% twice and leaves the reader to guess which column owns it
    expect(cols.map((c) => c.querySelector('.ch-hist__l')!.textContent))
      .toEqual(['0–24%', '25–49%', '50–74%', '75–100%']);
    // the aria sentence reads the same two numbers as the printed label
    expect(cols[0]!.getAttribute('aria-label')).toContain('من 0 إلى 24');
    expect(cols[3]!.getAttribute('aria-label')).toContain('من 75 إلى 100');
  });
});

describe('the room’s completion histogram opens the contracts registry', () => {
  it('carries the same four bucket links the registry filters by', () => {
    at('#/admin');
    const cols = [...room().querySelectorAll('a.ch-hist__col')] as HTMLAnchorElement[];
    expect(cols).toHaveLength(4);
    expect(cols[1]!.getAttribute('href')).toBe('#/admin/contracts?prog=25-50');
    // 3/7, 2/7 and 3/7 of the seeded contracts land in that bucket
    expect(within(cols[1]!).getByText('3')).toBeTruthy();
    follow('#/admin/contracts?prog=25-50');
    expect(screen.queryByText('EB-CON-0176')).toBeNull();
  });
});

describe('English mirror — parity is a rendering fact, not a file diff', () => {
  afterEach(async () => { await act(async () => { await i18n.changeLanguage('ar'); }); });

  /**
   * `nameEn` is optional on `OperatorOrg`. A company registered without one must read to an
   * English reader as its Arabic name — never as «op-alwaha». An id in a sentence is a leaked
   * primary key: it names nothing the reader can act on, and reads as a defect.
   */
  it('falls back to the Arabic company name, never the record id, in a filter chip', async () => {
    const noEn = seedState();
    const alwaha = noEn.operators.find((o) => o.id === 'op-alwaha')!;
    const arName = alwaha.name;
    delete alwaha.nameEn;

    at('#/admin/operators?op=op-alwaha', noEn);
    await act(async () => { await i18n.changeLanguage('en'); });
    const chip = document.querySelector('.reg-chip') as HTMLElement;
    expect(chip.textContent).toContain(arName);
    expect(chip.textContent).not.toContain('op-alwaha');
  });

  it('renders every new surface in English, with the same Latin digits and the same links', async () => {
    at('#/admin');
    await act(async () => { await i18n.changeLanguage('en'); });
    expect(screen.getByText('Tenders per operating company')).toBeTruthy();
    expect(screen.getByText('Tenders by approval tier')).toBeTruthy();
    expect(screen.getByText('Contracts by completion')).toBeTruthy();
    expect(screen.getByText('Operating companies in detail')).toBeTruthy();
    // the destinations are language-independent — a translated href would be a second contract
    const tile = screen.getByText('Late stages').closest('a') as HTMLAnchorElement;
    expect(tile.getAttribute('href')).toBe('#/admin/tenders?status=delayed');
    expect(within(tile).getByText('3')).toBeTruthy();
    // the company bar reads its English name and keeps the machine value an LTR island
    const bar = room().querySelector('a.ch-bar[href="#/admin/tenders?op=op-alwaha"]') as HTMLAnchorElement;
    expect(bar.getAttribute('aria-label')).toContain('AlWaha');
    expect(bar.getAttribute('aria-label')).toContain('$4.2M');
  });
});
