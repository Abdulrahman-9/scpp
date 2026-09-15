import { useEffect, useRef } from 'react';

/**
 * Count-up duration. A TS constant, not a CSS token: requestAnimationFrame cannot read a custom
 * property, and a duration that lives in two places drifts. It is deliberately OUTSIDE the
 * --dur-fast/--dur-base scale — those are state-feedback budgets for a transition, this is a
 * one-shot reveal of a figure and answers to a different rule.
 */
export const COUNT_UP_MS = 600;

export interface CountUpOpts {
  /** false ⇒ the final figure is printed at once and no frame loop is ever created */
  enabled?: boolean;
  /**
   * Final formatting (fmtCount / a percentage / a unit). Called EVERY frame, so it must be
   * referentially stable — a fresh inline arrow re-runs the effect on every render, which
   * restarts the count from zero forever. Wrap it in useMemo/useCallback or hoist it.
   */
  format?: (n: number) => string;
}

/**
 * Count a figure up on its first reveal — rAF only, no library, no chained timers.
 *
 * Extracted from KpiTile (spec §2-1) because the production KPI in the admin room is `.ad-kpi`,
 * hand-written markup that cannot use KpiTile at all: `.m-kpi` is built on the --m-* variables
 * that only exist inside a `.m-skin` wrapper, and neither shell is one. The hook is the part
 * both surfaces can actually share.
 *
 * Starts when the element enters the viewport (once) and ALWAYS lands on the real value —
 * the last frame writes `format(target)` literally, never an eased approximation of it.
 *
 * `prefers-reduced-motion: reduce` ⇒ the final value is written synchronously and no observer
 * and no frame are created. Same for an explicit `enabled: false` and for any environment
 * without IntersectionObserver (jsdom, SSR): the figure is never withheld from a reader.
 */
export function useCountUp(target: number, { enabled = true, format = String }: CountUpOpts = {}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || reduced || typeof IntersectionObserver === 'undefined') {
      el.textContent = format(target);
      return;
    }

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const tick = (ts: number) => {
          const p = Math.min((ts - t0) / COUNT_UP_MS, 1);
          const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out — matches --ease-out's shape
          el.textContent = format(Math.round(target * eased));
          if (p < 1) raf = requestAnimationFrame(tick);
          else el.textContent = format(target); // the true figure, verbatim, at the end
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [target, enabled, format]);

  return ref;
}
