import { useTranslation } from 'react-i18next';
import type { CompanyStat, TenderPart } from '../admin/dashboardDerive';
import { TENDER_PARTS } from '../admin/dashboardDerive';
import { fmtCount, fmtMoneyShort } from '../operator/derive';
import { orgName } from '../orgIdentity';
import './charts.css';

/**
 * (أ) Tenders per operating company — spec §3-ب.
 *
 * CSS grid, not SVG: these are rectangles on one axis, and an SVG rect cannot be a link a
 * keyboard reaches, forces text measurement for the labels, and fights RTL for nothing.
 *
 * Every one of the twelve companies is drawn, including the ones that have raised nothing:
 * dropping a zero row would tell the reader the fleet is smaller than it is. A company with no
 * tenders shows an empty track and «—» where its value would be.
 *
 * The whole track is `aria-hidden`; the numbers reach assistive tech through the row link's
 * label, which is a TRANSLATED sentence with interpolated figures — never assembled from
 * fragments in JSX, where the two languages would drift.
 */
export function CompanyBars({ rows, lang }: { rows: CompanyStat[]; lang: 'ar' | 'en' }) {
  const { t } = useTranslation();
  // bar length is a share of the BIGGEST portfolio, so the rows compare as well as compose;
  // the internal split then reads as the lifecycle mix inside that length
  const max = rows.reduce((m, r) => Math.max(m, r.tenders), 0);

  return (
    <figure className="ch">
      <figcaption className="ch__cap">
        <span className="ch__t">{t('ch.bars.title')}</span>
        <span className="ch__s">{t('ch.bars.sub', { n: fmtCount(rows.length, lang) })}</span>
      </figcaption>

      <ul className="ch-bars">
        {rows.map((r) => {
          const name = orgName(r.op, lang);
          return (
            <li key={r.op.id}>
              <a
                className="ch-bar"
                href={`#/admin/tenders?op=${encodeURIComponent(r.op.id)}`}
                aria-label={t('ch.bars.aria', {
                  name,
                  n: fmtCount(r.tenders, lang),
                  value: r.valueUSD > 0 ? fmtMoneyShort(r.valueUSD) : t('ch.none'),
                  active: fmtCount(r.parts.active, lang),
                  completed: fmtCount(r.parts.completed, lang),
                  halted: fmtCount(r.parts.halted, lang),
                })}
              >
                <span className="ch-bar__name" dir="auto">{name}</span>
                <span className="ch-bar__track" aria-hidden="true">
                  {max > 0 && TENDER_PARTS.map((part: TenderPart) =>
                    // a zero part emits no element at all — a 0%-wide <span> would still show
                    // its 3px minimum and invent a segment that is not there
                    r.parts[part] > 0 ? (
                      <span
                        key={part}
                        className="ch-bar__seg"
                        data-part={part}
                        style={{ inlineSize: `${(r.parts[part] / max) * 100}%` }}
                      />
                    ) : null,
                  )}
                </span>
                <span className="ch-bar__n">{fmtCount(r.tenders, lang)}</span>
                <span className="ch-bar__v">{r.valueUSD > 0 ? fmtMoneyShort(r.valueUSD) : t('ch.none')}</span>
              </a>
            </li>
          );
        })}
      </ul>

      {/* colour never carries meaning alone: this key names each mark, and every row prints its
          own numbers. aria-hidden because the row labels already say it in words. */}
      <ul className="ch-legend ch-legend--inline" aria-hidden="true">
        {TENDER_PARTS.map((part) => (
          <li key={part} className="ch-legend__i">
            <span className="ch-legend__sw" data-part={part} />
            <span className="ch-legend__l">{t(`ch.part.${part}`)}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
