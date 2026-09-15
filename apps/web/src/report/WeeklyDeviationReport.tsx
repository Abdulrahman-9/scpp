import { METHODS, scheduleCompliancePct, stageByKey, stageDeviationWorkingDays } from '@masaar/scpp-rules';
import { workingDaysBetween } from '@masaar/working-days';
import { useTranslation } from 'react-i18next';
import { resolveSessionOrg } from '../orgIdentity';
import { aboveOwnFA, calendarOf, currentStage, sessionScopedTenders, todayIso, useStore } from '../store';
import { fmtCount, tenderDeviationWd } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { reportStamp } from '../registry/report';
import { useStampWords } from '../registry/useStampWords';
import './report.css';

export default function WeeklyDeviationReport() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);
  // a portfolio-wide report: the company is the SESSION's operating company (the scope the
  // rows were drawn from), resolved from the registries — never a literal
  const org = resolveSessionOrg(state, lang);
  const words = useStampWords();

  // D4 — the rows really are the session's scope now, as the stamp sentence already claimed:
  // an operator session prints ITS company's portfolio; platform roles print everything.
  const tenders = sessionScopedTenders(state);
  const open = tenders.filter((x) => currentStage(x));
  const lateRows = tenders
    .map((x) => ({ tender: x, cur: currentStage(x), dev: tenderDeviationWd(x, today, cal) }))
    .filter((r) => r.cur?.plannedTo && today > r.cur.plannedTo)
    .sort((a, b) => b.dev - a.dev);
  const compliance = scheduleCompliancePct(
    tenders.flatMap((x) => x.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
  );
  const inMct = tenders.filter((x) => aboveOwnFA(state, x) && x.mct);

  // D1 — the promise «يظهر في تقرير الالتزام» honoured: every stage CLOSED late, with the
  // classified reason the closing wizard recorded (rows closed before the record existed say so).
  const reasonRows = tenders
    .flatMap((x) => x.stages
      .filter((s) => s.actualTo && s.plannedTo && stageDeviationWorkingDays(s.plannedTo, s.actualTo, cal) > 0)
      .map((s) => ({ tender: x, stage: s, dev: stageDeviationWorkingDays(s.plannedTo!, s.actualTo!, cal) })))
    .sort((a, b) => b.dev - a.dev);

  const pub = tenders.filter((x) => x.announcement.mode === 'public');
  const annOk = pub.filter((x) => x.announcement.periodDays >= 21).length;
  const annPct = pub.length ? Math.round((annOk / pub.length) * 100) : 100;
  const mctAll = tenders.filter((x) => x.mct?.meetingHeldOn);
  const mctOk = mctAll.filter((x) => workingDaysBetween(x.mct!.notifiedOn, x.mct!.meetingHeldOn!, cal) <= 14).length;
  const mctPct = mctAll.length ? Math.round((mctOk / mctAll.length) * 100) : 100;

  const kpis = [
    { l: t('report.wk_kpiOpen'), v: fmtCount(open.length, lang) },
    { l: t('report.wk_kpiLate'), v: fmtCount(lateRows.length, lang) },
    { l: t('report.wk_kpiCompliance'), v: `${fmtCount(Math.round(compliance), lang)}%` },
    { l: t('report.wk_kpiMct'), v: fmtCount(inMct.length, lang) },
  ];

  /**
   * The stamp (request 7 + methodology م5). This report takes NO filters — it is the whole
   * portfolio, all-time — so the sentence says exactly that rather than being omitted: a printed
   * page that names no scope leaves a reader unable to tell «nothing was excluded» from «nobody
   * said». The row count is the late table's, which is the only table the report tabulates.
   */
  const stamp = reportStamp({
    params: new URLSearchParams(), labels: {}, lang,
    rows: lateRows.length, today, words,
    scope: t('report.wk_scope', { n: fmtCount(tenders.length, lang), org: org.name ?? '—' }),
  });

  return (
    <div className="rp-screen">
      <div className="rp-toolbar">
        <a className="op-btn-ghost" href="#/operator/reports">{t('report.back')}</a>
        <span className="rp-toolbar__title">{t('report.wk_title')}</span>
        <span className="rp-toolbar__spacer" />
        <button className="op-btn-primary" onClick={() => window.print()}><Icon name="printer" size={14} />{t('report.print')}</button>
      </div>

      <div className="rp-page theme-light" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="rp-hdr">
          <img src="/logo.svg" alt="مسار" />
          <div className="rp-hdr__ref">DOC MSR-WKR-{today.replace(/-/g, '')}<br />PORTFOLIO · WEEKLY</div>
        </div>

        <div className="rp-body">
          <div className="rp-titleblock">
            <div>
              <div className="rp-eyebrow">{t('report.wk_eyebrow')}</div>
              <h1 className="rp-h1">{t('report.wk_title')}</h1>
              <p className="rp-p" style={{ marginTop: 4 }}>{t('report.wk_sub')}</p>
            </div>
            <table className="rp-metatbl">
              <tbody>
                <tr><td className="k">{t('report.wk_generated')}</td><td className="v">{today}</td></tr>
                <tr><td className="k">{t('report.operator')}</td><td dir="auto">{org.name ?? '—'}</td></tr>
              </tbody>
            </table>
          </div>

          {/* WYSIWYG law: the printed page carries the same stamped sentence every CSV does */}
          <div className="rp-stamp">{stamp}</div>

          {/* 1 summary KPIs */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">1</span><span className="rp-sec__t">{t('report.wk_sec1')}</span></div>
            <table className="rp-kvtbl">
              <tbody>
                <tr>{kpis.map((k) => <td key={k.l} className="k" style={{ textAlign: 'center' }}>{k.l}</td>)}</tr>
                <tr>{kpis.map((k) => <td key={k.l} className="rp-mono" style={{ textAlign: 'center', fontSize: 18, fontWeight: 600 }}>{k.v}</td>)}</tr>
              </tbody>
            </table>
          </div>

          {/* 2 late tenders */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">2</span><span className="rp-sec__t">{t('report.wk_sec2')}</span></div>
            {lateRows.length === 0 ? (
              <div className="rp-conclusion">{t('report.wk_noLate')}</div>
            ) : (
              <table className="rp-tbl">
                <thead>
                  <tr>
                    <th>{t('report.wk_colTender')}</th>
                    <th>{t('report.wk_colStage')}</th>
                    <th className="c">{t('report.wk_colMethod')}</th>
                    <th className="c">{t('report.wk_colDev')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lateRows.map((r) => (
                    <tr key={r.tender.id}>
                      <td><span dir="auto">{r.tender.title[lang]}</span> <span className="rp-mono" style={{ fontSize: 9.5, color: 'var(--text-3)' }}>{r.tender.code}</span></td>
                      <td>{r.cur ? stageByKey(r.cur.key)?.[lang] : '—'}</td>
                      <td className="c">{METHODS.find((m) => m.id === r.tender.methodId)?.[lang]}</td>
                      <td className="c"><span className={r.dev > 5 ? 'rp-dev--late5' : 'rp-dev--late'}>{t('report.late', { n: fmtCount(r.dev, lang) })} {t('report.wd')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 3 compliance */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">3</span><span className="rp-sec__t">{t('report.wk_sec3')}</span></div>
            <div className="rp-bars">
              {[
                { l: t('report.wk_ann21'), pct: annPct, n: annOk, d: pub.length },
                { l: t('report.wk_mct14'), pct: mctPct, n: mctOk, d: mctAll.length },
              ].map((b, i) => (
                <div key={i} className="rp-bar">
                  <span className="rp-bar__l">{b.l}</span>
                  <span className="rp-bar__track"><span className="rp-bar__fill" style={{ width: `${b.pct}%`, background: b.pct >= 100 ? 'var(--status-done)' : b.pct >= 80 ? 'var(--link)' : 'var(--status-risk)' }} /></span>
                  <span className="rp-bar__v">{fmtCount(b.n, lang)}/{fmtCount(b.d, lang)} · {b.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* 4 documented deviation reasons (D1) — what the closing wizard collected, quoted */}
          <div className="rp-sec rp-sec--avoid">
            <div className="rp-sec__head"><span className="rp-sec__n">4</span><span className="rp-sec__t">{t('report.wk_sec4')}</span></div>
            {reasonRows.length === 0 ? (
              <div className="rp-conclusion">{t('report.wk_noReasons')}</div>
            ) : (
              <table className="rp-tbl">
                <thead>
                  <tr>
                    <th>{t('report.wk_colTender')}</th>
                    <th>{t('report.wk_colStage')}</th>
                    <th className="c">{t('report.wk_colWindow')}</th>
                    <th className="c">{t('report.wk_colDev')}</th>
                    <th>{t('report.wk_colReason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reasonRows.map((r) => (
                    <tr key={`${r.tender.id}-${r.stage.key}`}>
                      <td><span dir="auto">{r.tender.title[lang]}</span> <span className="rp-mono" style={{ fontSize: 9.5, color: 'var(--text-3)' }}>{r.tender.code}</span></td>
                      <td>{stageByKey(r.stage.key)?.[lang] ?? r.stage.key}</td>
                      <td className="c rp-mono" style={{ fontSize: 9.5 }}>{r.stage.actualFrom ?? '—'} → {r.stage.actualTo}</td>
                      <td className="c"><span className={r.dev > 5 ? 'rp-dev--late5' : 'rp-dev--late'}>{t('report.late', { n: fmtCount(r.dev, lang) })} {t('report.wd')}</span></td>
                      <td dir="auto">
                        {r.stage.devReason
                          ? <><b>{t(`wizco.cat_${r.stage.devReason.cat}`)}</b> — {r.stage.devReason.note}</>
                          : <span style={{ color: 'var(--text-3)' }}>{t('report.wk_reasonMissing')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="rp-ftr">
          <span>{t('report.wk_footer')}</span>
          <span className="rp-ftr__ref">SCPP Rev 1.0 · Masaar</span>
        </div>
      </div>
    </div>
  );
}
