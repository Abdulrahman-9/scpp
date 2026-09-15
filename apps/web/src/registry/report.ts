/**
 * Registry layer (batch 1) — one column contract drives the on-screen table,
 * the CSV export and (later) the A4 report, so "what the user sees is what is
 * exported". Extracted from Users.tsx exportCsv (the completed local model).
 */

import { fmtCount } from '../operator/derive';

export interface ReportColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  /** rendering hint for the table / A4 report — buildCsv emits the raw value(). */
  format?: 'money' | 'date' | 'count' | 'text';
  /** column is summed in the A4 report footer — metadata, not used by CSV. */
  total?: boolean;
}

/* ------------------------------------------------------------------ *
 * The stamp (phase 4 — client request 7 + the م5 methodology debt)
 * ------------------------------------------------------------------ */

/**
 * How ONE filter dimension is printed on a stamp. The screen owns both halves, because only the
 * screen can turn `op-alwaha` into «الواحة» or `execute` into «التنفيذ والمستخلصات» — the helper
 * knows the grammar of the sentence, never the contents of the store.
 */
export interface FilterLabel {
  /** the dimension, already translated («الشركة»، «الحالة»). `''` prints the value ALONE, which is
   *  how a flag reads in Arabic: «بانتظار المصادقة فقط», not «بوابة: نعم». */
  label: string;
  /** the raw parameter value rendered for a reader; omitted = print the raw value */
  value?: (raw: string) => string;
}

/**
 * The dimensions a surface can stamp, in READING ORDER — object insertion order is the printed
 * order, so two screens carrying the same filters stamp them identically and a reader comparing
 * two exports is comparing like with like.
 */
export type FilterLabels = Record<string, FilterLabel>;

/** The stamp's fixed words, translated by the caller so the sentence lives in the locale files. */
export interface StampWords {
  /** «الفلاتر النشطة» */
  filters: string;
  /** «بلا فلاتر» — the honest reading of an unnarrowed registry */
  none: string;
  /** «عدد الصفوف» */
  rows: string;
  /** «تاريخ الإصدار» */
  generated: string;
  /** «النطاق» — the clause a report uses to name what it covers when it has no filters at all */
  scope?: string;
}

const PLAIN_NUMBER = /^\d+(?:\.\d+)?$/;

/**
 * The active-filter clause: «الشركة: الواحة · الحالة: متأخرة», or `''` when nothing narrows the
 * registry. THE ONE reader of a filter set — every CSV and every print surface calls it, so an
 * export can never describe a narrowing different from the one that produced its rows.
 *
 * A parameter absent from `params`, or empty, is not a filter and is skipped. A raw value with no
 * `value()` renderer is printed as-is, EXCEPT a bare number, which is grouped through `fmtCount`
 * (`5000000` → `5,000,000`): the Latin-digit / grouping law is enforced here rather than trusted
 * to five call sites.
 */
export function formatActiveFilters(params: URLSearchParams, lang: 'ar' | 'en', labels: FilterLabels): string {
  const parts: string[] = [];
  for (const [name, spec] of Object.entries(labels)) {
    const raw = params.get(name);
    if (raw == null || raw === '') continue;
    const shown = spec.value ? spec.value(raw) : PLAIN_NUMBER.test(raw) ? fmtCount(Number(raw), lang) : raw;
    if (!shown) continue;
    parts.push(spec.label ? `${spec.label}: ${shown}` : shown);
  }
  return parts.join(' · ');
}

export interface StampInput {
  params: URLSearchParams;
  labels: FilterLabels;
  lang: 'ar' | 'en';
  /** how many rows the file/print actually carries — the WYSIWYG claim, checkable by counting */
  rows: number;
  /** ISO generation date */
  today: string;
  words: StampWords;
  /** what the surface covers when that is not a filter («المحفظة كلها»، «المناقصة T-2026-014») */
  scope?: string;
}

/**
 * The stamped header line every export and every print surface carries:
 *
 *   «النطاق: المحفظة كلها · الفلاتر النشطة: الشركة: الواحة · عدد الصفوف: 12 · تاريخ الإصدار: 2026-08-20»
 *
 * Three promises in one sentence: what was covered, what was removed, and how much survived. A
 * surface with no filters prints «بلا فلاتر» rather than dropping the clause — the absence of a
 * narrowing is itself a fact the reader of a printed page needs, and a missing clause reads as an
 * omission.
 */
export function reportStamp({ params, labels, lang, rows, today, words, scope }: StampInput): string {
  const active = formatActiveFilters(params, lang, labels);
  const parts: string[] = [];
  if (scope && words.scope) parts.push(`${words.scope}: ${scope}`);
  parts.push(`${words.filters}: ${active || words.none}`);
  parts.push(`${words.rows}: ${fmtCount(rows, lang)}`);
  parts.push(`${words.generated}: ${today}`);
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * CSV
 * ------------------------------------------------------------------ */

/**
 * Pure CSV string builder — every cell (header included) is wrapped in quotes and
 * embedded quotes are doubled, exactly like Users.tsx exportCsv (lines 63-73).
 * Header cells are the column labels; body cells are the raw `value(row)` output.
 * Kept side-effect free so it can be unit-tested without a DOM.
 *
 * `stamp` (phase 4) is written as a single quoted cell on the FIRST line, above the header. A
 * spreadsheet opens it as one text cell in A1 and every column header keeps its row — so the file
 * says which filtered view produced it without disturbing the machine-readable table below.
 */
export function buildCsv<T>(columns: ReportColumn<T>[], rows: T[], stamp?: string): string {
  const head = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => String(c.value(row))));
  const table = [head, ...body];
  const lines = (stamp ? [[stamp], ...table] : table)
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
  return lines.join('\n');
}

/**
 * Download the columns/rows as a UTF-8 CSV (BOM-prefixed so Excel reads Arabic).
 * A local file export only — it never reaches the server audit log; the caller
 * raises the toast. `filename` gains a `.csv` suffix when it lacks one.
 *
 * `stamp` is REQUIRED here, unlike on the pure `buildCsv` below.
 *
 * Three registries shipped without one — a file of filtered rows carrying no sentence about which
 * filter produced it, which is the same defect as a wrong count: the reader who opens it later has
 * no way to tell a whole portfolio from a narrowed one. A screen that genuinely holds no filter
 * still has something true to say («بلا فلاتر», with the row count and the date), so there is no
 * honest call site that wants the argument omitted. Making it required moves the guarantee from
 * review to the compiler; `test/registry.test.ts` additionally pins every call site in source, so
 * a future `stamp?: string` cannot quietly reopen the hole.
 */
export function exportCsv<T>(filename: string, columns: ReportColumn<T>[], rows: T[], stamp: string): void {
  const csv = buildCsv(columns, rows, stamp);
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
