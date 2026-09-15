import { awardVerdict, isPriceVisible, lowestQualified, METHODS, stageByKey } from '@masaar/scpp-rules';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { operatorName, resolveSessionOrg } from '../orgIdentity';
import { calendarOf, currentStage, evalStepName, expectedAwardDate, todayIso, useStore } from '../store';
import { fmtCount, fmtMoney, stageDevWd, stageViewStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { reportStamp } from '../registry/report';
import { useStampWords } from '../registry/useStampWords';
import './report.css';

type Mask = 'identity' | 'identityPrices' | 'full';

export default function TenderStatusReport({ tenderId }: { tenderId: string }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);
  const words = useStampWords();
  const tender = state.tenders.find((x) => x.id === tenderId);
  // printed on an official document — the company comes from the registries, never a literal.
  // The operator is a property of THIS tender; the session's own company is only the fallback
  // (e.g. an api-mode state where the operator registry is not loaded).
  const operator = operatorName(state, tender?.operatorId, lang) ?? resolveSessionOrg(state, lang).name;

  const ratified = tender?.ratification?.status === 'ratified';
  const [mask, setMask] = useState<Mask>(ratified ? 'full' : 'identity');

  if (!tender) {
    return (
      <div className="rp-screen">
        <a className="op-btn-ghost" href="#/operator/reports">{t('report.back')}</a>
        <div className="op-empty">{t('file.notFound')}</div>
      </div>
    );
  }

  const method = METHODS.find((m) => m.id === tender.methodId);
  const step = evalStepName(tender.evaluationStep);
  const done = tender.stages.filter((s) => s.actualTo).length;
  const cur = currentStage(tender);
  const award = expectedAwardDate(tender);
  const lowest = lowestQualified(tender.bidders);
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, tender.estimatedValueUSD) : null;
  const within = verdict ? verdict.deltaPct <= 20 : false;
  const netDev = tender.stages.filter((s) => s.actualTo).reduce((sum, s) => sum + stageDevWd(s, today, cal), 0);

  const devCell = (wd: number) => {
    if (wd === 0) return <span className="rp-st--muted">—</span>;
    const cls = wd > 5 ? 'rp-dev--late5' : wd > 0 ? 'rp-dev--late' : 'rp-dev--early';
    return <span className={cls}>{wd > 0 ? t('report.late', { n: fmtCount(wd, lang) }) : t('report.early', { n: fmtCount(-wd, lang) })}</span>;
  };
  const netCls = netDev > 5 ? 'rp-dev--late5' : netDev > 0 ? 'rp-dev--late' : 'rp-dev--early';

  /**
   * The stamp (request 7 + methodology م5). This document's scope is ONE tender, and its one
   * governing narrowing is the FAIRNESS MASK (12.4.2) — the setting that decides whether bidder
   * names and prices are on the printed page at all. That is precisely the fact a reader holding
   * a printout needs and cannot recover from the page: two prints of the same tender, one masked
   * and one not, are otherwise indistinguishable documents. It is stamped as a filter because it
   * is one — it removes information from the rows.
   */
  const stamp = reportStamp({
    params: new URLSearchParams([['mask', mask]]),
    labels: { mask: { label: t('report.maskDim'), value: (v) => t(`report.mode_${v}`) } },
    lang,
    rows: tender.stages.length,
    today,
    words,
    scope: t('report.scopeTender', { code: tender.code }),
  });

  const bidderName = (b: (typeof tender.bidders)[number], i: number) => (mask === 'full' ? b.name : t('report.bidderN', { n: fmtCount(i + 1, lang) }));
  const bidderPrice = (b: (typeof tender.bidders)[number]) => {
    if (!isPriceVisible(step, b) || b.priceUSD == null) return { txt: t('report.priceNotOpened'), dir: 'rtl' as const, muted: true };
    if (mask === 'identityPrices') return { txt: t('report.priceMasked'), dir: 'rtl' as const, muted: true };
    return { txt: fmtMoney(b.priceUSD), dir: 'ltr' as const, muted: false };
  };

  return (
    <div className="rp-screen">
      <div className="rp-toolbar">
        <a className="op-btn-ghost" href={`#/operator/t/${tenderId}`}>{t('report.back')}</a>
        <span className="rp-toolbar__title">{t('report.title')}</span>
        <span className="rp-toolbar__spacer" />
        <div className="rp-modeseg" role="group" aria-label={t('report.modeLabel')}>
          {(['identity', 'identityPrices', 'full'] as Mask[]).map((m) => (
            <button key={m} className={`rp-modeseg__btn${mask === m ? ' rp-modeseg__btn--on' : ''}`} onClick={() => setMask(m)}>{t(`report.mode_${m}`)}</button>
          ))}
        </div>
        <button className="op-btn-primary" onClick={() => window.print()}><Icon name="printer" size={14} />{t('report.print')}</button>
      </div>

      <div className="rp-page theme-light" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="rp-hdr">
          <img src="/logo.svg" alt="مسار" />
          <div className="rp-hdr__ref">DOC MSR-RPT-{tender.code.replace(/[^0-9]/g, '').slice(0, 4) || '0000'}<br />TENDER {tender.code}</div>
        </div>

        <div className="rp-body">
          <div className="rp-titleblock">
            <div>
              <div className="rp-eyebrow">{t('report.eyebrow')}</div>
              <h1 className="rp-h1">{t('report.title')}</h1>
            </div>
            <table className="rp-metatbl">
              <tbody>
                <tr><td className="k">{t('report.issueDate')}</td><td className="v">{today}</td></tr>
                <tr><td className="k">{t('report.docStatus')}</td><td style={{ fontWeight: 600, color: cur ? 'var(--status-progress)' : 'var(--status-done)' }}>{cur ? t('status.progress') : t('status.done')}</td></tr>
              </tbody>
            </table>
          </div>

          {/* WYSIWYG law: the printed page carries the same stamped sentence every CSV does */}
          <div className="rp-stamp">{stamp}</div>

          {/* 1 basic data */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">1</span><span className="rp-sec__t">{t('report.sec1')}</span></div>
            <table className="rp-kvtbl">
              <tbody>
                <tr>
                  <td className="k" style={{ width: '18%' }}>{t('report.tenderName')}</td><td style={{ width: '49%' }} dir="auto">{tender.title[lang]}</td>
                  <td className="k" style={{ width: '15%' }}>{t('report.code')}</td><td className="rp-mono" style={{ width: '18%', textAlign: 'start' }}>{tender.code}</td>
                </tr>
                <tr>
                  <td className="k">{t('report.operator')}</td><td dir="auto">{operator ?? '—'}</td>
                  <td className="k">{t('report.method')}</td><td>{method?.[lang]} <span className="rp-mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>(§{method?.scpp})</span></td>
                </tr>
                <tr>
                  <td className="k">{t('report.estCost')}</td><td className="rp-mono" style={{ textAlign: 'start' }}>USD {tender.estimatedValueUSD.toLocaleString('en-US')}</td>
                  <td className="k">{t('report.awardExp')}</td><td className="rp-mono" style={{ textAlign: 'start' }}>{award ?? '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2 summary */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">2</span><span className="rp-sec__t">{t('report.sec2')}</span></div>
            <p className="rp-p">
              {t('report.summaryA', { done: fmtCount(done, lang), total: fmtCount(tender.stages.length, lang) })}
              {cur && <> <b>{stageByKey(cur.key)?.[lang]}</b>{cur.plannedTo && <> {t('report.summaryDue')} <span className="rp-mono">{cur.plannedTo}</span></>}.</>}
              {verdict && <> {t('report.summaryVerdict', { pct: Math.abs(verdict.deltaPct).toFixed(1), rel: verdict.deltaPct <= 0 ? t('report.below') : t('report.above') })} {within ? t('report.summaryWithin') : t('report.summaryOver')}</>}
            </p>
          </div>

          {/* 3 stages */}
          <div className="rp-sec">
            <div className="rp-sec__head"><span className="rp-sec__n">3</span><span className="rp-sec__t">{t('report.sec3')}</span><span className="rp-sec__hint">{t('report.sec3hint')}</span></div>
            <table className="rp-tbl">
              <thead>
                <tr>
                  <th className="c" style={{ width: 30 }}>#</th>
                  <th>{t('report.colStage')}</th>
                  <th className="c">{t('report.colPlanned')}</th>
                  <th className="c">{t('report.colActual')}</th>
                  <th className="c">{t('report.colDev')}</th>
                  <th className="c">{t('report.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {tender.stages.map((s, i) => {
                  const st = stageViewStatus(tender, s, today);
                  const now = st === 'progress' || st === 'delayed';
                  return (
                    <tr key={s.key} className={now ? 'rp-row--now' : undefined}>
                      <td className="c rp-mono" style={{ color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</td>
                      <td style={{ fontWeight: now ? 700 : 400 }}>{stageByKey(s.key)?.[lang] ?? s.key}{now && ` — ${t('report.currentStage')}`}</td>
                      <td className="c rp-mono">{s.plannedFrom && s.plannedTo ? `${s.plannedFrom.slice(5)} → ${s.plannedTo.slice(5)}` : '—'}</td>
                      <td className="c rp-mono">{s.actualTo ? `${(s.plannedFrom ?? s.actualTo).slice(5)} → ${s.actualTo.slice(5)}` : now ? `${(s.plannedFrom ?? '').slice(5)} → …` : '—'}</td>
                      <td className="c">{devCell(stageDevWd(s, today, cal))}</td>
                      <td className={`c ${now ? 'rp-st--now' : st === 'done' ? '' : 'rp-st--muted'}`}>{t(`status.${st}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ marginTop: 6, fontSize: 10.5, color: 'var(--text-3)' }}>{t('report.allDates2026')} {t('report.netDev')} <b className={netCls}>{netDev === 0 ? t('report.onPlan') : netDev > 0 ? t('report.late', { n: fmtCount(netDev, lang) }) : t('report.early', { n: fmtCount(-netDev, lang) })} {t('report.wd')}</b></div>
          </div>

          {/* 4 bidders */}
          {tender.bidders.length > 0 && (
            <div className="rp-sec rp-sec--avoid">
              <div className="rp-sec__head"><span className="rp-sec__n">4</span><span className="rp-sec__t">{t('report.sec4')}</span></div>
              <table className="rp-tbl">
                <thead>
                  <tr>
                    <th>{t('report.colBidder')}</th>
                    <th className="c">{t('report.colDocs')}</th>
                    <th className="c">{t('report.colBond')}</th>
                    <th className="c">{t('report.colTech')}</th>
                    <th className="c">{t('report.colPrice')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tender.bidders.map((b, i) => {
                    const price = bidderPrice(b);
                    const isLow = lowest?.id === b.id;
                    return (
                      <tr key={b.id} className={isLow ? 'rp-row--low' : undefined}>
                        <td style={{ fontWeight: isLow ? 600 : 400 }} dir="auto">{bidderName(b, i)}{isLow && <span className="rp-ok" style={{ fontSize: 9.5, fontWeight: 700 }}> {t('report.lowestTag')}</span>}</td>
                        <td className="c">{b.docsOk ? t('filebidders.docsOk') : <span className="rp-bad">{t('filebidders.docsNo')}</span>}</td>
                        <td className="c">{b.bondOk ? t('filebidders.bondOk') : <span className="rp-bad">{t('filebidders.bondNo')}</span>}</td>
                        <td className={`c ${b.technicalResult === 'fail' ? 'rp-bad' : b.technicalResult === 'pass' ? 'rp-ok' : 'rp-st--muted'}`}>{b.technicalResult === 'pass' ? t('filebidders.techPass') : b.technicalResult === 'fail' ? t('filebidders.techFail') : '—'}</td>
                        <td className={`c ${price.muted ? 'rp-st--muted' : 'rp-mono'}`} style={price.dir === 'ltr' ? { direction: 'ltr' } : undefined}>{price.txt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="rp-note">{mask === 'full' ? t('report.maskNoteFull') : t('report.maskNotePre', { prices: mask === 'identityPrices' ? t('report.andPrices') : '' })}</div>
              {verdict && (
                <div className={`rp-conclusion${within ? '' : ' rp-conclusion--warn'}`}>
                  <b>{t('report.conclusionLabel')}</b> {within ? t('report.conclusionWithin', { pct: Math.abs(verdict.deltaPct).toFixed(1), rel: verdict.deltaPct <= 0 ? t('report.below') : t('report.above') }) : t('report.conclusionOver', { pct: Math.abs(verdict.deltaPct).toFixed(1) })}
                </div>
              )}
            </div>
          )}

          {/* 5 commitments */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">5</span><span className="rp-sec__t">{t('report.sec5')}</span></div>
            <ul className="rp-list">
              <li>{t('report.commit1')}</li>
              <li>{t('report.commit2')}</li>
              <li>{t('report.commit3')}</li>
            </ul>
          </div>

          {/* signatures */}
          <div className="rp-sign">
            <div className="rp-sign__grid">
              {['prepared', 'reviewed', 'approved'].map((role) => (
                <div key={role} className="rp-sign__col">
                  <div className="rp-sign__role">{t(`report.sign_${role}`)}</div>
                  <div className="rp-sign__line"><span className="rp-sign__rule" /><span className="rp-sign__cap">{t('report.signCap')}</span></div>
                </div>
              ))}
              <div className="rp-sign__stamp">{t('report.stamp')}</div>
            </div>
          </div>
        </div>

        <div className="rp-ftr">
          <span>{t('report.footer')}</span>
          <span className="rp-ftr__ref">SCPP Rev 1.0 · Masaar</span>
        </div>
      </div>
    </div>
  );
}
