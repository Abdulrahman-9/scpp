import { useCallback, useState, type ReactElement } from 'react';
import { fmtCount } from './operator/derive';

/**
 * د3 — the sidebar's remembered chrome, written ONCE and worn by both shells.
 *
 * The rail collapses 260 → 72px in the operator shell and in the admin shell, which is exactly the
 * shape of problem د2 already answered for the search keyboard: two shells about to grow one copy
 * each of the same behaviour, and then to disagree about it. The storage keys, the preference hook
 * and the count badge's collapsed form live here; the CSS that dresses them lives once in
 * `operator.css` (the sheet that already owns the unified `.op-side, .ad-side` rule).
 *
 * What is deliberately NOT here: the `t()` calls that name a row. Wording is a call-site concern
 * and both shells name their own destinations from their own nav maps.
 */

/**
 * Both preferences are namespaced OUTSIDE the business store key (`masaar-operator-v13`): chrome
 * must never travel with, or be wiped by, a data migration. `masaar.nav.sec` came first (the
 * «أدوات ومراجع» disclosure) and `masaar.nav.min` follows its precedent rather than inventing a
 * second convention. '1' on · '0' or absent off — off is the default for both, so a first-time
 * reader gets the full rail and the collapsed group.
 */
export const NAV_SEC_KEY = 'masaar.nav.sec';
export const NAV_MIN_KEY = 'masaar.nav.min';

/** The id the collapse button's `aria-controls` names. One sidebar is mounted at a time — the two
 *  shells are alternative roots of the same app, never siblings — so a stable id is honest here. */
export const SIDE_ID = 'shell-side';

export function readNavFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false; // private mode / disabled storage — the rail still works, it just forgets
  }
}

export function writeNavFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    /* a preference that cannot be stored is not an error worth interrupting anybody for */
  }
}

export interface NavMin {
  /** the rail is on its 72px shelf */
  min: boolean;
  toggle: () => void;
}

/**
 * The collapsed-rail preference.
 *
 * Read in the state INITIALISER, not in an effect: React commits this render before the browser
 * paints, so a reader who left the rail collapsed never sees it flash open first. That is the
 * mechanism `readSecPref` already used — no second one is introduced for the same job.
 */
export function useNavMin(): NavMin {
  const [min, setMin] = useState(() => readNavFlag(NAV_MIN_KEY));
  const toggle = useCallback(() => {
    setMin((was) => {
      const next = !was;
      writeNavFlag(NAV_MIN_KEY, next);
      return next;
    });
  }, []);
  return { min, toggle };
}

/**
 * The live counter on a nav row, in whichever form the rail is wearing.
 *
 * Expanded it is the pill it has always been. Collapsed there is no room for digits, so it becomes
 * a DOT — and the number does not evaporate with the pill: the row's `aria-label` carries it
 * (`shell.navItemCount`), which is why the dot itself is `aria-hidden`: announcing the same number
 * twice is the other failure. A zero count renders nothing in either form — an empty alarm is not an
 * alarm, and a dot standing for nothing is decoration pretending to be one.
 */
export function NavCount({
  base,
  n,
  min,
  lang,
}: {
  base: 'op-nav__count' | 'ad-nav__count';
  n: number;
  min: boolean;
  lang: 'ar' | 'en';
}): ReactElement | null {
  if (min) return n > 0 ? <span className={`${base} ${base}--dot`} aria-hidden="true" /> : null;
  return <span className={base}>{fmtCount(n, lang)}</span>;
}
