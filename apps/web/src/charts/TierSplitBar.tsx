import { useTranslation } from 'react-i18next';
import type { TierCounts } from '../admin/dashboardDerive';
import { fmtCount } from '../operator/derive';
import { CHART_TIERS, tierLabelKey } from './tier';
import './charts.css';

/**
 * One stacked track + its key: how a set of tenders divides across the approval ladder.
 *
 * The same rectangles-in-CSS vocabulary as the company bars (§3-ب), reused rather than
 * reinvented — this is the public home page's tier split (request 6), where a ring would be
 * overweight for three numbers and where there is no admin registry to open. Nothing here is a
 * link on purpose: a public visitor has no session, so a «filter the registry» affordance would
 * be a button that cannot do what it says.
 */
export function TierSplitBar({ counts, lang, title }: { counts: TierCounts; lang: 'ar' | 'en'; title: string }) {
  const { t } = useTranslation();
  const total = CHART_TIERS.reduce((s, tier) => s + counts[tier], 0);

  return (
    <figure className="ch">
      <figcaption className="ch__cap">
        <span className="ch__t">{title}</span>
        <span className="ch__s">{t('ch.split.sub', { n: fmtCount(total, lang) })}</span>
      </figcaption>

      <span className="ch-bar__track" aria-hidden="true">
        {total > 0 && CHART_TIERS.map((tier) =>
          counts[tier] > 0 ? (
            <span
              key={tier}
              className="ch-bar__seg"
              data-tier={tier}
              style={{ inlineSize: `${(counts[tier] / total) * 100}%` }}
            />
          ) : null,
        )}
      </span>

      {/* the readout, always printed: colour never carries a number by itself */}
      <ul className="ch-legend">
        {CHART_TIERS.map((tier) => (
          <li key={tier} className="ch-legend__i">
            <span className="ch-legend__sw" data-tier={tier} aria-hidden="true" />
            <span className="ch-legend__l">{t(tierLabelKey(tier))}</span>
            <span className="ch-legend__n">{fmtCount(counts[tier], lang)}</span>
            <span className="ch-legend__p">{fmtCount(total > 0 ? Math.round((counts[tier] / total) * 100) : 0, lang)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
