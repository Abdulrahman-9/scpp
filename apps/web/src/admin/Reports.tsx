import { METHODS, scheduleCompliancePct } from '@masaar/scpp-rules';
import { workingDaysBetween } from '@masaar/working-days';
import { StatusPill } from '@masaar/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { buildCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SectionExplainer } from '../registry/SectionExplainer';
import { useStampWords } from '../registry/useStampWords';
import { aboveOwnFA, calendarOf, todayIso, totalDeviationDays, useStore } from '../store';
import { SCOPES } from './dashboardDerive';
import { MinistryListsExplainer } from './MinistryLists';
import { bandCounts, vendorProfiles, type CapacityBand, type VendorProfile } from './vendorReport';

function HBar({ label, value, max, suffix }: { label: string; value: number; max: number; suffix?: string }) {
  return (
    <div className="hbar">
      <span className="hbar__l">{label}</span>
      <span className="hbar__track">
        <span className="hbar__fill" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="mono hbar__v">
        {value}
        {suffix}
      </span>
    </div>
  );
}

/** The bands, in ascending authority — the client's own ladder, reused rather than reinvented. */
const BANDS: CapacityBand[] = ['MDOC', 'JMC', 'OPERATOR', 'none'];

/** Reports (phase 5) — every figure recomputed from state via the engine. */
export default function Reports() {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const today = todayIso();
  const cal = calendarOf(state);
  const words = useStampWords();

  // method distribution
  const dist = METHODS.map((m) => ({ m, n: state.tenders.filter((t) => t.methodId === m.id).length })).filter((x) => x.n > 0);
  const distMax = Math.max(...dist.map((x) => x.n), 1);

  /**
   * Compliance per tender, in the order the LEADERBOARD renders — best-performing first.
   *
   * One array, sorted once, read by both the table and the CSV. The table used to sort a private
   * copy while the export wrote store order, so the file's first row was not the leaderboard's
   * first row: «what the user sees is what is exported» held for the rows but not for their
   * sequence, and a leaderboard is a claim ABOUT sequence.
   */
  const compliance = state.tenders
    .map((t) => ({
      t,
      pct: scheduleCompliancePct(t.stages.filter((s) => s.plannedTo).map((s) => ({ plannedEnd: s.plannedTo!, actualEnd: s.actualTo }))),
      dev: totalDeviationDays(t),
    }))
    .sort((a, b) => b.pct - a.pct);

  // SCPP deadline compliance
  const published = state.tenders.filter((t) => t.announcement.publishedOn && t.announcement.mode === 'public');
  const annOk = published.filter((t) => t.announcement.periodDays >= 21).length;
  const mctCases = state.tenders.filter((t) => aboveOwnFA(state, t) && t.mct?.meetingHeldOn);
  const mctOk = mctCases.filter((t) => workingDaysBetween(t.mct!.notifiedOn, t.mct!.meetingHeldOn!, cal) <= 14).length;

  /**
   * Client request 16 / ق6 — the vendor section. Derived from participation and awards; see
   * vendorReport.ts for why the capacity bands are the approval ladder and not data quantiles.
   */
  const profiles = useMemo(() => vendorProfiles(state), [state]);
  const bands = useMemo(() => bandCounts(profiles), [profiles]);

  /**
   * This screen holds NO filters: it is the portfolio, whole. The stamp says so in the same
   * sentence every filtered export carries («بلا فلاتر») rather than omitting the clause — an
   * absent stamp reads as an oversight, and a reader of a printed page cannot tell the difference
   * between «nothing was removed» and «nobody said».
   */
  const noFilters: FilterLabels = {};
  const stamp = reportStamp({
    params: new URLSearchParams(), labels: noFilters, lang,
    rows: compliance.length, today, words, scope: tr('reports.scopePortfolio'),
  });
  const vendorStamp = reportStamp({
    params: new URLSearchParams(), labels: noFilters, lang,
    rows: profiles.length, today, words, scope: tr('reports.scopeVendors'),
  });

  const csvColumns: ReportColumn<(typeof compliance)[number]>[] = [
    { key: 'code', label: 'code', value: (r) => r.t.code },
    { key: 'title', label: 'title', value: (r) => r.t.title[lang] },
    { key: 'method', label: 'method', value: (r) => r.t.methodId },
    { key: 'valueUSD', label: 'valueUSD', value: (r) => r.t.estimatedValueUSD, format: 'money', total: true },
    { key: 'compliancePct', label: 'compliancePct', value: (r) => r.pct },
    { key: 'deviationDays', label: 'deviationDays', value: (r) => r.dev },
  ];
  const vendorColumns: ReportColumn<VendorProfile>[] = [
    { key: 'name', label: 'vendor', value: (p) => p.vendor.name },
    { key: 'bids', label: 'bids', value: (p) => p.bids },
    { key: 'wins', label: 'wins', value: (p) => p.wins },
    ...SCOPES.map((s): ReportColumn<VendorProfile> => ({ key: `scope_${s}`, label: `scope_${s}`, value: (p) => p.scopes[s] })),
    { key: 'primaryScope', label: 'primaryScopeDerived', value: (p) => p.primary ?? '' },
    { key: 'wonValueUSD', label: 'wonValueUSD', value: (p) => p.wonValueUSD, format: 'money', total: true },
    { key: 'capacityBand', label: 'capacityBandDerived', value: (p) => p.band },
  ];

  /** One download, one stamp per table — the file says which filtered view produced it (م5). */
  const download = (name: string, csv: string) => {
    const a = document.createElement('a');
    // BOM keeps Arabic intact when Excel opens the file
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const exportCompliance = () => download(`masaar-report-${today}.csv`, buildCsv(csvColumns, compliance, stamp));
  const exportVendors = () => download(`masaar-vendor-report-${today}.csv`, buildCsv(vendorColumns, profiles, vendorStamp));

  return (
    <>
      {/* The launcher for the A4 platform-update brief (CLIENT-SHOWCASE-SPEC §1). It sits at the
          TOP of this screen because it is the only document here that is read end to end rather
          than queried, and because the brief is the one surface that explains the others. */}
      <section className="card">
        <div className="lab-headlike">
          <h2>{tr('reports.briefTitle')}</h2>
          <a className="op-btn-primary" href="#/admin/reports/update-brief">
            <Icon name="doc" size={14} />{tr('reports.briefOpen')}
          </a>
        </div>
        <p className="hint">{tr('reports.briefDesc')}</p>
      </section>

      <section className="card">
        <div className="lab-headlike">
          <h2>{tr('reports.title')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <button className="op-btn-secondary" onClick={exportCompliance}>{tr('reports.csv')}</button>
            <button className="op-btn-secondary" onClick={() => window.print()}>{tr('reports.print')}</button>
          </div>
        </div>
        <p className="hint">{tr('reports.hint')}</p>
        {/* The stamp is part of the PRINTED page, not toolbar chrome: `window.print()` prints this
            document, so the sentence has to live in it (methodology م5 debt, request 7). */}
        <div className="reg-stamp">{stamp}</div>

        <div className="g-label">{tr('reports.dist')}</div>
        <div className="hbars">
          {dist.map(({ m, n }) => (
            <HBar key={m.id} label={`${String(m.id).padStart(2, '0')} — ${lang === 'ar' ? m.ar : m.en}`} value={n} max={distMax} />
          ))}
        </div>

        <div className="g-label" style={{ marginTop: 22 }}>{tr('reports.deadlines')}</div>
        <div className="hbars">
          <HBar label={tr('reports.ann21')} value={annOk} max={Math.max(published.length, 1)} suffix={`/${published.length}`} />
          <HBar label={tr('reports.mct14')} value={mctOk} max={Math.max(mctCases.length, 1)} suffix={`/${mctCases.length}`} />
        </div>
      </section>

      <section className="card">
        <h2>{tr('reports.leaderboard')}</h2>
        <table className="dtable">
          <thead>
            <tr>
              <th>{tr('admin.code')}</th>
              <th>{tr('admin.titleCol')}</th>
              <th>{tr('reports.compliance')}</th>
              <th>{tr('operator.deviationDays')}</th>
            </tr>
          </thead>
          <tbody>
            {/* the SAME array the CSV writes — no private re-sort, or the two orders drift */}
            {compliance.map(({ t, pct, dev }) => (
              <tr key={t.id}>
                <td className="mono">{t.code}</td>
                <td>{t.title[lang]}</td>
                <td>
                  <StatusPill status={pct >= 90 ? 'done' : pct >= 60 ? 'risk' : 'delayed'}>
                    <span className="mono">{pct}%</span>
                  </StatusPill>
                </td>
                <td className="mono">{dev > 0 ? `+${dev}` : dev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ------------------------------------------------------------------ *
       * Client request 16 (ق6) — vendor specialization + financial capacity
       * ------------------------------------------------------------------ */}
      <section className="card">
        <div className="lab-headlike">
          <h2>{tr('reports.vendorTitle')}</h2>
          <div className="row" style={{ gap: 8 }}>
            <button className="op-btn-secondary" onClick={exportVendors} disabled={profiles.length === 0}>{tr('reports.vendorCsv')}</button>
          </div>
        </div>
        {/* The caveat is not a footnote: ق6 is an OPEN decision, and the column header would
            otherwise read as an official classification the ministry has not issued. */}
        <p className="hint">{tr('reports.vendorCaveat')}</p>
        <div className="reg-stamp">{vendorStamp}</div>

        <SectionExplainer title={tr('reports.vendorExplainTitle')}>
          <p>{tr('reports.vendorExplainScope')}</p>
          <p>{tr('reports.vendorExplainBands', {
            op: fmtMoney(state.approvalTiers.operatorMaxUSD),
            jmc: fmtMoney(state.approvalTiers.jmcMaxUSD),
          })}</p>
          <p>{tr('reports.vendorExplainName')}</p>
        </SectionExplainer>

        {/* ق5 — this table names both ministry registers in its columns, so the disclosure that
            tells them apart travels with it */}
        <MinistryListsExplainer />

        <div className="g-label" style={{ marginTop: 18 }}>{tr('reports.bandsLabel')}</div>
        <div className="hbars">
          {BANDS.map((b) => (
            <HBar
              key={b}
              label={tr(`reports.band.${b}`)}
              value={bands[b]}
              max={Math.max(profiles.length, 1)}
              suffix={`/${profiles.length}`}
            />
          ))}
        </div>

        {profiles.length === 0 ? (
          <p className="hint" style={{ marginTop: 16 }}>{tr('reports.vendorEmpty')}</p>
        ) : (
          <table className="dtable" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>{tr('vendors.name')}</th>
                <th>{tr('reports.colBids')}</th>
                {SCOPES.map((s) => <th key={s}>{tr(`compliance.scope.${s}`)}</th>)}
                <th>{tr('reports.colPrimary')}</th>
                <th>{tr('reports.colWonValue')}</th>
                <th>{tr('reports.colBand')}</th>
                <th>{tr('vendors.mooChip')}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.vendor.id}>
                  <td>
                    <span dir="auto">{p.vendor.name}</span>
                    {p.vendor.isStateCompany && (
                      <span className="ent-state" style={{ marginInlineStart: 6 }} title={tr('vendors.stateDef')}>{tr('vendors.stateTag')}</span>
                    )}
                  </td>
                  <td className="mono">{fmtCount(p.bids, lang)}</td>
                  {SCOPES.map((s) => (
                    <td key={s} className="mono">
                      {p.scopes[s] === 0 ? <span className="hint">—</span> : fmtCount(p.scopes[s], lang)}
                    </td>
                  ))}
                  <td>
                    {/* a TIE prints «غير محدَّد»: naming one of two equal scopes would invent a
                        preference the participation record does not contain */}
                    {p.primary ? tr(`compliance.scope.${p.primary}`) : <span className="hint">{tr('reports.primaryNone')}</span>}
                  </td>
                  <td className="mono">{p.wonValueUSD === 0 ? <span className="hint">—</span> : fmtMoney(p.wonValueUSD)}</td>
                  <td>
                    <StatusPill status={p.band === 'none' ? 'planned' : p.band === 'MDOC' ? 'done' : 'progress'}>
                      {tr(`reports.band.${p.band}`)}
                    </StatusPill>
                  </td>
                  <td>{p.vendor.mooListed ? tr('vendors.mooYes') : <span className="hint">{tr('vendors.mooNo')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
