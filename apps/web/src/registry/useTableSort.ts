import { useMemo, useState } from 'react';

/**
 * Registry layer (batch 1) — tri-state column sorting shared by every list screen.
 * Toggling a column cycles asc → desc → none; "none" restores the original row
 * order (the order the caller passed in, i.e. the active filter order).
 * The transition and the sort are exported as pure functions so they can be
 * unit-tested without rendering.
 */

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: string | null;
  dir: SortDir | null;
}

/**
 * Arabic-aware string comparator for a selected field, using Intl.Collator('ar')
 * so أ/ا/ء and the rest of the alphabet order the way an Arabic reader expects
 * (never by UTF-16 code point). `numeric` keeps embedded numbers natural.
 */
export function arCompare<T>(sel: (t: T) => string): (a: T, b: T) => number {
  const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
  return (a, b) => collator.compare(sel(a), sel(b));
}

/** Next tri-state after toggling `key`: same column advances asc→desc→none; a new column starts at asc. */
export function nextSortState(current: SortState, key: string): SortState {
  if (current.key !== key || current.dir === null) return { key, dir: 'asc' };
  if (current.dir === 'asc') return { key, dir: 'desc' };
  return { key: null, dir: null };
}

/**
 * Pure sort: returns the original array reference when there is no active sort
 * (so "none" is provably the original order), otherwise a stably-sorted copy.
 * An unknown key (no comparator) is treated as "no sort".
 */
export function sortRows<T>(
  rows: T[],
  compare: Record<string, (a: T, b: T) => number>,
  key: string | null,
  dir: SortDir | null,
): T[] {
  if (!key || !dir) return rows;
  const cmp = compare[key];
  if (!cmp) return rows;
  return [...rows].sort((a, b) => (dir === 'asc' ? cmp(a, b) : cmp(b, a)));
}

export interface TableSort<T> {
  sorted: T[];
  sortKey: string | null;
  dir: SortDir | null;
  toggle: (key: string) => void;
}

/** Hook wrapper: holds the tri-state and derives the sorted rows via useMemo. */
export function useTableSort<T>(rows: T[], compare: Record<string, (a: T, b: T) => number>): TableSort<T> {
  const [state, setState] = useState<SortState>({ key: null, dir: null });
  const sorted = useMemo(() => sortRows(rows, compare, state.key, state.dir), [rows, compare, state.key, state.dir]);
  const toggle = (key: string) => setState((cur) => nextSortState(cur, key));
  return { sorted, sortKey: state.key, dir: state.dir, toggle };
}
