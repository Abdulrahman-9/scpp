import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAmountParam, isIsoDateParam } from './useHashParams';
import './registry.css';

/**
 * Registry layer (phase 4, client request 7) — the «من … إلى …» pair, for money and for dates.
 *
 * One control, two ends, ONE dimension: it renders as a single labelled group so a reader sees a
 * range rather than two unrelated inputs, and each end writes its own URL parameter the moment it
 * is COMMITTED — which is what keeps the address, the table, the counts and the export stamp the
 * same fact (§5-ج). Empty end = unbounded, never zero.
 *
 * COMMIT-ON-BLUR/ENTER, not on keystroke (phase-4 fix). Writing the address on every `onChange`
 * meant typing `5000000` pushed SEVEN history entries and re-filtered the table seven times, the
 * last six of them against numbers the reader never meant: `5`, `50`, `500`… Back became unusable
 * — one press returned to `500000`, not to the view before the filter. Worse, each intermediate
 * value was a legitimate bound, so the stamp and the row count truthfully described a window
 * nobody had asked for. The draft therefore lives in local state while typing and reaches the URL
 * once, on blur or Enter: one deliberate act, one history entry, one narrowing.
 *
 * The committed value stays the source of truth. When it moves without this control — a KPI tile,
 * Back, «أزل كل المرشّحات» — the box follows it, because the draft re-seeds from it.
 *
 * A draft that cannot BE a bound (not a plain amount, not a real calendar date) is not committed
 * at all, and the end says «قيمة غير صالحة» beside itself in the same `wz-gate` voice every other
 * refusal in the product uses. Silently wiping it, or writing it and letting the reader wonder why
 * the registry did not move, are the two dishonest alternatives.
 *
 * Money ends are `type="number"` with a zero floor (a negative USD window has no meaning here);
 * date ends are the native date widget, whose displayed digits follow the browser locale — the
 * documented Track-0 exclusion the rest of the app already carries for `<input type="date">`.
 * The VALUE stored and stamped is always the Latin ISO / plain-amount string.
 */
export interface RangeFilterProps {
  kind: 'money' | 'date';
  /** the dimension, already translated («القيمة التقديرية»، «تاريخ الإنشاء») */
  label: string;
  min: string;
  max: string;
  onMin: (v: string) => void;
  onMax: (v: string) => void;
  /** the two ends are crossed — the group says so instead of silently listing nothing */
  inverted?: boolean;
  /** id prefix, so the two labels bind to the two inputs on a screen holding several ranges */
  id: string;
}

/** Is this draft something the URL contract would accept as a bound? An empty end is unbounded. */
function acceptable(kind: 'money' | 'date', draft: string): boolean {
  if (draft === '') return true;
  return kind === 'money' ? isAmountParam(draft) : isIsoDateParam(draft);
}

interface EndProps {
  id: string;
  kind: 'money' | 'date';
  cap: string;
  /** the COMMITTED bound — what the address currently holds */
  value: string;
  onCommit: (v: string) => void;
  inverted?: boolean;
}

function RangeEnd({ id, kind, cap, value, onCommit, inverted }: EndProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  // the committed value is the source of truth: when it moves for any reason other than this box
  // (a link, Back, a cleared filter), the box follows it
  useEffect(() => { setDraft(value); }, [value]);

  const ok = acceptable(kind, draft);
  const commit = () => { if (ok && draft !== value) onCommit(draft); };

  return (
    <label className="reg-range__end" htmlFor={id}>
      <span className="reg-range__cap">{cap}</span>
      <input
        id={id}
        className={`reg-range__in${kind === 'money' ? ' reg-range__in--num' : ''}`}
        type={kind === 'money' ? 'number' : 'date'}
        {...(kind === 'money' ? { min: 0, step: 100_000, inputMode: 'numeric' as const } : { max: '9999-12-31' })}
        value={draft}
        aria-invalid={!ok || inverted || undefined}
        aria-describedby={ok ? undefined : `${id}-bad`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
      />
      {!ok && <span id={`${id}-bad`} className="wz-gate reg-range__bad">{t('reg.range.invalid')}</span>}
    </label>
  );
}

export function RangeFilter({ kind, label, min, max, onMin, onMax, inverted, id }: RangeFilterProps) {
  const { t } = useTranslation();
  return (
    <div className={`reg-range${inverted ? ' reg-range--bad' : ''}`} role="group" aria-label={label}>
      <span className="reg-range__l">{label}</span>
      <RangeEnd id={`${id}-min`} kind={kind} cap={t('reg.range.from')} value={min} onCommit={onMin} inverted={inverted} />
      <RangeEnd id={`${id}-max`} kind={kind} cap={t('reg.range.to')} value={max} onCommit={onMax} inverted={inverted} />
      {inverted && <span className="reg-range__warn">{t('reg.range.inverted')}</span>}
    </div>
  );
}
