import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Registry layer (batch 1) — client pagination shared by every list screen.
 * Page resets to 1 whenever the row set size changes (a filter/search narrowed
 * or widened the list), so the user is never stranded on a now-empty page.
 * The maths are exported as pure functions for unit testing.
 */

/** Number of pages for `total` rows at `pageSize` — always at least one. */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Clamp a page number into [1, pageCount]. */
export function clampPage(page: number, total: number, pageSize: number): number {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

/** 1-based inclusive range shown on the current page; {0,0} when there are no rows. */
export function pageBounds(total: number, page: number, pageSize: number): { start: number; end: number } {
  if (total === 0) return { start: 0, end: 0 };
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return { start, end };
}

/** The slice of `rows` visible on `page`. */
export function pageSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const from = (page - 1) * pageSize;
  return rows.slice(from, from + pageSize);
}

export interface Pagination<T> {
  pageRows: T[];
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  start: number;
  end: number;
}

export function usePagination<T>(rows: T[], initial = 10): Pagination<T> {
  const [pageSize, setPageSize] = useState(initial);
  const [page, setPage] = useState(1);
  const total = rows.length;

  // Reset to the first page whenever the row count changes (filter/search moved).
  const prevTotal = useRef(total);
  useEffect(() => {
    if (prevTotal.current !== total) {
      prevTotal.current = total;
      setPage(1);
    }
  }, [total]);

  const safePage = clampPage(page, total, pageSize);
  const pageRows = useMemo(() => pageSlice(rows, safePage, pageSize), [rows, safePage, pageSize]);
  const { start, end } = pageBounds(total, safePage, pageSize);

  return { pageRows, page: safePage, setPage, pageSize, setPageSize, total, start, end };
}
