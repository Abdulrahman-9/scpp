/**
 * Registry layer (phase 4, client request 7) — the DECLARED filter dimensions.
 *
 * Every registry toolbar was growing its own `if (x && row.y !== x) return false` line, which is
 * how two screens end up disagreeing about what «من / إلى» means at the boundary. The predicates
 * live here once, they are pure, and the URL contract (`useHashParams`) hands them already-
 * validated strings — so a malformed link produces a WIDE registry, never an empty one.
 *
 * Both windows are INCLUSIVE at both ends. That is the reading a procurement officer expects of
 * «من 5 مليون إلى 10 مليون»: a request valued at exactly 10,000,000 is inside it. It also matches
 * the approval ladder's own convention (`approvalTierFor` — ceilings are inclusive), so the value
 * filter and the tier filter cannot disagree about a request sitting exactly on a ceiling.
 */

/** One end of a range, as it arrives from the URL or a form field: `''` means «unbounded». */
export type RangeEnd = string;

/**
 * Is `value` inside the inclusive USD window? An unparseable end is treated as absent rather than
 * as zero — `Number('')` is 0, and a silent 0 floor would look like a working filter while
 * excluding nothing, or (as a ceiling) excluding everything.
 */
export function inValueRange(value: number, min: RangeEnd, max: RangeEnd): boolean {
  const lo = min === '' ? null : Number(min);
  const hi = max === '' ? null : Number(max);
  if (lo != null && Number.isFinite(lo) && value < lo) return false;
  if (hi != null && Number.isFinite(hi) && value > hi) return false;
  return true;
}

/**
 * Is the ISO date inside the inclusive window? ISO dates compare correctly as strings (fixed-width,
 * big-endian), so no Date object is constructed — the parameter was already proven to be a real
 * calendar date by `isIsoDateParam`.
 */
export function inDateRange(iso: string, from: RangeEnd, to: RangeEnd): boolean {
  if (from !== '' && iso < from) return false;
  if (to !== '' && iso > to) return false;
  return true;
}

/**
 * A range whose ends are crossed («من 10M إلى 5M») matches nothing, and that is a user error the
 * screen must NAME rather than answer with «لا صفوف مطابقة» — the two sentences mean different
 * things. Returns true when both ends are present and inverted.
 */
export function rangeInverted(min: RangeEnd, max: RangeEnd): boolean {
  if (min === '' || max === '') return false;
  const lo = Number(min);
  const hi = Number(max);
  return Number.isFinite(lo) && Number.isFinite(hi) && lo > hi;
}

/** The same check for a date window — string comparison, same reason as `inDateRange`. */
export function dateRangeInverted(from: RangeEnd, to: RangeEnd): boolean {
  return from !== '' && to !== '' && from > to;
}
