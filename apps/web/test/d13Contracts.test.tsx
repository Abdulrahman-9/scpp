// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../src/i18n';
import App from '../src/App';
import { capHealth, contractProgress, plannedDelivery, plannedProgressPct } from '../src/admin/contractDerive';
import { fmtMoney, fmtMoneyShort } from '../src/operator/derive';
import { saveSession } from '../src/session';
import { seedState, todayIso, type ContractState, type State } from '../src/store';

/**
 * د13 — «العقود» (ع1–ع5). Three properties the plan names as this batch's guards, and each one is
 * a thing only the mounted registry can hold:
 *
 *   · ع3 — «قيمة المحفظة» is the SUM OF THE FILTERED ROWS and carries no act. A tile that summed
 *     the whole store while the table showed a narrowed portfolio would be the same defect as a
 *     wrong count; a tile that could be pressed would be the reference's disguised clear-button,
 *     which this plan rejects by name.
 *   · ع4 — no tile is a button unless a filter stands behind it, and the filter it writes returns
 *     EXACTLY the set it counted (قانون P3). «متأخرة عن الجدول» stays inert because no variance
 *     dimension exists to narrow by — an inert number is honest, a placebo button is not.
 *   · ع1 — the row's rail is `c.stages`. No 7 is written anywhere: two contracts with different
 *     recorded lifecycles are put on one screen, and no constant can satisfy both rows at once.
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

/** A portfolio that splits: c1 breaches a cap, c4 sits well inside all three. */
function seedSplit(): State {
  const s = seedState();
  const put = (id: string, extra: Partial<ContractState>) => {
    const c = s.contracts.find((x) => x.id === id)!;
    Object.assign(c, extra);
  };
  put('c1', { voTotalUSD: 2_000_000 }); // 59% of 3.4M — past the §18 variation-order cap
  put('c4', { voTotalUSD: 0, extensionDays: 0, ldTotalUSD: 0 });
  return s;
}

const rows = () => [...document.querySelectorAll('.op-tbl tbody tr')] as HTMLElement[];
const tiles = () => [...document.querySelectorAll('.ad-kpi')] as HTMLElement[];
const tile = (label: string) => tiles().find((el) => el.querySelector('.ad-kpi__l')?.textContent === label)!;
const figure = (el: HTMLElement) => el.querySelector('.ad-kpi__v')!.textContent;
/** The contract whose code cell reads `code`, from the state the screen was given. */
const codeOf = (row: HTMLElement) => row.querySelector('.op-tbl__code')!.textContent!;

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
  URL.createObjectURL = ((b: Blob) => {
    pending = (b as unknown as { __text?: string }).__text ?? '';
    return 'blob:test';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) { files.push(pending); };
  try { run(); } finally {
    globalThis.Blob = OrigBlob;
    URL.createObjectURL = origUrl;
    URL.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  }
  return files;
}

/* ================================================== ع3 — the portfolio total, and no act on it */

describe('«قيمة المحفظة» = the sum of the filtered rows, as a number with no act (ع3)', () => {
  it('sums exactly the rows on screen, and re-sums when the view narrows', () => {
    const s = seedSplit();
    const { unmount } = at('#/admin/contracts', s);
    const all = s.contracts.reduce((n, c) => n + c.valueUSD, 0);
    expect(figure(tile('قيمة المحفظة'))).toBe(fmtMoneyShort(all));
    // the short headline rounds, so the exact grouped figure — the one the export totals — is
    // printed under it rather than left in a tooltip
    expect(tile('قيمة المحفظة').querySelector('.ad-kpi__delta')!.textContent).toBe(fmtMoney(all));

    // narrow by value: the tile must follow the table, never the store
    unmount();
    at('#/admin/contracts?vmin=6800000&vmax=9200000');
    const narrowed = s.contracts.filter((c) => c.valueUSD >= 6_800_000 && c.valueUSD <= 9_200_000);
    expect(rows()).toHaveLength(narrowed.length);
    expect(figure(tile('قيمة المحفظة'))).toBe(fmtMoneyShort(narrowed.reduce((n, c) => n + c.valueUSD, 0)));
  });

  it('agrees with the `valueUSD` column the CSV totals — one portfolio, two surfaces', () => {
    at('#/admin/contracts?vmin=6800000');
    const files = captureCsv(() => {
      fireEvent.click(screen.getByRole('button', { name: /CSV/ }));
    });
    expect(files).toHaveLength(1);
    const lines = files[0]!.replace(/^﻿/, '').split('\n');
    const header = lines[1]!.split(',').map((c) => c.replace(/"/g, ''));
    const col = header.indexOf('valueUSD');
    expect(col).toBeGreaterThan(-1);
    const sum = lines.slice(2).reduce((n, line) => n + Number(line.split(',')[col]!.replace(/"/g, '')), 0);
    expect(figure(tile('قيمة المحفظة'))).toBe(fmtMoneyShort(sum));
  });

  it('carries no control at all — the reference put a disguised «clear» under this number', () => {
    at('#/admin/contracts');
    const el = tile('قيمة المحفظة');
    expect(el.tagName).toBe('DIV');
    expect(el.querySelectorAll('button, a, input, select')).toHaveLength(0);
    expect(el.getAttribute('aria-pressed')).toBeNull();
  });
});

/* ================================================== ع4 — a pressable tile has a filter behind it */

describe('no tile is pressable without a filter behind it (ع4 · قانون P3)', () => {
  it('«قرب/تجاوز السقف» opens EXACTLY the rows it counted, and closes again', () => {
    const s = seedSplit();
    at('#/admin/contracts', s);
    const attention = s.contracts.filter((c) => capHealth(c) !== 'ok');
    // the guard is only meaningful on a portfolio that actually splits
    expect(attention.length).toBeGreaterThan(0);
    expect(attention.length).toBeLessThan(s.contracts.length);

    const caps = tile('قرب/تجاوز السقف') as HTMLButtonElement;
    expect(caps.tagName).toBe('BUTTON');
    expect(figure(caps)).toBe(String(attention.length));
    expect(caps.getAttribute('aria-pressed')).toBe('false');

    act(() => { fireEvent.click(caps); });
    expect(rows()).toHaveLength(attention.length);
    const shown = rows().map(codeOf).sort();
    expect(shown).toEqual(attention.map((c) => c.code).sort());
    expect((tile('قرب/تجاوز السقف') as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
    // and the narrowing is one dimension with one vocabulary: the stamp says it in the tile's words
    expect((document.querySelector('.reg-stamp') as HTMLElement).textContent).toContain('قرب/تجاوز السقف');

    act(() => { fireEvent.click(tile('قرب/تجاوز السقف')); });
    expect(rows()).toHaveLength(s.contracts.length);
  });

  it('leaves «متأخرة عن الجدول» inert — there is no variance dimension to narrow by', () => {
    at('#/admin/contracts', seedSplit());
    const late = tile('متأخرة عن الجدول');
    expect(late.tagName).toBe('DIV');
    expect(late.querySelectorAll('button, a')).toHaveLength(0);
  });

  it('gives every pressable tile a filter and a pressed state — and nothing else is a button', () => {
    at('#/admin/contracts', seedSplit());
    const pressable = tiles().filter((el) => el.tagName === 'BUTTON');
    expect(pressable).toHaveLength(1);
    for (const el of pressable) {
      expect(el.getAttribute('aria-pressed')).not.toBeNull();
      expect(el.getAttribute('title')).toBeTruthy();
    }
  });
});

/* ================================================== ع1/ع2/ع5 — the row's own schedule */

describe('the row rail is the contract’s OWN stage array (ع1)', () => {
  it('draws one slot per recorded stage — two lifecycles of different length on one screen', () => {
    const s = seedSplit();
    const short = s.contracts.find((c) => c.id === 'c2')!;
    short.stages = short.stages.slice(0, 4); // a contract recorded on a shorter lifecycle
    const full = s.contracts.find((c) => c.id === 'c1')!;
    expect(full.stages.length).not.toBe(short.stages.length);

    at('#/admin/contracts', s);
    const rowFor = (code: string) => rows().find((r) => codeOf(r) === code)!;
    expect(rowFor(full.code).querySelectorAll('.op-seg')).toHaveLength(full.stages.length);
    expect(rowFor(short.code).querySelectorAll('.op-seg')).toHaveLength(short.stages.length);

    // decoration beside a name (ق4's arrangement): the words stay the readable stage
    const rail = rowFor(full.code).querySelector('.op-segs') as HTMLElement;
    expect(rail.getAttribute('aria-hidden')).toBe('true');
    expect(rowFor(full.code).querySelector('.op-tbl__stage')!.textContent).toBeTruthy();
    // every slot names itself, and exactly one is the open stage
    expect([...rail.querySelectorAll('.op-seg')].every((x) => (x.getAttribute('title') ?? '').length > 0)).toBe(true);
    expect(rail.querySelectorAll('.op-seg--now')).toHaveLength(1);
  });

  it('marks the plan on the row bar and prints the contractual completion date (ع2/ع5)', () => {
    const s = seedSplit();
    at('#/admin/contracts', s);
    const today = todayIso();
    const c = s.contracts.find((x) => x.id === 'c1')!;
    const row = rows().find((r) => codeOf(r) === c.code)!;

    const fill = row.querySelector('.ctr-rowbar__fill') as HTMLElement;
    const mark = row.querySelector('.ctr-rowbar__mark') as HTMLElement;
    expect(fill.style.inlineSize).toBe(`${contractProgress(c).pct}%`);
    expect(mark.style.insetInlineStart).toBe(`${plannedProgressPct(c, today)}%`);
    // both numbers are said once, on the bar itself
    expect(row.querySelector('.ctr-rowbar__track')!.getAttribute('aria-label'))
      .toContain(String(plannedProgressPct(c, today)));

    expect(within(row).getByText(plannedDelivery(c))).toBeTruthy();
  });
});
