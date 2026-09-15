import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DevChip } from '../operator/DevChip';
import { fmtCount, tenderStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { EmptyState } from '../registry/EmptyState';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SectionExplainer } from '../registry/SectionExplainer';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useFilterParams } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { calendarOf, todayIso, useStore } from '../store';
import { useAdminUi } from './AdminShell';
import { stageLabel } from './contractDerive';
import {
  allTimeSchedulePct, contractScheduleRows, scheduleKpis, tenderScheduleRows,
  type ContractScheduleRow, type ScheduleStatus, type TenderScheduleRow,
} from './scheduleDerive';

/**
 * Each schedule verdict maps onto the CLOSED status vocabulary — colour is information, never
 * decoration (DESIGN). `unplanned` takes «planned» (the neutral grey) rather than a warning tint:
 * a missing plan is an absence of measurement, not a breach.
 */
const PILL: Record<ScheduleStatus, 'done' | 'delayed' | 'progress' | 'planned'> = {
  onTime: 'done',
  late: 'delayed',
  ahead: 'progress',
  unplanned: 'planned',
};

/**
 * «الامتثال الزمني» — `#/admin/schedule` (client request 10).
 *
 * This is the registry the follow-up room's «الالتزام بالجداول» tile had no destination for in
 * phase 3: a percentage has no rows, so the tile was left deliberately inert and said so. It has
 * rows now — planned against actual, request by request and contract by contract — so the tile
 * became a link to it, and the explainer below states exactly which window each figure measures.
 *
 * The closure is only real if the two surfaces agree, so the header strip opens with the tile's
 * OWN figure, from the tile's own call (`allTimeSchedulePct`): «الالتزام بالجداول — منذ البداية»,
 * portfolio-wide and filter-independent, beside the four filtered windows this screen measures.
 * One predicate, two surfaces; a test pins the two numbers equal.
 *
 * NOT the legacy §9 screen (`#/admin/compliance`), which answers local content and §12.2
 * nominations. Two different subjects that shared one English word; they no longer share a screen.
 */
export default function Schedule() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const cal = useMemo(() => calendarOf(state), [state]);
  const words = useStampWords();

  const [q, setQ] = useState('');
  const f = useFilterParams();
  const opFilter = f.get('op', state.operators.map((o) => o.id));
  const statusFilter = f.get('status');

  const allTenderRows = useMemo(() => tenderScheduleRows(state, today, cal), [state, today, cal]);
  const allContractRows = useMemo(() => contractScheduleRows(state, today), [state, today]);

  const qn = q.trim().toLowerCase();
  /**
   * The `?status=` vocabulary is the SAME one every other registry uses (`tenderStatus`), not this
   * screen's own on-time/late/ahead verdict — a link that says `status=delayed` must mean the same
   * rows here as it does in `#/admin/tenders`. The two agree by construction for an open request
   * (a stage past its planned close is exactly what both call late); the pill column shows the
   * schedule verdict, which additionally distinguishes «ahead» and «unplanned».
   */
  // everything EXCEPT the status chips — the chip counts read off this set, so a chip never
  // promises rows the company filter or the search has already removed
  const searched = useMemo(() => allTenderRows.filter((r) => {
    if (opFilter && r.tender.operatorId !== opFilter) return false;
    if (qn && !(`${r.tender.code} ${r.tender.title.ar} ${r.tender.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [allTenderRows, opFilter, qn]);

  const rows = useMemo(() => searched.filter((r) => {
    if (!statusFilter) return true;
    const st = tenderStatus(r.tender, today, cal);
    return statusFilter === 'open' ? r.open : st === statusFilter;
  }), [searched, statusFilter, today, cal]);

  const contractRows = useMemo(() => allContractRows.filter((r) => {
    if (qn && !(`${r.contract.code} ${r.contract.title.ar} ${r.contract.title.en} ${r.contract.contractorName}`.toLowerCase().includes(qn))) return false;
    // a contract carries no operator key of its own; it is attributed through its originating
    // tender, so an operator filter narrows it only when that link exists (dashboardDerive)
    if (opFilter) {
      const src = r.contract.tenderId ? state.tenders.find((x) => x.id === r.contract.tenderId) : undefined;
      if (src?.operatorId !== opFilter) return false;
    }
    return true;
  }), [allContractRows, opFilter, qn, state.tenders]);

  const kpis = useMemo(() => scheduleKpis(rows), [rows]);
  const contractsBehind = contractRows.filter((r) => r.status === 'late').length;

  const compare = useMemo(() => ({
    tender: arCompare<TenderScheduleRow>((r) => r.tender.title[lang]),
    dev: (a: TenderScheduleRow, b: TenderScheduleRow) => a.devWd - b.devWd,
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  const operatorName = (id: string) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : id;
  };

  /**
   * The three narrowings this SCREEN carries. The chip row is generated from all of them, because
   * all three are controls a reader can see and dismiss here.
   *
   * The two STAMPS are cut from this map, and they are deliberately not the same cut — see below.
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    op: { label: t('reg.stamp.dim.op'), value: operatorName },
    status: { label: t('reg.stamp.dim.status'), value: (v) => (v === 'open' ? t('reg.atenders.chipOpen') : t(`status.${v}`)) },
  };
  /** what narrows the TENDER table: search, company, status */
  const tenderParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opFilter) p.set('op', opFilter);
    if (statusFilter) p.set('status', statusFilter);
    return p;
  }, [q, qn, opFilter, statusFilter]);
  /**
   * What narrows the CONTRACT table: search and company — and NOT status.
   *
   * `?status=` carries the `tenderStatus` vocabulary (progress/risk/delayed/done/open), which no
   * contract row has: `contractRows` never reads it, and it must not, because a contract's verdict
   * is measured in percentage points of completed stages, not in that vocabulary. The old single
   * stamp named it anyway and counted both tables, so a contracts export claimed a narrowing that
   * had removed nothing from it. The rule is stated rather than fudged: status applies to tenders
   * only, so it is absent from this stamp AND the contract panel says so on screen while it is on.
   */
  const contractParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opFilter) p.set('op', opFilter);
    return p;
  }, [q, qn, opFilter]);

  const tenderStamp = reportStamp({
    params: tenderParams, labels, lang, rows: sorted.length, today, words,
    scope: t('sched.scopeTenders', { n: fmtCount(sorted.length, lang) }),
  });
  const contractStamp = reportStamp({
    params: contractParams, labels, lang, rows: contractRows.length, today, words,
    scope: t('sched.scopeContracts', { n: fmtCount(contractRows.length, lang) }),
  });

  const activeChips = activeFilterChips(tenderParams, labels, lang, (name) => {
    if (name === 'q') setQ(''); else f.set(name as 'op', '');
  });
  const clearFilters = () => { setQ(''); f.clear(); };

  /**
   * The header figure the follow-up room's tile links here to decompose — the SAME
   * `allTimeSchedulePct(state)` call that tile makes, so the two screens print one number.
   *
   * It sits FIRST and carries its own window line, because it is the odd one in this strip: it is
   * portfolio-wide and all-time, and the four beside it count the FILTERED rows of the table below
   * on each request's current stage. The explainer states that difference in words; the window
   * line states it without opening the explainer.
   */
  const allTimePct = useMemo(() => allTimeSchedulePct(state), [state]);

  const kpiTiles: { l: string; v: string; tone?: string; hint?: string; win?: string }[] = [
    {
      l: t('sched.kpiAllTime'), v: `${fmtCount(allTimePct, lang)}%`,
      win: t('sched.kpiAllTimeWin'), hint: t('sched.kpiAllTimeHint'),
    },
    { l: t('sched.kpiOnTime'), v: fmtCount(kpis.onTime, lang), tone: 'var(--status-done)' },
    { l: t('sched.kpiLate'), v: fmtCount(kpis.late, lang), tone: kpis.late > 0 ? 'var(--status-delayed)' : undefined },
    // «—» rather than a 0 that would read as perfect compliance over an unmeasurable portfolio
    { l: t('sched.kpiAvg'), v: kpis.avgDevWd == null ? '—' : `${kpis.avgDevWd > 0 ? '+' : ''}${fmtCount(kpis.avgDevWd, lang)}`, tone: (kpis.avgDevWd ?? 0) > 0 ? 'var(--status-delayed)' : undefined, hint: t('sched.kpiAvgHint', { n: fmtCount(kpis.measured, lang) }) },
    { l: t('sched.kpiContracts'), v: fmtCount(contractsBehind, lang), tone: contractsBehind > 0 ? 'var(--status-delayed)' : undefined },
  ];

  const csvColumns: ReportColumn<TenderScheduleRow>[] = [
    { key: 'code', label: 'code', value: (r) => r.tender.code },
    { key: 'title', label: 'title', value: (r) => r.tender.title[lang] },
    { key: 'operator', label: 'operator', value: (r) => (r.tender.operatorId ? operatorName(r.tender.operatorId) : '') },
    { key: 'stage', label: 'stage', value: (r) => r.stage?.key ?? '' },
    { key: 'stageOpen', label: 'stageOpen', value: (r) => String(r.open) },
    { key: 'plannedTo', label: 'plannedTo', value: (r) => r.plannedTo ?? '', format: 'date' },
    { key: 'actualTo', label: 'actualTo', value: (r) => r.actualTo ?? '', format: 'date' },
    { key: 'stageDeviationWd', label: 'stageDeviationWd', value: (r) => r.devWd },
    { key: 'tenderDeviationWd', label: 'tenderDeviationWd', value: (r) => r.tenderDevWd },
    { key: 'scheduleStatus', label: 'scheduleStatus', value: (r) => r.status },
  ];
  /**
   * The contract table's OWN columns. Two tables measured in two units (working days against
   * percentage points) cannot share a header row, and stacking them as two sections inside one
   * flat CSV would put a second header in the middle of a machine-readable table and force ONE
   * stamp to describe two different narrowings over two different populations — which is the
   * dishonest count this fix removes. Two tables, two files, two stamps, each counting its own
   * rows and naming only the filters that actually applied to it.
   */
  const contractCsvColumns: ReportColumn<ContractScheduleRow>[] = [
    { key: 'code', label: 'code', value: (r) => r.contract.code },
    { key: 'title', label: 'title', value: (r) => r.contract.title[lang] },
    { key: 'contractor', label: 'contractor', value: (r) => r.contract.contractorName },
    { key: 'stage', label: 'stage', value: (r) => r.stageKey ?? '' },
    { key: 'plannedDeliveryOn', label: 'plannedDeliveryOn', value: (r) => r.plannedDeliveryOn, format: 'date' },
    { key: 'actualDeliveryOn', label: 'actualDeliveryOn', value: (r) => r.actualDeliveryOn ?? '', format: 'date' },
    { key: 'progressPct', label: 'progressPct', value: (r) => r.progressPct },
    { key: 'plannedPct', label: 'plannedPct', value: (r) => r.plannedPct },
    { key: 'variancePct', label: 'variancePct', value: (r) => r.variancePct },
    { key: 'scheduleStatus', label: 'scheduleStatus', value: (r) => r.status },
  ];

  const exportTenders = () => {
    exportCsv('masaar-schedule-tenders', csvColumns, sorted, tenderStamp);
    toast(t('sched.toastExportTenders'));
  };
  const exportContracts = () => {
    exportCsv('masaar-schedule-contracts', contractCsvColumns, contractRows, contractStamp);
    toast(t('sched.toastExportContracts'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('sched.title')}</h1>
          <div className="op-page__sub">{t('sched.sub')}</div>
        </div>
        {/* Two tables, two files — and therefore two labelled buttons. One button writing one file
            could only carry one stamp, and there is no true sentence that describes both tables at
            once: they hold different rows, in different units, under different filters. */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-ghost" onClick={exportTenders} disabled={sorted.length === 0}>
            {t('sched.exportTenders')}
          </button>
          <button className="op-btn-ghost" onClick={exportContracts} disabled={contractRows.length === 0}>
            {t('sched.exportContracts')}
          </button>
        </div>
      </div>

      {/* The windows, stated rather than implied (Design Principle 3). Two units live on this
          screen — working days for requests, percentage points for contracts — and a reader who
          adds them together has been misled by the layout, not by the data. */}
      <SectionExplainer title={t('sched.explainTitle')}>
        {/* the first tile is the ONLY unfiltered, all-time figure on this screen — a reader who
            does not know that would try to reconcile it against the four beside it and fail */}
        <p>{t('sched.explainAllTime')}</p>
        <p>{t('sched.explainTender')} <span className="op-scpp">WD</span></p>
        <p>{t('sched.explainContract')}</p>
        <p>{t('sched.explainStatusScope')}</p>
        <p>{t('sched.explainUnplanned')}</p>
        <p>{t('sched.explainCompleted')}</p>
        <p>{t('sched.explainNotSection9')}</p>
      </SectionExplainer>

      <div className="ad-kpis ad-kpis--wrap" style={{ marginBlockStart: 12 }}>
        {kpiTiles.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row">
              <span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{k.v}</span>
            </div>
            {/* the window a figure covers is printed whenever it is not «the rows below» — the same
                line the follow-up room's tile carries, because it is the same measurement */}
            {k.win && <div className="ad-kpi__win">{k.win}</div>}
            {k.hint && <div className="ad-kpi__delta">{k.hint}</div>}
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('sched.searchPh')} style={{ width: 280 }} />
        <SelectFilter
          allLabel={t('fields.allOperators')}
          value={opFilter}
          hideWhenEmpty
          onChange={(v) => f.set('op', v)}
          options={state.operators.map((o) => ({ value: o.id, label: lang === 'ar' ? o.name : o.nameEn ?? o.name }))}
        />
        <FilterChips
          chips={([
            { key: '', label: t('sched.allStatus'), count: searched.length, active: statusFilter === '' },
            ...(['progress', 'risk', 'delayed', 'done'] as const).map((s): FilterChip => ({
              key: s,
              label: t(`status.${s}`),
              count: searched.filter((r) => tenderStatus(r.tender, today, cal) === s).length,
              active: statusFilter === s,
            })),
          ])}
          onSelect={(key) => f.set('status', key)}
          lang={lang}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('sched.clearFilters')}</button>
        </div>
      )}

      {/* Each stamp sits ON its own table and counts THAT table's rows under THAT table's filters
          — the sentence its own «تصدير …» button will write into its own file. */}
      <div className="ad-panel__t" style={{ marginBlockStart: 16 }}>{t('sched.tenderTable')}</div>
      <div className="reg-stamp">{tenderStamp}</div>
      {allTenderRows.length === 0 ? (
        <EmptyState mode="empty">{t('sched.emptyTenders')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState mode="noMatch" action={<button className="op-btn-ghost" onClick={clearFilters}>{t('sched.clearFilters')}</button>}>
          {t('sched.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('sched.colStage')}</th>
                  <th className="op-end">{t('sched.colPlanned')}</th>
                  <th className="op-end">{t('sched.colActual')}</th>
                  <SortableTh label={t('sched.colDev')} sortKey="dev" active={sortKey} dir={dir} onToggle={toggle} className="op-end" />
                  <th>{t('sched.colStatus')}</th>
                  <th style={{ width: 140 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.tender.id} className="op-tbl__row">
                    <td>
                      <div className="op-tbl__name" dir="auto">{r.tender.title[lang]}</div>
                      <div className="op-tbl__code">{r.tender.code}</div>
                    </td>
                    <td>
                      {r.stage ? (
                        <>
                          <div style={{ fontSize: 13 }}>{stageByKey(r.stage.key)?.[lang] ?? r.stage.key}</div>
                          {/* a completed request is measured on a CLOSED stage — the row says so
                              rather than letting it read as live work */}
                          {!r.open && <div className="op-tbl__code">{t('sched.lastClosed')}</div>}
                        </>
                      ) : (
                        <span className="op-dev op-dev--none" title={t('sched.noStages')}>—</span>
                      )}
                    </td>
                    <td className="op-end mono">{r.plannedTo ?? <span className="op-dev op-dev--none">—</span>}</td>
                    <td className="op-end mono">{r.actualTo ?? (r.open ? t('sched.stillOpen') : <span className="op-dev op-dev--none">—</span>)}</td>
                    <td className="op-end">
                      {r.status === 'unplanned' ? <span className="op-dev op-dev--none">—</span> : <DevChip wd={r.devWd} />}
                    </td>
                    <td><StatusPill size="sm" status={PILL[r.status]} title={t(`sched.statusHint.${r.status}`)}>{t(`sched.status.${r.status}`)}</StatusPill></td>
                    <td className="op-end">
                      <a className="acc-open" href={`#/admin/review/${r.tender.id}`}>
                        {t('reg.atenders.openReview')}
                        <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} start={start} end={end} lang={lang} />
        </>
      )}

      <div className="ad-panel__t" style={{ marginBlockStart: 22 }}>{t('sched.contractTable')}</div>
      <div className="ad-empty-inline" style={{ textAlign: 'start' }}>{t('sched.contractNote')}</div>
      {/* `?status=` is tender vocabulary and this table never reads it. While it is on, the panel
          says so — otherwise the chip row above would read as a narrowing of everything below it. */}
      {statusFilter !== '' && (
        <div className="ad-empty-inline" style={{ textAlign: 'start' }}>{t('sched.contractStatusNote')}</div>
      )}
      <div className="reg-stamp">{contractStamp}</div>
      {contractRows.length === 0 ? (
        <EmptyState mode={allContractRows.length === 0 ? 'empty' : 'noMatch'}>
          {allContractRows.length === 0 ? t('sched.emptyContracts') : t('sched.noMatchContracts')}
        </EmptyState>
      ) : (
        <div className="op-tablecard">
          <table className="op-tbl">
            <thead>
              <tr>
                <th>{t('reg.contracts.colContract')}</th>
                <th>{t('reg.contracts.colStage')}</th>
                <th className="op-end">{t('sched.colPlannedDelivery')}</th>
                <th className="op-end">{t('sched.colProgress')}</th>
                <th className="op-end">{t('sched.colVariance')}</th>
                <th>{t('sched.colStatus')}</th>
                <th style={{ width: 120 }} className="op-end" />
              </tr>
            </thead>
            <tbody>
              {contractRows.map((r: ContractScheduleRow) => (
                <tr key={r.contract.id} className="op-tbl__row">
                  <td>
                    <div className="op-tbl__name" dir="auto">{r.contract.title[lang]}</div>
                    <div className="op-tbl__code">{r.contract.code}</div>
                  </td>
                  <td>{r.stageKey
                    ? stageLabel(r.stageKey, lang)
                    : <StatusPill status="done">{t('reg.contracts.delivered')}</StatusPill>}</td>
                  <td className="op-end mono">{r.plannedDeliveryOn}</td>
                  <td className="op-end mono">{fmtCount(r.progressPct, lang)}% / {fmtCount(r.plannedPct, lang)}%</td>
                  <td className="op-end mono" style={r.variancePct < 0 ? { color: 'var(--status-delayed)' } : undefined}>
                    {r.variancePct > 0 ? '+' : ''}{fmtCount(r.variancePct, lang)}
                  </td>
                  <td><StatusPill size="sm" status={PILL[r.status]} title={t(`sched.statusHint.${r.status}`)}>{t(`sched.status.${r.status}`)}</StatusPill></td>
                  <td className="op-end">
                    <a className="acc-open" href={`#/admin/contracts/${r.contract.id}`}>
                      {t('reg.contracts.openFile')}
                      <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
