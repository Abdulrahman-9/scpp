// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { pageWindow } from '../src/registry/PaginationBar';
import { buildCsv, type ReportColumn } from '../src/registry/report';
import { arCompare, nextSortState, sortRows, useTableSort } from '../src/registry/useTableSort';
import {
  clampPage,
  pageBounds,
  pageCount,
  pageSlice,
  usePagination,
} from '../src/registry/usePagination';

/* ------------------------------------------------------------------ */
/*  report.ts — buildCsv quoting                                       */
/* ------------------------------------------------------------------ */
describe('buildCsv', () => {
  interface Row { name: string; note: string }
  const columns: ReportColumn<Row>[] = [
    { key: 'name', label: 'name', value: (r) => r.name },
    { key: 'note', label: 'note', value: (r) => r.note },
  ];

  it('quotes every header cell', () => {
    const [head] = buildCsv(columns, []).split('\n');
    expect(head).toBe('"name","note"');
  });

  it('doubles embedded quotes and preserves embedded commas inside the quoted cell', () => {
    const rows: Row[] = [
      { name: 'A "quoted", value', note: 'plain' },
      { name: 'zeta', note: 'a,b' },
    ];
    expect(buildCsv(columns, rows)).toBe(
      [
        '"name","note"',
        '"A ""quoted"", value","plain"',
        '"zeta","a,b"',
      ].join('\n'),
    );
  });

  it('stringifies numeric and boolean-derived values without formatting', () => {
    interface N { n: number; b: boolean }
    const cols: ReportColumn<N>[] = [
      { key: 'n', label: 'n', value: (r) => r.n },
      { key: 'b', label: 'b', value: (r) => String(r.b) },
    ];
    expect(buildCsv(cols, [{ n: 1000, b: true }])).toBe('"n","b"\n"1000","true"');
  });
});

/* ------------------------------------------------------------------ */
/*  every export call site carries a stamp — a check over SOURCE       */
/* ------------------------------------------------------------------ */

/**
 * Three registries shipped exports with no stamp (`Approvals`, `Users`, `Operators`): a file of
 * filtered rows carrying no sentence about the filter that produced it, which is indistinguishable
 * from a file of the whole portfolio once it leaves the browser.
 *
 * `exportCsv`'s fourth parameter is now REQUIRED, so the compiler already refuses an omission —
 * but a `stamp?: string` typed back in some future refactor would reopen the hole silently and
 * every existing test would stay green. This check reads the SOURCE instead: it finds every call
 * to the two writers, counts the top-level arguments, and fails on any call that stops at three.
 * It is deliberately independent of the type signature, because the signature is the thing that
 * could regress.
 *
 * `RolesMatrix.tsx` defines its own local `exportCsv` over the static capability matrix and does
 * not import the registry writer; only real call sites of `../registry/report` are enumerated,
 * and the enumeration itself is asserted non-empty so a rename cannot make this pass vacuously.
 */
function srcFiles(): string[] {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  };
  return walk(root);
}

/** The argument list of `fn(` at `from`, split on TOP-LEVEL commas — nested calls stay whole. */
function argsAt(text: string, from: number): string[] {
  let depth = 0;
  let cur = '';
  const args: string[] = [];
  for (let i = from; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) { args.push(cur); return args.map((a) => a.trim()).filter((a) => a !== ''); }
    }
    if (depth === 1 && c === ',') { args.push(cur); cur = ''; continue; }
    if (depth >= 1) cur += c;
  }
  return [];
}

describe('the stamp travels with every CSV this product writes', () => {
  const WRITERS: Record<string, number> = { exportCsv: 4, buildCsv: 3 };

  const sites = srcFiles()
    .map((f) => ({ f, text: readFileSync(f, 'utf8') }))
    // only files that take the writers FROM the registry — a same-named local helper is not this
    .filter(({ text }) => /import \{[^}]*\b(exportCsv|buildCsv)\b[^}]*\} from '.*registry\/report'/.test(text))
    .flatMap(({ f, text }) => {
      const out: { file: string; fn: string; args: string[] }[] = [];
      for (const fn of Object.keys(WRITERS)) {
        const re = new RegExp(`(?<![\\w.])${fn}\\s*(?:<[^;()]*>)?\\s*\\(`, 'g');
        for (let m = re.exec(text); m; m = re.exec(text)) {
          const open = text.indexOf('(', m.index + fn.length);
          out.push({ file: f.replace(/\\/g, '/').split('/src/')[1]!, fn, args: argsAt(text, open) });
        }
      }
      return out;
    });

  it('found the call sites at all — a rename must fail this file, not skip it', () => {
    expect(sites.filter((s) => s.fn === 'exportCsv').length).toBeGreaterThanOrEqual(5);
    expect(sites.filter((s) => s.fn === 'buildCsv').length).toBeGreaterThanOrEqual(2);
  });

  it('passes a stamp argument at EVERY one of them', () => {
    const short = sites
      .filter((s) => s.args.length < WRITERS[s.fn]!)
      .map((s) => `${s.file}: ${s.fn}(${s.args.length} args) — no stamp`);
    expect(short).toEqual([]);
  });

  it('never passes an empty stamp, which would be a clause that says nothing', () => {
    const blank = sites
      .filter((s) => /^(''|""|``|undefined|null)$/.test(s.args[WRITERS[s.fn]! - 1] ?? ''))
      .map((s) => `${s.file}: ${s.fn} — blank stamp`);
    expect(blank).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  useTableSort — tri-state cycle + Arabic collation                  */
/* ------------------------------------------------------------------ */
describe('nextSortState — tri-state transition', () => {
  it('cycles the same column asc → desc → none, and a new column starts at asc', () => {
    const s0 = { key: null, dir: null };
    const s1 = nextSortState(s0, 'name');
    expect(s1).toEqual({ key: 'name', dir: 'asc' });
    const s2 = nextSortState(s1, 'name');
    expect(s2).toEqual({ key: 'name', dir: 'desc' });
    const s3 = nextSortState(s2, 'name');
    expect(s3).toEqual({ key: null, dir: null });
    // toggling a different column while one is sorted jumps straight to that column asc
    expect(nextSortState({ key: 'name', dir: 'desc' }, 'role')).toEqual({ key: 'role', dir: 'asc' });
  });
});

describe('sortRows', () => {
  interface Row { n: string }
  const rows: Row[] = [{ n: 'ب' }, { n: 'ا' }, { n: 'ت' }];
  const compare = { n: arCompare<Row>((r) => r.n) };

  it('returns the original array reference when there is no active sort', () => {
    expect(sortRows(rows, compare, null, null)).toBe(rows);
    expect(sortRows(rows, compare, 'n', null)).toBe(rows);
  });

  it('sorts ascending and descending without mutating the input', () => {
    expect(sortRows(rows, compare, 'n', 'asc').map((r) => r.n)).toEqual(['ا', 'ب', 'ت']);
    expect(sortRows(rows, compare, 'n', 'desc').map((r) => r.n)).toEqual(['ت', 'ب', 'ا']);
    expect(rows.map((r) => r.n)).toEqual(['ب', 'ا', 'ت']); // untouched
  });

  it('treats an unknown sort key as no sort', () => {
    expect(sortRows(rows, compare, 'missing', 'asc')).toBe(rows);
  });
});

describe('arCompare — Arabic-aware collation', () => {
  it('orders Arabic names alphabetically, not by UTF-16 code point', () => {
    const cmp = arCompare<{ n: string }>((x) => x.n);
    const names = [{ n: 'ياسر' }, { n: 'أحمد' }, { n: 'محمد' }];
    expect([...names].sort(cmp).map((x) => x.n)).toEqual(['أحمد', 'محمد', 'ياسر']);
  });

  it('folds hamza variants of alef to the same base letter (proof it is a collator, not "<")', () => {
    const cmp = arCompare<string>((s) => s);
    expect(cmp('أحمد', 'احمد')).toBe(0); // base-equal — a raw code-point compare would be negative
  });
});

describe('useTableSort — hook returns to original order after a full cycle', () => {
  interface Row { n: string }
  it('toggle cycles asc → desc → original-order (same reference)', () => {
    const rows: Row[] = [{ n: 'ب' }, { n: 'ا' }, { n: 'ت' }];
    const compare = { n: arCompare<Row>((r) => r.n) };
    const { result } = renderHook(() => useTableSort(rows, compare));

    expect(result.current.sorted).toBe(rows); // no sort yet
    act(() => result.current.toggle('n'));
    expect(result.current.dir).toBe('asc');
    expect(result.current.sorted.map((r) => r.n)).toEqual(['ا', 'ب', 'ت']);
    act(() => result.current.toggle('n'));
    expect(result.current.dir).toBe('desc');
    expect(result.current.sorted.map((r) => r.n)).toEqual(['ت', 'ب', 'ا']);
    act(() => result.current.toggle('n'));
    expect(result.current.sortKey).toBeNull();
    expect(result.current.sorted).toBe(rows); // provably the original order
  });
});

/* ------------------------------------------------------------------ */
/*  usePagination — boundary maths + reset on filter change            */
/* ------------------------------------------------------------------ */
describe('pagination maths', () => {
  it('pageCount is at least one and rounds up the remainder', () => {
    expect(pageCount(0, 10)).toBe(1);
    expect(pageCount(20, 10)).toBe(2);
    expect(pageCount(25, 10)).toBe(3);
  });

  it('clampPage keeps the page inside [1, pageCount]', () => {
    expect(clampPage(0, 25, 10)).toBe(1);
    expect(clampPage(9, 25, 10)).toBe(3);
    expect(clampPage(2, 25, 10)).toBe(2);
  });

  it('pageBounds returns the 1-based inclusive range, with a short last page', () => {
    expect(pageBounds(25, 1, 10)).toEqual({ start: 1, end: 10 });
    expect(pageBounds(25, 3, 10)).toEqual({ start: 21, end: 25 }); // last-page remainder
    expect(pageBounds(0, 1, 10)).toEqual({ start: 0, end: 0 });
  });

  it('pageSlice returns the correct window, including the short final page', () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    expect(pageSlice(rows, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageSlice(rows, 3, 10)).toEqual([20, 21, 22, 23, 24]); // remainder of 5
  });
});

describe('usePagination — hook behaviour', () => {
  const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('exposes the current window and range', () => {
    const { result } = renderHook(({ rows }) => usePagination(rows, 10), { initialProps: { rows: rowsOf(25) } });
    expect(result.current.total).toBe(25);
    expect(result.current.pageRows).toHaveLength(10);
    expect(result.current.start).toBe(1);
    expect(result.current.end).toBe(10);

    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);
    expect(result.current.start).toBe(21);
    expect(result.current.end).toBe(25);
    expect(result.current.pageRows).toEqual([20, 21, 22, 23, 24]);
  });

  it('resets to page 1 when the row count changes, even if the old page is still valid', () => {
    const { result, rerender } = renderHook(({ rows }) => usePagination(rows, 10), { initialProps: { rows: rowsOf(25) } });
    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    // 30 rows still spans 3 pages, so page 2 would remain valid — the reset is what forces page 1
    rerender({ rows: rowsOf(30) });
    expect(result.current.page).toBe(1);
    expect(result.current.start).toBe(1);
  });

  it('clamps an out-of-range page after the list shrinks', () => {
    const { result, rerender } = renderHook(({ rows }) => usePagination(rows, 10), { initialProps: { rows: rowsOf(25) } });
    act(() => result.current.setPage(3));
    rerender({ rows: rowsOf(5) });
    expect(result.current.page).toBe(1);
    expect(result.current.pageRows).toEqual([0, 1, 2, 3, 4]);
  });
});

/* ------------------------------------------------------------------ */
/*  PaginationBar — the numbered window (ق6)                           */
/* ------------------------------------------------------------------ */
describe('pageWindow', () => {
  it('elides nothing while the whole run fits — an ellipsis over one page costs a click, saves none', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps both ENDS and the current page with a neighbour either side', () => {
    expect(pageWindow(10, 40)).toEqual([1, null, 9, 10, 11, null, 40]);
  });

  it('slides inward near an edge instead of shrinking, so the strip keeps its width', () => {
    expect(pageWindow(1, 40)).toEqual([1, 2, 3, 4, null, 40]);
    expect(pageWindow(40, 40)).toEqual([1, null, 37, 38, 39, 40]);
  });

  it('never emits a gap that hides a single page — the number is shorter than the «…»', () => {
    // page 2 alone sits between 1 and 3, so it is PRINTED rather than hidden behind an ellipsis
    // that is no narrower and cannot be clicked
    expect(pageWindow(4, 8)).toEqual([1, 2, 3, 4, 5, null, 8]);
    expect(pageWindow(6, 8)).toEqual([1, null, 5, 6, 7, 8]);
    for (const last of [8, 9, 20, 100]) {
      for (let p = 1; p <= last; p++) {
        const w = pageWindow(p, last);
        const nums = w.filter((n): n is number => n !== null);
        // every printed page is real, in order, and the current one is always reachable
        expect(nums).toEqual([...nums].sort((a, b) => a - b));
        expect(new Set(nums).size).toBe(nums.length);
        expect(nums).toContain(p);
        expect(nums[0]).toBe(1);
        expect(nums[nums.length - 1]).toBe(last);
        // a gap must always stand for MORE than one page
        w.forEach((v, i) => {
          if (v === null) expect((w[i + 1] as number) - (w[i - 1] as number)).toBeGreaterThan(2);
        });
      }
    }
  });
});
