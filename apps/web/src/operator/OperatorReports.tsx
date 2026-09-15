import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { Icon } from './Icon';

/** Reports launcher — the two A4 report models (RTL, print-ready). */
export default function OperatorReports() {
  const { t } = useTranslation();
  const { state } = useStore();
  const firstTender = state.tenders[0];

  const cards = [
    {
      title: t('opreports.statusTitle'),
      desc: t('opreports.statusDesc'),
      href: firstTender ? `#/operator/t/${firstTender.id}/report` : undefined,
      cta: t('opreports.openStatus'),
    },
    {
      title: t('report.wk_title'),
      desc: t('opreports.weeklyDesc'),
      href: '#/operator/reports/weekly',
      cta: t('opreports.openWeekly'),
    },
  ];

  return (
    <div className="op-page op-page--reports">
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('onav.reports')}</h1>
          <div className="op-page__sub">{t('opreports.sub')}</div>
        </div>
      </div>

      {cards.map((c, i) => (
        <div key={i} className="op-report-card" style={{ marginTop: i ? 14 : 0 }}>
          <div className="op-report-thumb theme-light" aria-hidden="true">
            <div className="op-report-thumb__hd">
              <span style={{ width: 24, height: 8, background: 'var(--primary-900)', borderRadius: 1 }} />
              <span style={{ width: 30, height: 4, background: 'var(--bg-inset)', borderRadius: 1 }} />
            </div>
            <span className="op-report-thumb__ln" style={{ width: '75%', background: 'var(--border-2)' }} />
            <span className="op-report-thumb__ln" />
            <span className="op-report-thumb__ln" style={{ height: 20, background: 'var(--bg-muted)', border: '1px solid var(--border-2)' }} />
            <span className="op-report-thumb__ln" />
            <span className="op-report-thumb__ln" />
          </div>
          <div className="op-report-body">
            <div className="op-report-body__t">{c.title}</div>
            <div className="op-report-body__d">{c.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              {c.href ? (
                <a className="op-btn-primary" href={c.href}><Icon name="printer" size={14} />{c.cta}</a>
              ) : (
                <span className="op-report-note" style={{ marginTop: 0, border: 'none', padding: 0 }}>{t('opreports.statusFromFile')}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
