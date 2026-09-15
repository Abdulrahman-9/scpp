import { useTranslation } from 'react-i18next';
import { bucketRangeLabel, type CompletionBucket } from '../admin/dashboardDerive';
import { fmtCount } from '../operator/derive';
import './charts.css';

/**
 * (ج) How the contract portfolio is spread across completion — spec §3-د.
 *
 * CSS grid: four upright rectangles. One fill for all four (`--chart-neutral`), deliberately:
 * a green→red ramp would assert a verdict the data does not carry (a contract at 10% may be
 * exactly on plan), and a second navy ramp would read as approval tiers. The bucket is already
 * encoded by position and printed under each column.
 *
 * Height is `count / max(counts)`, not `count / total` — the shape of the distribution is the
 * subject, and dividing by the total flattens every column when the portfolio is large.
 */
export function CompletionHistogram({ buckets, lang }: { buckets: CompletionBucket[]; lang: 'ar' | 'en' }) {
  const { t } = useTranslation();
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);

  return (
    <figure className="ch">
      <figcaption className="ch__cap">
        <span className="ch__t">{t('ch.hist.title')}</span>
        <span className="ch__s">{t('ch.hist.sub')}</span>
      </figcaption>
      <div className="ch-hist">
        {buckets.map((b) => {
          /* The bucket is half-open below, so the neighbouring labels must not both claim the
             boundary: `bucketRangeLabel` prints the last percentage each column actually holds
             (0–24, 25–49, 50–74, 75–100), and the aria sentence below reads the same two numbers. */
          const label = `${bucketRangeLabel(b.key)}%`;
          return (
            <a
              key={b.key}
              className="ch-hist__col"
              data-empty={b.count === 0 ? 'true' : undefined}
              href={`#/admin/contracts?prog=${b.key}`}
              aria-label={t('ch.hist.aria', { from: b.min, to: b.max, n: fmtCount(b.count, lang) })}
            >
              <span className="ch-hist__n">{fmtCount(b.count, lang)}</span>
              <span
                className="ch-hist__bar"
                style={{ blockSize: max > 0 ? `${(b.count / max) * 100}%` : '0%' }}
                aria-hidden="true"
              />
              <span className="ch-hist__l">{label}</span>
            </a>
          );
        })}
      </div>
    </figure>
  );
}
