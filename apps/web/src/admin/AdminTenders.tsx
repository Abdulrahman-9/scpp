import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DevChip } from '../operator/DevChip';
import { fmtCount, fmtMoney, tenderDeviationWd, tenderStatus, type OpStatus } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { PathChip } from '../operator/PathChip';
import { EmptyState } from '../registry/EmptyState';
import { inDateRange, inValueRange, rangeInverted, dateRangeInverted } from '../registry/filters';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { RangeFilter } from '../registry/RangeFilter';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { StageRail } from '../registry/StageRail';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { SCOPE_KEYS, useFilterParams } from '../registry/useHashParams';
import { calendarOf, currentStage, resolveTiersFor, tenderApprovalTier, todayIso, useStore, type Tender } from '../store';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { pendingRatification } from './adminDerive';
import { TierPill } from './TierPill';

/** The four live statuses a tender can hold (from tenderStatus), in reading order. */
const STATUS_ORDER: OpStatus[] = ['progress', 'risk', 'delayed', 'done'];

/**
 * ق2 — the semantic fill each counting tile wears (§2-ط).
 *
 * A tone is a NAME, not a colour: the six families and their two-theme values live in
 * `tokens.css` and are spent by `.ad-fill[data-tone]` alone, so this screen cannot invent a
 * seventh shade or restate one it already has. «الإجمالي» is `brand` because it is the prominent
 * neutral — it counts everything and alarms about nothing.
 */
type Tone = 'brand' | 'risk' | 'delayed' | 'progress' | 'done' | 'planned';

/**
 * ق1 — the read-only board. Five columns: our four DERIVED statuses plus the one lifecycle
 * state that is not a status at all.
 *
 * «ملغاة» takes the `planned` grey deliberately. It is not a stage of the work, it is the
 * absence of it, and the closed status vocabulary has no fill family for a cancellation — so it
 * wears the one neutral in the palette rather than a seventh colour improvised for it.
 */
const KANBAN_COLUMNS: { key: OpStatus | 'cancelled'; tone: Tone }[] = [
  { key: 'progress', tone: 'progress' },
  { key: 'risk', tone: 'risk' },
  { key: 'delayed', tone: 'delayed' },
  { key: 'done', tone: 'done' },
  { key: 'cancelled', tone: 'planned' },
];

/** Which of the two renderings of the SAME filtered rows the reader is looking at. */
type ViewMode = 'table' | 'board';
/**
 * `open` is not a `tenderStatus` — it is the union of the three live ones, and it exists so the
 * follow-up room's «المناقصات المفتوحة» tile can land on a registry holding EXACTLY the rows it
 * counted. It arrives only through the URL, so it is not offered as a chip beside the four
 * statuses it contains (that would read as a fifth, parallel state); it shows as the removable
 * chip that says why the registry is short.
 */
type StatusFilter = '' | OpStatus | 'open';

export default function AdminTenders() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const cal = calendarOf(state);
  const words = useStampWords();

  const [q, setQ] = useState('');
  /**
   * ق1 — the view mode is LOCAL state, not a URL dimension: it changes nothing about WHICH rows
   * the registry holds, and the export stamp describes rows. Putting it in the address would make
   * two links that filter identically look different, and would print a rendering choice on a CSV.
   */
  const [mode, setMode] = useState<ViewMode>('table');

  /**
   * The URL contract (§5-ج), now carrying the whole toolbar (client request 7). Every clickable
   * statistic in the follow-up room lands here — often on the screen the reader is already looking
   * at — and every control on this screen writes back, so the address, the table, the counts, the
   * chips and the export stamp are one fact. Reading these once at mount (the defect phase 3 fixed)
   * would leave the table unchanged; `useFilterParams` re-reads them on every `hashchange`.
   */
  const f = useFilterParams();
  const opFilter = f.get('op', state.operators.map((o) => o.id));
  const fieldFilter = f.get('field', state.fields.map((x) => x.id));
  const methodFilter = f.get('method');
  const tierFilter = f.get('tier');
  const scopeFilter = f.get('scope');
  const statusFilter = f.get('status') as StatusFilter;
  const pendingParam = f.get('pending') === '1';
  const vmin = f.get('vmin');
  const vmax = f.get('vmax');
  const dFrom = f.get('from');
  const dTo = f.get('to');

  const valueBad = rangeInverted(vmin, vmax);
  const dateBad = dateRangeInverted(dFrom, dTo);

  const qn = q.trim().toLowerCase();

  /**
   * Every dimension EXCEPT the two the KPI tiles own — `status` and `pending`.
   *
   * ق2 turned the four tiles into filters, and the standing law is «a tile opens EXACTLY what it
   * counted». A tile counting off a set that already has its own narrowing applied cannot satisfy
   * it: «متأخرة» would print 3 while the reader is looking at `?pending=1`, and clicking it would
   * land 1. Counting off this base — every OTHER narrowing, none of its own — makes the printed
   * figure and the destination the same arithmetic by construction.
   */
  const base = useMemo(() => state.tenders.filter((tn) => {
    if (opFilter && tn.operatorId !== opFilter) return false;
    if (methodFilter && tn.methodId !== Number(methodFilter)) return false;
    if (fieldFilter && tn.fieldId !== fieldFilter) return false;
    if (tierFilter && tenderApprovalTier(state, tn) !== tierFilter) return false;
    if (scopeFilter && (tn.scope ?? 'OTHER') !== scopeFilter) return false;
    if (!inValueRange(tn.estimatedValueUSD, vmin, vmax)) return false;
    if (!inDateRange(tn.createdOn, dFrom, dTo)) return false;
    if (qn && !(`${tn.code} ${tn.title.ar} ${tn.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [state, opFilter, methodFilter, fieldFilter, tierFilter, scopeFilter, vmin, vmax, dFrom, dTo, qn]);

  // The status CHIPS keep counting inside `pending` exactly as they did — they are a narrowing of
  // the visible registry, not a landing pad for a figure printed elsewhere.
  const searched = useMemo(
    () => (pendingParam ? base.filter(pendingRatification) : base),
    [base, pendingParam],
  );

  const rows = useMemo(
    () => (statusFilter
      ? searched.filter((tn) => (statusFilter === 'open'
        ? currentStage(tn) !== undefined
        : tenderStatus(tn, today, cal) === statusFilter))
      : searched),
    [searched, statusFilter, today],
  );

  // Tri-state sort — title is Arabic-collated; deviation sorts by signed working days.
  const compare = useMemo(() => ({
    tender: arCompare<Tender>((tn) => tn.title[lang]),
    value: (a: Tender, b: Tender) => a.estimatedValueUSD - b.estimatedValueUSD,
    deviation: (a: Tender, b: Tender) => tenderDeviationWd(a, today, cal) - tenderDeviationWd(b, today, cal),
  }), [lang, today]);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  /**
   * ق2 — the four counting tiles, each a FILTER that lands the rows it printed.
   *
   * Every tile writes BOTH dimensions it owns in one act (`setMany`): the narrowing it means, and
   * the removal of the other tile's narrowing. Two separate writes would push two history entries
   * and leave a half-applied state behind Back that no tile ever offered.
   *
   * They still follow every other dimension — narrow by company or by value window and the four
   * figures move with the view. They are `aria-pressed` toggles, so a second press on the active
   * tile widens back to the base rather than being a click that does nothing.
   */
  const kpis: { key: string; l: string; v: number; tone: Tone; on: boolean; go: () => void }[] = [
    {
      key: 'total',
      l: t('reg.atenders.kpiTotal'),
      v: base.length,
      tone: 'brand',
      on: statusFilter === '' && !pendingParam,
      go: () => f.setMany({ status: '', pending: '' }),
    },
    {
      key: 'pending',
      l: t('reg.atenders.kpiPending'),
      v: base.filter(pendingRatification).length,
      tone: 'risk',
      on: pendingParam && statusFilter === '',
      go: () => f.setMany({ status: '', pending: pendingParam && statusFilter === '' ? '' : '1' }),
    },
    {
      key: 'late',
      l: t('reg.atenders.kpiLate'),
      v: base.filter((tn) => tenderStatus(tn, today, cal) === 'delayed').length,
      tone: 'delayed',
      on: statusFilter === 'delayed' && !pendingParam,
      go: () => f.setMany({ pending: '', status: statusFilter === 'delayed' && !pendingParam ? '' : 'delayed' }),
    },
    {
      key: 'done',
      l: t('reg.atenders.kpiDone'),
      v: base.filter((tn) => tenderStatus(tn, today, cal) === 'done').length,
      tone: 'done',
      on: statusFilter === 'done' && !pendingParam,
      go: () => f.setMany({ pending: '', status: statusFilter === 'done' && !pendingParam ? '' : 'done' }),
    },
  ];

  /**
   * ق1 — the board, derived from the SORTED, FILTERED rows the table would show. One narrowing,
   * two renderings: a card can never appear on the board that the table would not list.
   *
   * A cancelled request is pulled out FIRST: `tenderStatus` would otherwise scatter cancellations
   * across the four live columns, reading as work in progress on a request nobody is progressing.
   */
  const board = useMemo(() => {
    const cancelled = new Set(sorted.filter((tn) => tn.lifecycle?.status === 'cancelled'));
    return KANBAN_COLUMNS.map((col) => ({
      ...col,
      cards: col.key === 'cancelled'
        ? sorted.filter((tn) => cancelled.has(tn))
        : sorted.filter((tn) => !cancelled.has(tn) && tenderStatus(tn, today, cal) === col.key),
    }));
    // `cal` is rebuilt on every render by `calendarOf`, so it is left out of the key exactly as it
    // is in `rows` and `compare` above — it moves only with `state`, which `sorted` already carries.
  }, [sorted, today]);

  const operatorName = (id: string) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : id;
  };
  const fieldName = (id: string) => {
    const x = state.fields.find((y) => y.id === id);
    return x ? (lang === 'ar' ? x.name : x.nameEn ?? x.name) : id;
  };
  const methodName = (id: string) => {
    const m = METHODS.find((x) => String(x.id) === id);
    return m ? `${String(m.id).padStart(2, '0')} — ${m[lang]}` : id;
  };

  /**
   * ONE declaration of every narrowing this screen can hold, in reading order. It drives the
   * removable chips AND the export/print stamp, so the registry cannot show a filter it does not
   * print, nor print one it does not show (design principle 4).
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    op: { label: t('reg.stamp.dim.op'), value: operatorName },
    field: { label: t('reg.stamp.dim.field'), value: fieldName },
    method: { label: t('reg.stamp.dim.method'), value: methodName },
    tier: { label: t('reg.stamp.dim.tier'), value: (v) => t(`tier.pill.${v}`) },
    scope: { label: t('reg.stamp.dim.scope'), value: (v) => t(`compliance.scope.${v}`) },
    status: { label: t('reg.stamp.dim.status'), value: (v) => (v === 'open' ? t('reg.atenders.chipOpen') : t(`status.${v}`)) },
    pending: { label: '', value: () => t('reg.atenders.chipPending') },
    vmin: { label: t('reg.stamp.dim.valueFrom'), value: (v) => fmtMoney(Number(v)) },
    vmax: { label: t('reg.stamp.dim.valueTo'), value: (v) => fmtMoney(Number(v)) },
    from: { label: t('reg.stamp.dim.dateFrom') },
    to: { label: t('reg.stamp.dim.dateTo') },
  };

  /** The EFFECTIVE filter state — including the search box, which lives in local state so a
   *  keystroke does not push a history entry, but which narrows the rows exactly like the rest. */
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opFilter) p.set('op', opFilter);
    if (fieldFilter) p.set('field', fieldFilter);
    if (methodFilter) p.set('method', methodFilter);
    if (tierFilter) p.set('tier', tierFilter);
    if (scopeFilter) p.set('scope', scopeFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (pendingParam) p.set('pending', '1');
    if (vmin) p.set('vmin', vmin);
    if (vmax) p.set('vmax', vmax);
    if (dFrom) p.set('from', dFrom);
    if (dTo) p.set('to', dTo);
    return p;
  }, [q, qn, opFilter, fieldFilter, methodFilter, tierFilter, scopeFilter, statusFilter, pendingParam, vmin, vmax, dFrom, dTo]);

  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  const statusChips: FilterChip[] = [
    { key: '', label: t('reg.atenders.allStatus'), count: searched.length, active: statusFilter === '' },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      label: t(`status.${s}`),
      count: searched.filter((tn) => tenderStatus(tn, today, cal) === s).length,
      active: statusFilter === s,
    })),
  ];
  /** Every ACTIVE dimension, each carrying its own dismiss — «q» clears the box, the rest the hash. */
  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ(''); else f.set(name as 'op', '');
  });

  // One column contract drives the table read-out and the CSV — the export is exactly the sorted, filtered view.
  const csvColumns: ReportColumn<Tender>[] = [
    { key: 'code', label: 'code', value: (tn) => tn.code },
    { key: 'title', label: 'title', value: (tn) => tn.title[lang] },
    { key: 'operator', label: 'operator', value: (tn) => (tn.operatorId ? operatorName(tn.operatorId) : '') },
    { key: 'field', label: 'field', value: (tn) => (tn.fieldId ? fieldName(tn.fieldId) : '') },
    { key: 'method', label: 'method', value: (tn) => tn.methodId },
    { key: 'scope', label: 'scope', value: (tn) => tn.scope ?? 'OTHER' },
    { key: 'estimatedValueUSD', label: 'estimatedValueUSD', value: (tn) => tn.estimatedValueUSD, format: 'money', total: true },
    { key: 'tier', label: 'tier', value: (tn) => tenderApprovalTier(state, tn) },
    { key: 'createdOn', label: 'createdOn', value: (tn) => tn.createdOn, format: 'date' },
    { key: 'stage', label: 'stage', value: (tn) => currentStage(tn)?.key ?? 'completed' },
    { key: 'status', label: 'status', value: (tn) => tenderStatus(tn, today, cal) },
    { key: 'deviationWd', label: 'deviationWd', value: (tn) => tenderDeviationWd(tn, today, cal) },
    { key: 'ratification', label: 'ratification', value: (tn) => tn.ratification?.status ?? '' },
  ];

  const doExport = () => {
    exportCsv('masaar-tenders-registry', csvColumns, sorted, stamp);
    toast(t('reg.atenders.toastExport'));
  };

  const clearFilters = () => { setQ(''); f.clear(); };
  /** ق5 — «مسح (N)»: the button says how much it is about to undo, so «مسح» is never a guess. */
  const clearLabel = activeChips.length > 0
    ? t('reg.atenders.clearFiltersN', { n: fmtCount(activeChips.length, lang) })
    : t('reg.atenders.clearFilters');

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('admin.allTenders')}</h1>
          <div className="op-page__sub">{t('reg.atenders.sub', { n: fmtCount(state.tenders.length, lang) })}</div>
          {/* Client request 8 / ق4 — «المطابقة» is stated in one visible line rather than left to
              be inferred from a column header; the pills and the chip carry the same arithmetic
              in their tooltips, so the definition and the computation cannot drift apart. */}
          <div className="op-page__def">{t('match.def')}</div>
        </div>
        {/* Admin reviews, never creates — no primary. The export mirrors the filtered rows on
            screen, and so does the print: both describe the SAME stamp. */}
        <div className="op-page__actions" data-noprint="1">
          {/* ق1 — one narrowing, two renderings. `aria-pressed` is the same contract the counting
              tiles below use, so «this one is chosen» reads identically across the screen. */}
          <div className="kb-switch" role="group" aria-label={t('reg.atenders.viewLabel')}>
            <button type="button" aria-pressed={mode === 'table'} onClick={() => setMode('table')}>
              {t('reg.atenders.viewTable')}
            </button>
            <button type="button" aria-pressed={mode === 'board'} onClick={() => setMode('board')}>
              {t('reg.atenders.viewBoard')}
            </button>
          </div>
          <button className="op-btn-ghost" onClick={doExport}>{t('reg.atenders.exportCsv')}</button>
          {/* ق7 — a real act with no server behind it: the browser prints the stamped registry.
              `data-noprint` takes the tools off the page; the table and the stamp stay. */}
          <button className="op-btn-ghost" onClick={() => window.print()}>
            <Icon name="printer" size={14} />{t('reg.atenders.print')}
          </button>
        </div>
      </div>

      {/* ق2 + §2-ط — the four counting tiles, filled by tone and clickable as filters. */}
      <div className="ad-kpis" style={{ marginBlockStart: 4 }} data-noprint="1">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            className="ad-kpi ad-fill ad-kpi--fill"
            data-tone={k.tone}
            aria-pressed={k.on}
            title={t('reg.atenders.kpiHint', { label: k.l })}
            onClick={k.go}
          >
            <span className="ad-kpi__head">
              {/* the ONE piece of hierarchy inside a fully-filled row (§2-ط-د): «متأخرة» pulses,
                  and only while it has something to pulse about — a beat on zero is a false alarm */}
              <span className={`ad-kpi__dot${k.tone === 'delayed' && k.v > 0 ? ' ad-kpi__dot--alert' : ''}`} />
              <span className="ad-kpi__l">{k.l}</span>
            </span>
            <span className="ad-kpi__row">
              <span className="ad-kpi__v">{fmtCount(k.v, lang)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="acc-filters" data-noprint="1">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.atenders.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={statusChips} onSelect={(key) => f.set('status', key)} lang={lang} />
        {/* filter by operating company — the destination every per-company chart row lands on */}
        <SelectFilter
          allLabel={t('fields.allOperators')}
          value={opFilter}
          hideWhenEmpty
          onChange={(v) => f.set('op', v)}
          options={state.operators.map((o) => ({ value: o.id, label: lang === 'ar' ? o.name : o.nameEn ?? o.name }))}
        />
        {/* Filter by oil field (client request 8): the portfolio is read field by field, and the
            field registry is empty in API mode — an empty select is a control with nothing to
            choose, so it is simply not rendered. */}
        <SelectFilter
          allLabel={t('approvals.allFields')}
          value={fieldFilter}
          hideWhenEmpty
          onChange={(v) => f.set('field', v)}
          options={state.fields.map((x) => ({ value: x.id, label: lang === 'ar' ? x.name : x.nameEn ?? x.name }))}
        />
        {/* filter by the named procurement path (§11), not a bare id nobody memorises */}
        <SelectFilter
          allLabel={t('admin.allMethods')}
          value={methodFilter}
          onChange={(v) => f.set('method', v)}
          options={METHODS.map((m) => ({ value: String(m.id), label: `${String(m.id).padStart(2, '0')} — ${m[lang]} (§${m.scpp})` }))}
        />
        {/* request 7 — the approving body, derived from the value against the GLOBAL ladder (ق1) */}
        <SelectFilter
          allLabel={t('reg.atenders.allTiers')}
          value={tierFilter}
          onChange={(v) => f.set('tier', v)}
          options={(['OPERATOR', 'JMC', 'MDOC'] as const).map((x) => ({ value: x, label: t(`tier.pill.${x}`) }))}
        />
        {/* request 7 — the §9 work scope; a request with none recorded reads as «أخرى», the same
            default `CREATE_TENDER` applies, so the four options partition the registry exactly */}
        <SelectFilter
          allLabel={t('reg.atenders.allScopes')}
          value={scopeFilter}
          onChange={(v) => f.set('scope', v)}
          options={SCOPE_KEYS.map((s) => ({ value: s, label: t(`compliance.scope.${s}`) }))}
        />
      </div>

      <div className="acc-filters" style={{ marginBlock: '0 12px' }} data-noprint="1">
        <RangeFilter
          id="atn-val" kind="money" label={t('reg.atenders.rangeValue')}
          min={vmin} max={vmax} inverted={valueBad}
          onMin={(v) => f.set('vmin', v)} onMax={(v) => f.set('vmax', v)}
        />
        <RangeFilter
          id="atn-date" kind="date" label={t('reg.atenders.rangeDate')}
          min={dFrom} max={dTo} inverted={dateBad}
          onMin={(v) => f.set('from', v)} onMax={(v) => f.set('to', v)}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }} data-noprint="1">
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{clearLabel}</button>
        </div>
      )}

      {/* WYSIWYG (design principle 4): the exact sentence the CSV and the printed page will carry,
          shown before either is produced — the reader can check the claim, not take it on trust. */}
      <div className="reg-stamp">{stamp}</div>

      {state.tenders.length === 0 ? (
        <EmptyState mode="empty">{t('reg.atenders.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{clearLabel}</button>}
        >
          {valueBad || dateBad ? t('reg.range.invertedBody') : t('reg.atenders.noMatch')}
        </EmptyState>
      ) : mode === 'board' ? (
        /* ق1 — the board. READ-ONLY by construction: every card is an `<a>` to the file, there is
           no drag handle and no state control, because a status here is DERIVED from the stage
           dates and a decision belongs to the review screen with its ledger preview. It shows the
           whole filtered set, not a page of it — a column that stopped at ten would print a count
           it did not hold. */
        <div className="kb">
          {board.map((col) => (
            <section key={col.key} className="kb__col">
              {/* a real heading, not a coloured strip: the board is navigable by heading, and the
                  count belongs to the head it names rather than floating beside it */}
              <h2 className="kb__head ad-fill" data-tone={col.tone}>
                {t(`reg.atenders.col.${col.key}`)}
                <span className="kb__n">{fmtCount(col.cards.length, lang)}</span>
              </h2>
              {col.cards.length === 0 ? (
                <p className="kb__empty">{t('reg.atenders.colEmpty')}</p>
              ) : col.cards.map((tender) => {
                const dev = tenderDeviationWd(tender, today, cal);
                return (
                  <a key={tender.id} className="kb__card" href={`#/admin/review/${tender.id}`}>
                    <span className="kb__top">
                      <span className="kb__code">{tender.code}</span>
                      {/* the deviation badge appears on REAL lateness only — the closed rule that
                          red belongs to a request that has actually run past its plan */}
                      {dev > 0 && <span className="kb__dev"><DevChip wd={dev} /></span>}
                    </span>
                    <span className="kb__t" dir="auto">{tender.title[lang]}</span>
                    <span className="kb__foot">
                      <span className="kb__v">{fmtMoney(tender.estimatedValueUSD)}</span>
                    </span>
                  </a>
                );
              })}
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('tenders.colPath')}</th>
                  <SortableTh label={t('approvals.colValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 140 }} />
                  {/* ق3 — WHO clears a request of this value. The cell reads `tenderApprovalTier`
                      and nothing else: no threshold is printed here, so the column cannot outlive
                      the ladder it describes when per-operator ceilings land (د9). */}
                  <th>{t('reg.stamp.dim.tier')}</th>
                  <th>{t('tenders.colStage')}</th>
                  <th>{t('tenders.colStatus')}</th>
                  <SortableTh label={t('tenders.colDeviation')} sortKey="deviation" active={sortKey} dir={dir} onToggle={toggle} className="op-end" />
                  <th>{t('adtenders.colRatify')}</th>
                  <th style={{ width: 150 }} className="op-end" data-noprint="1" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((tender) => {
                  const cur = currentStage(tender);
                  const status = tenderStatus(tender, today, cal);
                  return (
                    <tr key={tender.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">{tender.title[lang]}</div>
                        <div className="op-tbl__code">{tender.code}</div>
                      </td>
                      <td><PathChip id={tender.methodId} lang={lang} /></td>
                      <td className="op-end mono">{fmtMoney(tender.estimatedValueUSD)}</td>
                      {/* د9 — the tier already resolved per operator (`tenderApprovalTier`); the
                          TOOLTIP has to name the same ladder, or the pill and its explanation part */}
                      <td><TierPill tier={tenderApprovalTier(state, tender)} tiers={resolveTiersFor(state, tender.operatorId)} /></td>
                      {/* ق4 — the SAME rail component the operator registry wears, written once in
                          `registry/StageRail.tsx`. Here it is `aria-hidden`: this row already
                          names the stage in words on the line above, and the board mode has no
                          rail at all, so nothing is said twice on either surface. */}
                      <td>
                        <div className="op-tbl__stage">{cur ? stageByKey(cur.key)?.[lang] : t('tenders.completed')}</div>
                        <StageRail tender={tender} today={today} lang={lang} decorative />
                      </td>
                      <td><StatusPill size="sm" status={status} title={t(`match.status.${status}`)}>{t(`status.${status}`)}</StatusPill></td>
                      <td className="op-end"><DevChip wd={tenderDeviationWd(tender, today, cal)} /></td>
                      <td>
                        {tender.ratification ? (
                          <StatusPill status={tender.ratification.status === 'ratified' ? 'done' : 'delayed'}>{t(`review.${tender.ratification.status}`)}</StatusPill>
                        ) : (
                          <span className="op-dev op-dev--none">—</span>
                        )}
                      </td>
                      <td className="op-end" data-noprint="1">
                        {/* a real link, so review is reachable by keyboard — an onClick <tr> is not */}
                        <a className="acc-open" href={`#/admin/review/${tender.id}`}>
                          {t('reg.atenders.openReview')}
                          <Icon name="chevronEnd" size={12} strokeWidth={2} className="op-chev-fwd" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            total={total}
            start={start}
            end={end}
            lang={lang}
          />
        </>
      )}
    </div>
  );
}
