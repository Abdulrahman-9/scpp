import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { pageCount } from './usePagination';
import './registry.css';

/**
 * Registry layer (batch 1) — the pagination control strip: range read-out,
 * page-size select, numbered pages and prev/next. Hidden entirely when the whole
 * list fits on one page at the smallest size (nothing to page through).
 */
export interface PaginationBarProps {
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  total: number;
  start: number;
  end: number;
  lang: 'ar' | 'en';
  sizes?: number[];
}

/** How many page buttons may be printed before the window starts compressing. */
const MAX_SHOWN = 7;

/**
 * ق6 — the page numbers to print, in order, with `null` standing for an elision.
 *
 * PURE and exported so the compression is checkable without a DOM: «صفحة 1 … 6 7 8 … 40» is a
 * claim about which pages are reachable in one click, and a shared registry control may not make
 * that claim differently on different screens.
 *
 * The window always keeps the two ENDS (a reader jumps to the last page more often than to any
 * middle one) and the current page with one neighbour either side. Below `MAX_SHOWN` pages nothing
 * is elided at all — an ellipsis that hides a single page costs a click and saves nothing.
 */
export function pageWindow(current: number, last: number): (number | null)[] {
  if (last <= MAX_SHOWN) return Array.from({ length: last }, (_, i) => i + 1);
  const keep = new Set<number>([1, last, current, current - 1, current + 1]);
  // near an end the window would run off the edge and shrink; it slides inward instead, so the
  // strip keeps a constant width and the numbers do not jump under the pointer
  if (current <= 3) [2, 3, 4].forEach((n) => keep.add(n));
  if (current >= last - 2) [last - 3, last - 2, last - 1].forEach((n) => keep.add(n));
  const pages = [...keep].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of pages) {
    // A gap must always stand for MORE than one page: eliding a single number would replace a
    // one-click destination with an ellipsis that is no narrower and cannot be clicked at all.
    if (prev && n - prev === 2) out.push(prev + 1);
    else if (prev && n - prev > 2) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}

export function PaginationBar({ page, setPage, pageSize, setPageSize, total, start, end, lang, sizes = [10, 25, 50] }: PaginationBarProps) {
  const { t } = useTranslation();
  const smallest = Math.min(...sizes);
  if (total <= smallest) return null;

  const last = pageCount(total, pageSize);
  const atStart = page <= 1;
  const atEnd = page >= last;

  return (
    <div className="reg-pager" data-noprint="1">
      <span className="reg-pager__range">
        {t('reg.common.range', { from: fmtCount(start, lang), to: fmtCount(end, lang), n: fmtCount(total, lang) })}
      </span>
      <div className="reg-pager__controls">
        <select
          className="reg-pager__size"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label={t('reg.common.pageSize')}
        >
          {sizes.map((s) => <option key={s} value={s}>{fmtCount(s, lang)}</option>)}
        </select>
        <button
          type="button"
          className="op-btn-ghost reg-pager__btn"
          disabled={atStart}
          title={atStart ? t('reg.common.prevDisabled') : undefined}
          onClick={() => setPage(page - 1)}
        >
          {t('reg.common.prev')}
        </button>
        {/* The numbers themselves — a real navigation group, so a screen reader hears «التنقّل بين
            الصفحات» before it hears a bare row of digits. The current page is announced by
            `aria-current`, never by a disabled button: disabling the page you are on removes it
            from the tab order and takes the position away from exactly the reader who cannot see
            it highlighted. */}
        <nav className="reg-pager__pages" aria-label={t('reg.common.pagesLabel')}>
          {pageWindow(page, last).map((n, i) => (n === null ? (
            <span key={`gap-${i}`} className="reg-pager__gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className="reg-pager__p"
              aria-current={n === page ? 'page' : undefined}
              aria-label={t('reg.common.page', { n: fmtCount(n, lang) })}
              onClick={() => setPage(n)}
            >
              {fmtCount(n, lang)}
            </button>
          )))}
        </nav>
        <button
          type="button"
          className="op-btn-ghost reg-pager__btn"
          disabled={atEnd}
          title={atEnd ? t('reg.common.nextDisabled') : undefined}
          onClick={() => setPage(page + 1)}
        >
          {t('reg.common.next')}
        </button>
      </div>
    </div>
  );
}
