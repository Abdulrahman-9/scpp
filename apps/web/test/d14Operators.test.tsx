// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { saveSession } from '../src/session';
import { seedState, type State } from '../src/store';

/**
 * د14 — «المشغّلون» (ج1–ج6). The plan's judgment on this screen was that the gap was SPATIAL and
 * not informational: every figure the reference wanted per company was already derived, honestly,
 * in `companyStats` — it simply had no cell on this registry. So the guards here are not «is the
 * number right»; they are the three properties that only hold if the batch reused what existed:
 *
 *   · ج2/ج3 — THE PARITY LAW. Every figure in a registry row equals its counterpart in the
 *     follow-up room, figure by figure, because both read one derivation. This is asserted
 *     SCREEN AGAINST SCREEN, never against a recomputation in the test: a test that derived the
 *     expected value itself would be a third definition and would pass while the two screens
 *     disagreed with each other.
 *   · ج6 — no enabled account, NO CONTACT CELL. The one honest answer to «who do I call» when the
 *     registry holds nobody is silence; a name lifted off an audit line is the fabrication this
 *     product exists to refuse (س18).
 *   · ج1 — the row's tenders link lands the registry narrowed to THAT company, and the set it
 *     lands is the set the row printed.
 */

const KEY = 'masaar-operator-v13';
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

function at(hash: string, state?: State) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  window.location.hash = hash;
  return render(<App />);
}

const rows = () => [...document.querySelectorAll('.op-tbl tbody tr')] as HTMLTableRowElement[];
const text = (el: Element | null | undefined) => (el?.textContent ?? '').trim();

/** The registry's column order, named once — an index typed twice is a bug waiting for a column.
 *  د9 inserted `ladder` after the authority column: which approval ladder governs this company. */
const COL = {
  company: 0, fa: 1, ladder: 2, contact: 3, accounts: 4,
  tenders: 5, active: 6, late: 7, aboveFa: 8, contracts: 9, value: 10, actions: 11,
} as const;

/** Show all twelve companies rather than the first page of ten. */
function showAll() {
  const size = screen.getByLabelText('عدد الصفوف في الصفحة') as HTMLSelectElement;
  fireEvent.change(size, { target: { value: '25' } });
}

interface Figures { tenders: string; active: string; late: string; contracts: string; value: string }

/**
 * «—» and «0» are the same FIGURE said two ways. د17 settled the disagreement the two TABLES used
 * to have — the room's company table printed a bare `0` in fields, tenders and contracts, this
 * registry spelled nothing as «—» everywhere — so both now spell it «—», pinned below on each
 * screen. The normalizer survives for the one figure that does not reach this test through a
 * table cell at all: the room's ACTIVE share is read out of a translated aria sentence, where a
 * count is a numeral by construction. The parity law is about the arithmetic either way.
 */
const asFigure = (s: string) => (s === '—' ? '0' : s);
const figures = (f: Figures): Figures => ({
  tenders: asFigure(f.tenders), active: asFigure(f.active), late: asFigure(f.late),
  contracts: asFigure(f.contracts), value: asFigure(f.value),
});

/** What the OPERATORS REGISTRY prints for each company, keyed by the company id in its first cell. */
function registryFigures(): Map<string, Figures> {
  const out = new Map<string, Figures>();
  for (const r of rows()) {
    const id = text(r.cells[COL.company]!.querySelector('.op-tbl__code'));
    out.set(id, {
      tenders: text(r.cells[COL.tenders]),
      active: text(r.cells[COL.active]),
      late: text(r.cells[COL.late]),
      contracts: text(r.cells[COL.contracts]),
      value: text(r.cells[COL.value]),
    });
  }
  return out;
}

/**
 * What the FOLLOW-UP ROOM prints for each company: the disclosure table carries tenders, late and
 * contracts; the company bars carry the estimated value and — in the row's translated aria label,
 * which is where those numbers reach a screen reader — the active share of the lifecycle split.
 */
function roomFigures(): Map<string, Figures> {
  const out = new Map<string, Figures>();
  const disc = document.querySelector('details.ad-disc') as HTMLElement;
  for (const r of [...disc.querySelectorAll('tbody tr')] as HTMLTableRowElement[]) {
    const href = (r.cells[0]!.querySelector('a') as HTMLAnchorElement).getAttribute('href')!;
    const id = decodeURIComponent(href.split('op=')[1]!);
    const bar = document.querySelector(`a.ch-bar[href="#/admin/tenders?op=${encodeURIComponent(id)}"]`)!;
    // «… نشطة 12، منجزة …» → the count, from the sentence the bar publishes to assistive tech
    const active = /نشطة\s*(\d+)/.exec(bar.getAttribute('aria-label') ?? '')![1]!;
    out.set(id, {
      tenders: text(r.cells[6]),
      active,
      late: text(r.cells[7]),
      contracts: text(r.cells[8]),
      value: text(bar.querySelector('.ch-bar__v')),
    });
  }
  return out;
}

describe('د14 ج2/ج3 — قانون التطابق: كل رقم في الصف يطابق نظيره في غرفة المتابعة رقماً برقم', () => {
  it('prints the same tenders / active / late / contracts / value the room prints, for every company', () => {
    at('#/admin');
    const room = roomFigures();
    expect(room.size).toBe(12);

    document.body.innerHTML = '';
    at('#/admin/operators');
    showAll();
    const registry = registryFigures();
    expect(registry.size).toBe(12);

    for (const [id, expected] of room) {
      const got = registry.get(id);
      expect(got, `company ${id} is missing from the registry`).toBeTruthy();
      expect({ id, ...figures(got!) }).toEqual({ id, ...figures(expected) });
    }
  });

  it('spells «nothing» as «—» in every numeric column, never as a bare zero', () => {
    at('#/admin/operators');
    showAll();
    for (const r of rows()) {
      for (const c of [COL.tenders, COL.active, COL.late, COL.contracts, COL.value]) {
        expect(text(r.cells[c])).not.toBe('0');
      }
    }
    // and the spelling is REACHED: the seed holds companies with no contract and none late
    expect(rows().some((r) => text(r.cells[COL.contracts]) === '—')).toBe(true);
    expect(rows().some((r) => text(r.cells[COL.late]) === '—')).toBe(true);
  });

  /** د17 — the same law on the OTHER screen. The room's company table carries the same figures for
   *  the same twelve companies, so a zero that is a dash here and a bare `0` there is one screen
   *  contradicting the other about what nothing looks like. Every numeric cell of that table —
   *  fields, the four scopes, tenders, late, contracts, value — is covered, so a column added to
   *  it later cannot reintroduce the bare zero unnoticed. */
  it('spells «nothing» the same way in the room’s company table — never a bare zero there either', () => {
    at('#/admin');
    const disc = document.querySelector('details.ad-disc') as HTMLElement;
    const roomRows = [...disc.querySelectorAll('tbody tr')] as HTMLTableRowElement[];
    expect(roomRows).toHaveLength(12);
    for (const r of roomRows) {
      // cell 0 is the company link; every cell after it is a figure
      for (const c of [...r.cells].slice(1)) expect(text(c)).not.toBe('0');
    }
    // and it is REACHED in the very column د14 found bare: contracts (cell 8)
    expect(roomRows.some((r) => text(r.cells[8]) === '—')).toBe(true);
  });

  it('is a REUSE and not a second count: perturbing the store moves both screens together', () => {
    // cancelling a live request moves it out of `parts.active` — if the registry had kept its own
    // arithmetic, this is exactly the edit at which the two screens would start disagreeing
    const s = seedState();
    const t1 = s.tenders.find((x) => x.id === 't1')!;
    t1.lifecycle = { kind: 'cancelled', on: '2025-06-01', reason: 'اختبار حراسة: إلغاء يُخرج الطلب من النشط' };

    at('#/admin', s);
    const room = roomFigures();
    document.body.innerHTML = '';
    at('#/admin/operators', s);
    showAll();
    const registry = registryFigures();

    for (const [id, expected] of room) {
      expect({ id, ...figures(registry.get(id)!) }).toEqual({ id, ...figures(expected) });
    }
    // the edit actually bit: op-alwaha's t1 left the active bucket on BOTH screens
    expect(figures(room.get('op-alwaha')!).active).toBe(figures(registry.get('op-alwaha')!).active);
    expect(Number(figures(registry.get('op-alwaha')!).active))
      .toBeLessThan(Number(figures(registry.get('op-alwaha')!).tenders));
  });

  it('names the value column for what it is — an ESTIMATE on tenders, never a contract value (ج3)', () => {
    at('#/admin/operators');
    const heads = [...document.querySelectorAll('.op-tbl thead th')].map((h) => text(h));
    expect(heads[COL.value]).toBe('قيمة تقديرية للمناقصات');
    // «قيمة العقود» is a different figure and lives in the room; this screen must not claim it
    expect(heads.join(' ')).not.toContain('قيمة العقود');
  });
});

describe('د14 ج6 — بلا مستخدم مفعّل، بلا خلية اتصال', () => {
  const contactOf = () => rows()[0]!.cells[COL.contact]!;

  it('prints the first ENABLED account of the company, with its role', () => {
    at('#/admin/operators?op=op-alwaha');
    const cell = contactOf();
    expect(text(cell.querySelector('.op-tbl__name'))).toBe('م. أحمد عبد الرحمن');
    expect(text(cell.querySelector('.op-tbl__code'))).toBe('مدير حساب المشغّل');
    // u10 «علي الساعدي» is scoped to the same company but DISABLED — a withdrawn account is not
    // a contact, and the registry may not offer a person whose access it has revoked
    expect(cell.textContent).not.toContain('علي الساعدي');
  });

  it('leaves the cell EMPTY — not a placeholder person — for a company with no enabled account', () => {
    at('#/admin/operators?op=op-kar');
    const cell = contactOf();
    expect(text(cell)).toBe('—');
    expect(cell.querySelector('.op-tbl__name')).toBeNull();
  });

  it('drops the contact the moment the last enabled account is disabled', () => {
    const s = seedState();
    s.users.find((u) => u.id === 'u8')!.disabled = true;

    at('#/admin/operators?op=op-alwaha', s);
    // op-alwaha still HAS accounts (the cell beside it says so) — but none of them is live, and
    // «two accounts, nobody to call» is the honest reading rather than a contradiction
    expect(text(contactOf())).toBe('—');
    expect(text(rows()[0]!.cells[COL.accounts])).toContain('من');
  });

  it('carries the same rule into the CSV: an empty field, never a guessed name', () => {
    at('#/admin/operators');
    const csv = captureCsv(() => fireEvent.click(screen.getByRole('button', { name: 'تصدير CSV' })));
    // line 0 is the filter stamp; every cell is quoted by `buildCsv`
    const cells = (line: string) => line.split(',').map((c) => c.replace(/^"|"$/g, ''));
    const [, header, ...body] = csv[0]!.split('\n');
    const iName = cells(header!).indexOf('contact');
    expect(iName).toBeGreaterThan(-1);
    expect(cells(body.find((l) => l.includes('op-kar'))!)[iName]).toBe('');
    expect(cells(body.find((l) => l.includes('op-alwaha'))!)[iName]).toContain('أحمد عبد الرحمن');
  });
});

describe('د14 ج1/ج5/ج4 — الرابط والبحث والبلاطات', () => {
  it('opens the tenders registry narrowed to the SAME company, on exactly the rows the row printed', () => {
    at('#/admin/operators?op=op-alwaha');
    const link = within(rows()[0]!.cells[COL.actions]!)
      .getAllByRole('link').find((a) => a.getAttribute('href')!.includes('/admin/tenders')) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('#/admin/tenders?op=op-alwaha');
    const claimed = text(rows()[0]!.cells[COL.tenders]);

    document.body.innerHTML = '';
    at('#/admin/tenders?op=op-alwaha');
    const stamp = text(document.querySelector('.reg-stamp'));
    expect(stamp).toContain('الشركة: شركة نفط الواحة الصينية');
    // the destination's own row count, against the count the operator row advertised
    expect(/عدد الصفوف: (\d+)/.exec(stamp)![1]).toBe(claimed);
  });

  it('finds a company by the name of a FIELD it holds, not only by its own name (ج5)', () => {
    at('#/admin/operators');
    const box = screen.getByPlaceholderText(/ابحث باسم الشركة/) as HTMLInputElement;
    // «رقعة الخليصية» belongs to op-kar and shares no word with the company's registered name
    fireEvent.change(box, { target: { value: 'الخليصية' } });
    expect(rows()).toHaveLength(1);
    expect(text(rows()[0]!.cells[COL.company]!.querySelector('.op-tbl__code'))).toBe('op-kar');
  });

  it('gives the strip the filled surface and NO false button — none of the seven has a filter behind it', () => {
    at('#/admin/operators');
    const tiles = [...document.querySelectorAll('.ad-kpi')] as HTMLElement[];
    // seven since د9: «بسلّم خاص» counts the companies standing outside the system default
    expect(tiles).toHaveLength(7);
    for (const el of tiles) {
      expect(el.classList.contains('ad-kpi--fill')).toBe(true);
      expect(el.getAttribute('data-tone')).toBeTruthy();
      // §2-ط-د: the conditional pulse belongs to «متأخرة» alone, and this strip has no such tile
      expect(el.querySelector('.ad-kpi__dot--alert')).toBeNull();
      expect(el.tagName).toBe('DIV'); // never a <button>/<a>: no tile here can open what it counted
    }
    const label = (n: string) => tiles.find((el) => text(el.querySelector('.ad-kpi__l')) === n)!;
    // ج4 — the two figures the store already held and never printed
    expect(text(label('الحقول والرقع').querySelector('.ad-kpi__v'))).toBe('13');
    expect(label('قيمة المحفظة')).toBeTruthy();
  });

  it('narrows the KPI figures with the view, so the strip describes the rows below it', () => {
    at('#/admin/operators?op=op-alwaha');
    const tiles = [...document.querySelectorAll('.ad-kpi')] as HTMLElement[];
    const v = (n: string) => text(tiles.find((el) => text(el.querySelector('.ad-kpi__l')) === n)!.querySelector('.ad-kpi__v'));
    expect(v('شركات مشغّلة')).toBe('1');
    expect(v('الحقول والرقع')).toBe('1');
    expect(v('مناقصات')).toBe(text(rows()[0]!.cells[COL.tenders]));
  });
});

/** Every CSV a run downloads — jsdom exposes no Blob text synchronously, so it is read at
 *  construction and the anchor's click is what completes the file. */
function captureCsv(run: () => void): string[] {
  const files: string[] = [];
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
  URL.createObjectURL = ((b: Blob) => { pending = (b as TextBlob).__text; return 'blob:x'; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) { files.push(pending); };
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
