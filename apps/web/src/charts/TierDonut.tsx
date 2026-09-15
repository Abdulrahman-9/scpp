import type { ApprovalTier } from '@masaar/scpp-rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TierCounts } from '../admin/dashboardDerive';
import { fmtCount } from '../operator/derive';
import { CHART_TIERS, TIER_FILL, tierHref, tierLabelKey } from './tier';
import './charts.css';

/**
 * (ب) The approval ladder as a ring — spec §3-ج. SVG, because arcs have no CSS equivalent that
 * does not degrade.
 *
 * Geometry is `stroke-dasharray` on one `<circle>` per segment; no path arithmetic:
 *   r = 54 ⇒ C = 2πr = 339.292…   ·   dasharray = «len (C − len)»   ·   dashoffset = −C·cumulative
 */
export const DONUT_R = 54;
export const DONUT_C = 2 * Math.PI * DONUT_R;
/** the arc units subtracted from each segment to open a gap between neighbours (≈3.2°) */
export const DONUT_GAP = 3;
/**
 * The shortest arc a non-zero band may be drawn as (≈2.1°, roughly the stroke's own width).
 *
 * Without it the naive `C·fraction − gap` goes to zero at a share of ~0.884% and NEGATIVE below
 * it, so a band holding real requests rendered no arc at all while the legend beside it printed
 * its count — the ring said «none» and the list said «one», about the same rows. A band that
 * exists is visible; the length it borrows is repaid out of the bands that can spare it, so the
 * ring still closes exactly.
 */
export const DONUT_MIN_ARC = 2;

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface DonutSegment {
  value: number;
  fraction: number;
  /** drawn arc length, gap already subtracted */
  len: number;
  /** the `stroke-dashoffset` that rotates this segment to its place */
  offset: number;
}

/**
 * The ring's arithmetic, pure and testable.
 *
 * Three edge rules that the naive formula gets wrong:
 *   · ONE non-zero segment ⇒ the gap is dropped, or a full ring shows a slit where nothing ends;
 *   · a zero segment produces `len = 0` and the caller emits NO `<circle>` for it — with a gap
 *     subtracted, an empty segment would otherwise draw a negative-length dash, and with
 *     `stroke-linecap: round` it would print a dot that is not data;
 *   · a non-zero segment too small to survive the gap subtraction is raised to `DONUT_MIN_ARC`
 *     and the borrowed length is taken back PROPORTIONALLY from the segments that can spare it,
 *     so the drawn arcs still sum to exactly `C − drawn·gap` and the ring closes on itself.
 *
 * The offsets are accumulated from the DRAWN lengths (plus one gap each), not from the raw
 * fractions: for an unadjusted segment `len + gap === C·fraction`, so the two agree to the last
 * decimal, and for an adjusted one the accumulation is what keeps every gap the same width.
 */
export function donutGeometry(values: readonly number[], gap = DONUT_GAP): { total: number; segs: DonutSegment[] } {
  const total = values.reduce((s, v) => s + v, 0);
  const drawn = values.filter((v) => v > 0).length;
  const g = drawn <= 1 ? 0 : gap;
  const fractions = values.map((v) => (total > 0 ? v / total : 0));

  // the true arc of each band, gap already conceded — deliberately NOT clamped at zero, because
  // the deficit a sub-minimum band runs up is exactly what the rebalance below has to repay
  const raw = values.map((v, i) => (v > 0 ? DONUT_C * fractions[i]! - g : 0));
  const lens = raw.map((l) => Math.max(0, l));

  if (drawn > 1) {
    const owed = raw.map((l, i) => (values[i]! > 0 && l < DONUT_MIN_ARC ? DONUT_MIN_ARC - l : 0));
    const deficit = owed.reduce((s, v) => s + v, 0);
    // only the bands ALREADY above the minimum can lend; with three bands the lender always has
    // far more than the ≤10 units two starved neighbours can ask for, so nothing inverts. The
    // guard covers a hypothetical wider ring where it could, by leaving the arcs unadjusted.
    const spare = raw.reduce((s, l, i) => s + (values[i]! > 0 && owed[i] === 0 ? l : 0), 0);
    if (deficit > 0 && spare > deficit) {
      for (let i = 0; i < lens.length; i += 1) {
        if (values[i]! <= 0) continue;
        lens[i] = owed[i]! > 0 ? DONUT_MIN_ARC : raw[i]! - deficit * (raw[i]! / spare);
      }
    }
  }

  let cum = 0;
  const segs = values.map((value, i): DonutSegment => {
    const seg: DonutSegment = { value, fraction: fractions[i]!, len: lens[i]!, offset: -cum };
    if (value > 0) cum += lens[i]! + g;
    return seg;
  });
  return { total, segs };
}

export function TierDonut({ counts, lang, sub }: { counts: TierCounts; lang: 'ar' | 'en'; sub: string }) {
  const { t } = useTranslation();
  // the two-way highlight: hovering a legend row lights its arc, hovering an arc lights its row
  const [hot, setHot] = useState<ApprovalTier | null>(null);
  const values = CHART_TIERS.map((tier) => counts[tier]);
  const { total, segs } = donutGeometry(values);

  return (
    <figure className="ch ch--donut">
      <figcaption className="ch__cap">
        <span className="ch__t">{t('ch.donut.title')}</span>
        <span className="ch__s">{sub}</span>
      </figcaption>

      <div className="ch-donut">
        {/* a pure drawing: aria-hidden, no role="img" (which would hide the clickable arcs from
            the accessibility tree entirely) and no tabindex — the legend below is the keyboard path */}
        <svg className="ch-donut__svg" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
          <circle cx="80" cy="80" r={DONUT_R} fill="none" stroke="var(--chart-track)" strokeWidth="22" />
          {CHART_TIERS.map((tier, i) => {
            const seg = segs[i]!;
            if (seg.len <= 0) return null;
            const href = tierHref(tier);
            return (
              <circle
                key={tier}
                className={`ch-donut__seg${href ? ' ch-donut__seg--link' : ''}${hot === tier ? ' ch-donut__seg--hot' : ''}`}
                cx="80"
                cy="80"
                r={DONUT_R}
                fill="none"
                stroke={TIER_FILL[tier]}
                strokeWidth="22"
                strokeLinecap="butt"
                strokeDasharray={`${round2(seg.len)} ${round2(DONUT_C - seg.len)}`}
                strokeDashoffset={round2(seg.offset)}
                transform="rotate(-90 80 80)"
                onMouseEnter={() => setHot(tier)}
                onMouseLeave={() => setHot(null)}
                // a pointer shortcut only; the same destination is a real link in the legend
                onClick={href ? () => { window.location.hash = href; } : undefined}
              />
            );
          })}
        </svg>
        <div className="ch-donut__center">
          <span className="ch-donut__n">{fmtCount(total, lang)}</span>
          <span className="ch-donut__l">{t('ch.donut.unit')}</span>
        </div>
      </div>

      <ul className="ch-legend">
        {CHART_TIERS.map((tier, i) => {
          const seg = segs[i]!;
          const href = tierHref(tier);
          const label = t(tierLabelKey(tier));
          const pct = `${fmtCount(Math.round(seg.fraction * 100), lang)}%`;
          const body = (
            <>
              <span className="ch-legend__sw" data-tier={tier} aria-hidden="true" />
              <span className="ch-legend__l">{label}</span>
              <span className="ch-legend__n">{fmtCount(seg.value, lang)}</span>
              <span className="ch-legend__p">{pct}</span>
            </>
          );
          // ط1 opens no approval gate, so it has no chain to open — it stays an inert row rather
          // than pointing at a registry that structurally cannot hold it (`tier.ts:42-44`).
          //
          // لوحة-28 — that inertness is now READABLE instead of merely true. The reference makes
          // all three bands clickable; we keep ours inert (the destination does not exist) and pay
          // for it in explanation: the row never turns the cursor into a pointer, it carries the
          // reason as a hover `title`, and the same sentence is PRINTED under the legend — because
          // a browser tooltip is unreachable by touch and by keyboard, so it may add the reason but
          // may never be the only place the reason lives.
          return href ? (
            <li key={tier}>
              <a
                className={`ch-legend__i${hot === tier ? ' ch-legend__i--hot' : ''}`}
                href={href}
                aria-label={t('ch.donut.aria', { label, n: fmtCount(seg.value, lang), pct })}
                onMouseEnter={() => setHot(tier)}
                onMouseLeave={() => setHot(null)}
                onFocus={() => setHot(tier)}
                onBlur={() => setHot(null)}
              >
                {body}
              </a>
            </li>
          ) : (
            <li key={tier} className="ch-legend__i ch-legend__i--inert" title={t('ch.donut.inert')}>{body}</li>
          );
        })}
      </ul>

      {/* the one thing the ring cannot draw: WHY its first band opens nothing */}
      <p className="ch__note ch-donut__note">{t('ch.donut.inert')}</p>
    </figure>
  );
}
