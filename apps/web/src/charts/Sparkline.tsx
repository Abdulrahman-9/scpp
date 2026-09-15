import { useTranslation } from 'react-i18next';
import type { CompliancePoint } from '../admin/dashboardDerive';
import { fmtCount } from '../operator/derive';
import './charts.css';

/**
 * (د) The schedule-compliance strip — spec §3-هـ.
 *
 * THE LAW THIS COMPONENT ENFORCES: a time series drawn from ONE derivable point is a fabricated
 * trend. Fewer than two points ⇒ the component renders NOTHING and the caller prints the number
 * alone. It is the one chart in this wave that can refuse to exist.
 */

/** Where the last point's mark changes meaning — named, never a magic number in JSX. */
const DONE_AT = 90;
const RISK_AT = 75;

function endColor(pct: number): string {
  if (pct >= DONE_AT) return 'var(--status-done)';
  if (pct >= RISK_AT) return 'var(--status-risk)';
  return 'var(--status-delayed)';
}

const W = 120;
const H = 32;
const PAD = 4; // keeps the 1.5px stroke and the end dot inside the box at 0% and 100%

/** 'YYYY-MM' as a month ordinal — the only arithmetic a month axis needs, and no Date involved. */
const monthOrdinal = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

export function Sparkline({ points, lang }: { points: CompliancePoint[]; lang: 'ar' | 'en' }) {
  const { t } = useTranslation();
  if (points.length < 2) return null;

  /**
   * x is TIME, not array position. `complianceSeries` emits no point for a month that closed no
   * stage, so an index-based axis silently collapses the skipped months and draws March→June as
   * the same step as March→April — a slope the data never had. Positioning by month offset within
   * the covered range restores the true spacing; a skipped month simply leaves a wider gap.
   *
   * The polyline still CONNECTS across that gap (the alternative — breaking the line — reads as
   * «compliance was unknown», which is stronger than what an unmeasured month means: no stage was
   * due, so nothing could be judged). The widened spacing is the honest signal.
   */
  const first = monthOrdinal(points[0]!.month);
  const span = monthOrdinal(points[points.length - 1]!.month) - first;
  // span 0 would mean two points in one month — `complianceSeries` cannot emit that, but a caller
  // could, and a division by zero must not become NaN in an attribute
  const x = (p: CompliancePoint, i: number): number => (span > 0 ? ((monthOrdinal(p.month) - first) / span) * W : (i / (points.length - 1)) * W);
  const y = (pct: number): number => H - PAD - (Math.min(Math.max(pct, 0), 100) / 100) * (H - PAD * 2);
  const path = points.map((p, i) => `${x(p, i).toFixed(1)},${y(p.pct).toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;

  return (
    <div className="ch-sparkwrap">
      {/* The big number is ONE month's measurement, and the KPI tile above the strip carries an
          all-time ratio at the same visual weight. The month is printed under it in the caption
          size, so the two figures are never read as the same statistic disagreeing with itself. */}
      <span className="ch-spark__val">
        <span className="ch-spark__v">{fmtCount(last.pct, lang)}%</span>
        <span className="ch-spark__vm">{last.month}</span>
      </span>
      <span className="ch-spark__plot">
        {/* the drawing is decoration for a number that is already printed: aria-hidden, no grid,
            no fill under the curve (an area would claim a cumulative quantity) */}
        <svg className="ch-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <polyline
            points={path}
            fill="none"
            stroke="var(--text-2)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            // paired with preserveAspectRatio="none": the box stretches, the stroke must not
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={x(last, points.length - 1)} cy={y(last.pct)} r="2.5" fill={endColor(last.pct)} />
        </svg>
        {/*
          لوحة-31 — the time axis, and ONLY its two ends.
          The reference prints six fixed month names under its strip; six labels under a line whose
          point count is whatever `complianceSeries` could measure is a caption that contradicts its
          own drawing the first time a month closes no stage. The two ends are the only labels the
          data always has: they are read straight off `points[0]` and `points.at(-1)`, so the axis
          names the span the polyline actually covers and can never name a month that is not in it.
          It is NOT aria-hidden — unlike the svg it decorates, the opening month is information that
          appears nowhere else on the screen. (`ch-spark__vm` beside the big figure answers a
          different question: which month that ONE percentage belongs to.)
          The strip is an LTR island like every other machine-formatted axis here, so `space-between`
          puts the earlier month at the line's start in both languages — the polyline is drawn
          left-to-right whatever the page direction, and an axis that mirrored would lie about it.
        */}
        <span className="ch-spark__axis">
          <span className="ch-spark__ax">{points[0]!.month}</span>
          <span className="ch-spark__ax">{last.month}</span>
        </span>
      </span>
      <span className="ch-spark__cap">{t('ch.spark.cap', { n: fmtCount(points.length, lang) })}</span>
    </div>
  );
}
