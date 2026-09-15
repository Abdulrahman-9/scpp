import { METHODS, stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { sessionScopeOrgName } from '../orgIdentity';
import { loadSession } from '../session';
import { calendarOf, currentStage, fieldsOfOperator, liveFields, sessionScopedTenders, tenderApprovalTier, tenderIsActive, todayIso, useStore, type Tender } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { dateRangeInverted, inDateRange, inValueRange, rangeInverted } from '../registry/filters';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { RangeFilter } from '../registry/RangeFilter';
import { reportStamp, type FilterLabels } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { StageRail } from '../registry/StageRail';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { SCOPE_KEYS, useFilterParams } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { DevChip } from './DevChip';
import {
  deriveTasks,
  fmtCount,
  fmtMoney,
  fmtMoneyShort,
  progressPct,
  tenderDeviationWd,
  tenderStatus,
  type OpStatus,
  type TaskGroup,
} from './derive';
import { Icon } from './Icon';
import { useOperatorUi } from './OperatorShell';
import { PathChip } from './PathChip';

const PROGRESS_COLOR: Record<OpStatus, string> = {
  progress: 'var(--status-progress)',
  risk: 'var(--status-risk)',
  delayed: 'var(--status-delayed)',
  done: 'var(--status-done)',
};

/** The status vocabulary a live tender can carry — the same set tenderStatus derives. */
const STATUSES: OpStatus[] = ['progress', 'risk', 'delayed', 'done'];

/** '' = every status, otherwise one derived OpStatus. */
type StatusFilter = '' | OpStatus;

export default function TendersList() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { openQuickLook } = useOperatorUi();
  const today = todayIso();
  const cal = calendarOf(state);

  const words = useStampWords();
  const [q, setQ] = useState('');

  /**
   * The SAME declared filter set the admin registry carries (client request 7), scoped to this
   * portal: no `?op=` — an operator's portal is its own company by definition — and the field
   * select offers only this company's live fields. Everything else (path, tier, scope, value
   * window, creation-date window, status) is the identical vocabulary on the identical URL
   * contract, so an operator and an admin discussing «المناقصات فوق 5 مليون في الحفر» are looking
   * at the same filter, and a link pasted between them means the same thing on both screens.
   */
  const f = useFilterParams();
  const methodFilter = f.get('method');
  const tierFilter = f.get('tier');
  const scopeFilter = f.get('scope');
  const statusFilter = f.get('status') as StatusFilter;
  const vmin = f.get('vmin');
  const vmax = f.get('vmax');
  const dFrom = f.get('from');
  const dTo = f.get('to');
  const valueBad = rangeInverted(vmin, vmax);
  const dateBad = dateRangeInverted(dFrom, dTo);

  // the field filter is scoped to the signed-in company, exactly like the request wizard
  // (RequestWizard: loadSession()?.companyId → the operator's own fields). Unscoped it listed
  // the whole 13-field / 12-company registry inside one operator's portal.
  // ARCHIVED fields drop out too (ق7): this is the operator's ACTIVE work surface, and a field
  // can only be archived once none of its tenders is in flight. The admin registries
  // (AdminTenders / Approvals / Fields) deliberately keep listing them — they are the record of
  // record, and a historical tender must stay findable by the field it was raised on.
  const myFields = liveFields(fieldsOfOperator(state, loadSession()?.companyId));

  // م3 — whose register this is, or `undefined` on a session that reads every company and would
  // be claiming a narrowing it does not have. The inbox prints the identical sentence.
  const scopeOrg = sessionScopeOrgName(state, lang);
  const fieldFilter = f.get('field', myFields.map((x) => x.id));

  // D4 — the registry rows this session may see: an operator session reads its OWN company only,
  // the same judgement the server makes (apps/api/src/auth/scope.ts operatorScopeWhere). This was
  // the one place the reference prototype was stricter than us — the comment above the field
  // filter promised «an operator's portal is its own company by definition» while the list read
  // every company's tenders.
  const myTenders = useMemo(() => sessionScopedTenders(state), [state]);

  // One derived task per open tender (its current stage) → its urgency group.
  // Reused, never re-derived, so the KPI counts stay honest to deriveTasks.
  const taskGroupById = useMemo(() => {
    const m = new Map<string, TaskGroup>();
    for (const tk of deriveTasks({ ...state, tenders: myTenders }, today, cal)) m.set(tk.tender.id, tk.group);
    return m;
  }, [state, myTenders, today]);

  const qn = q.trim().toLowerCase();
  // every dimension EXCEPT the status chips — the chip counts read off this set, so a chip never
  // promises rows the value window, the scope or the search has already removed
  const searched = useMemo(
    () =>
      myTenders.filter((x) => {
        if (qn && !(`${x.title[lang]} ${x.code}`.toLowerCase().includes(qn))) return false;
        if (methodFilter && x.methodId !== Number(methodFilter)) return false;
        if (fieldFilter && x.fieldId !== fieldFilter) return false;
        if (tierFilter && tenderApprovalTier(state, x) !== tierFilter) return false;
        if (scopeFilter && (x.scope ?? 'OTHER') !== scopeFilter) return false;
        if (!inValueRange(x.estimatedValueUSD, vmin, vmax)) return false;
        if (!inDateRange(x.createdOn, dFrom, dTo)) return false;
        return true;
      }),
    [state, myTenders, qn, methodFilter, fieldFilter, tierFilter, scopeFilter, vmin, vmax, dFrom, dTo, lang],
  );
  const rows = useMemo(
    () => (statusFilter ? searched.filter((x) => tenderStatus(x, today, cal) === statusFilter) : searched),
    [searched, statusFilter, today],
  );

  // KPIs read from the filtered set — what the screen shows is what they count.
  const lateCount = rows.filter((x) => taskGroupById.get(x.id) === 'late').length;
  const dueWeekCount = rows.filter((x) => taskGroupById.get(x.id) === 'week').length;
  /**
   * م2 — the money the register is carrying, the one dimension its three counters never had.
   *
   * «قيد الإنجاز» is the whole claim, so the sum is over IN-FLIGHT rows only: `tenderIsActive` is
   * the store's own predicate for that (cancelled = dead, every stage closed = delivered), reused
   * rather than restated, so this figure can never disagree with the archive gate about which
   * requests are still running. Rows the filters removed are out by construction — the three
   * tiles beside it already count the visible set and a fourth that summed the invisible one
   * would make the row read as four answers to four different questions.
   */
  const inFlightValue = rows.reduce((s, x) => s + (tenderIsActive(x) ? x.estimatedValueUSD : 0), 0);
  // the headline is short-form because an eight-figure sum cannot live at display size; the exact
  // grouped figure sits under it whenever the short form rounded, so nothing is hidden (ج4)
  const valueShort = fmtMoneyShort(inFlightValue);
  const valueExact = fmtMoney(inFlightValue);

  /**
   * §2-ط — the filled statistical surface, spent here exactly as on the four admin registries:
   * one class, one tone map, every fill and its ink measured in `tokens.css`. This register was
   * the last screen still wearing the pre-decision outline tile (`KpiTile`), which is why the
   * whole row moves and not just the new figure — a row half-filled is not a hierarchy, it is
   * two design systems sharing a line.
   *
   * NONE OF THE FOUR IS A BUTTON (سابقة د14). The narrowings this screen owns are already offered
   * as chips directly beneath, in the same vocabulary; a tile that duplicated one would be a
   * second control for one filter, and the value tile has no filter to open at all — there is no
   * «by value in flight» dimension, so a click would have to land something it never counted.
   * A tile that cannot open exactly what it counted stays a number (قانون P3).
   */
  const kpis: { key: string; l: string; v: string; tone: string; alert?: boolean; delta?: string }[] = [
    { key: 'total', l: t('reg.tlist.kpiTotal'), v: fmtCount(rows.length, lang), tone: 'brand' },
    // §2-ط-د — the one tile that may pulse, and only when it has something to pulse about
    { key: 'late', l: t('reg.tlist.kpiLate'), v: fmtCount(lateCount, lang), tone: 'delayed', alert: lateCount > 0 },
    { key: 'dueWeek', l: t('reg.tlist.kpiDueWeek'), v: fmtCount(dueWeekCount, lang), tone: 'risk' },
    {
      key: 'value',
      l: t('reg.tlist.kpiValue'),
      v: valueShort,
      tone: 'planned',
      delta: valueShort === valueExact ? undefined : valueExact,
    },
  ];

  // Sort: code (Arabic-aware collation) and schedule progress. "none" restores filter order.
  const compare = useMemo(
    () => ({
      code: arCompare<Tender>((x) => x.code),
      progress: (a: Tender, b: Tender) => progressPct(a) - progressPct(b),
    }),
    [],
  );
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // Chip counts read the set the OTHER dimensions already narrowed, so a chip never promises rows
  // the value window or the scope has removed (request 7: «counts update»).
  const statusCount = (s: OpStatus) => searched.filter((x) => tenderStatus(x, today, cal) === s).length;
  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.tlist.allStatus'), count: searched.length, active: statusFilter === '' },
    ...STATUSES.map((s) => ({ key: s, label: t(`status.${s}`), count: statusCount(s), active: statusFilter === s })),
  ];

  const fieldName = (id: string) => {
    const x = myFields.find((y) => y.id === id);
    return x ? (lang === 'ar' ? x.name : x.nameEn ?? x.name) : id;
  };
  const methodName = (id: string) => {
    const m = METHODS.find((x) => String(x.id) === id);
    return m ? `${String(m.id).padStart(2, '0')} — ${m[lang]}` : id;
  };

  /** ONE declaration of every narrowing — the removable chips and the print stamp read the same map. */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    field: { label: t('reg.stamp.dim.field'), value: fieldName },
    method: { label: t('reg.stamp.dim.method'), value: methodName },
    tier: { label: t('reg.stamp.dim.tier'), value: (v) => t(`tier.pill.${v}`) },
    scope: { label: t('reg.stamp.dim.scope'), value: (v) => t(`compliance.scope.${v}`) },
    status: { label: t('reg.stamp.dim.status'), value: (v) => t(`status.${v}`) },
    vmin: { label: t('reg.stamp.dim.valueFrom'), value: (v) => fmtMoney(Number(v)) },
    vmax: { label: t('reg.stamp.dim.valueTo'), value: (v) => fmtMoney(Number(v)) },
    from: { label: t('reg.stamp.dim.dateFrom') },
    to: { label: t('reg.stamp.dim.dateTo') },
  };
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (fieldFilter) p.set('field', fieldFilter);
    if (methodFilter) p.set('method', methodFilter);
    if (tierFilter) p.set('tier', tierFilter);
    if (scopeFilter) p.set('scope', scopeFilter);
    if (statusFilter) p.set('status', statusFilter);
    if (vmin) p.set('vmin', vmin);
    if (vmax) p.set('vmax', vmax);
    if (dFrom) p.set('from', dFrom);
    if (dTo) p.set('to', dTo);
    return p;
  }, [q, qn, fieldFilter, methodFilter, tierFilter, scopeFilter, statusFilter, vmin, vmax, dFrom, dTo]);
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });
  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ(''); else f.set(name as 'method', '');
  });

  const clearFilters = () => { setQ(''); f.clear(); };

  return (
    <div className="op-page op-page--tenders">
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('tenders.title')}</h1>
          <div className="op-page__sub">{t('reg.tlist.sub', { n: fmtCount(myTenders.length, lang) })}</div>
          {/* م3 — the narrowing D4 imposed, stated where it is felt. Until now the claim «an
              operator's portal is its own company by definition» lived in the comment above the
              field filter, which no reader ever sees; the same sentence stands on the inbox. */}
          {scopeOrg && <div className="op-page__scope" dir="auto">{t('shell.scopeNote', { name: scopeOrg })}</div>}
          {/* the same one-line definition of «المطابقة» the admin registry carries (request 8 / ق4) —
              one wording, so operator and admin argue from the same sentence */}
          <div className="op-page__def">{t('match.def')}</div>
        </div>
        <a className="op-btn-primary" href="#/operator/new">
          <Icon name="plus" size={14} />
          {t('onav.request')}
        </a>
      </div>

      <div className="ad-kpis ad-kpis--wrap" style={{ marginBlockStart: 4 }}>
        {kpis.map((k) => (
          <div key={k.key} className="ad-kpi ad-fill ad-kpi--fill" data-tone={k.tone}>
            <span className="ad-kpi__head">
              {/* the dot inherits the tile's ink under the fill (§2-ط): the tone worn twice,
                  never a second colour */}
              <span className={`ad-kpi__dot${k.alert ? ' ad-kpi__dot--alert' : ''}`} />
              <span className="ad-kpi__l">{k.l}</span>
            </span>
            <span className="ad-kpi__row"><span className="ad-kpi__v">{k.v}</span></span>
            {k.delta && <span className="ad-kpi__delta mono">{k.delta}</span>}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBlock: '16px 12px' }}>
        <SearchBox
          value={q}
          onChange={setQ}
          placeholder={t('reg.tlist.searchPh')}
          style={{ width: 280, marginInlineStart: 0 }}
        />
        <FilterChips chips={filterChips} onSelect={(key) => f.set('status', key)} lang={lang} />
        {/* the dimension filters travel together to the row's end, and wrap as one group
            rather than leaving a single orphaned select on a line of its own */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginInlineStart: 'auto' }}>
          <SelectFilter
            allLabel={t('reg.tlist.allMethods')}
            value={methodFilter}
            onChange={(v) => f.set('method', v)}
            options={METHODS.map((m) => ({ value: String(m.id), label: `${String(m.id).padStart(2, '0')} — ${m[lang]} (§${m.scpp})` }))}
          />
          {/* filter by oil field (request 8) — THIS company's fields only, and rendered only when
              there are any: none in API mode (no /fields route) and none for a session that names
              no company. Either way the control is absent rather than offering a choice the
              account has no scope over. */}
          <SelectFilter
            allLabel={t('reg.tlist.allFields')}
            value={fieldFilter}
            hideWhenEmpty
            onChange={(v) => f.set('field', v)}
            options={myFields.map((x) => ({ value: x.id, label: lang === 'ar' ? x.name : x.nameEn ?? x.name }))}
          />
          <SelectFilter
            allLabel={t('reg.tlist.allTiers')}
            value={tierFilter}
            onChange={(v) => f.set('tier', v)}
            options={(['OPERATOR', 'JMC', 'MDOC'] as const).map((x) => ({ value: x, label: t(`tier.pill.${x}`) }))}
          />
          <SelectFilter
            allLabel={t('reg.tlist.allScopes')}
            value={scopeFilter}
            onChange={(v) => f.set('scope', v)}
            options={SCOPE_KEYS.map((s) => ({ value: s, label: t(`compliance.scope.${s}`) }))}
          />
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBlockEnd: 12 }}>
        <RangeFilter
          id="tl-val" kind="money" label={t('reg.tlist.rangeValue')}
          min={vmin} max={vmax} inverted={valueBad}
          onMin={(v) => f.set('vmin', v)} onMax={(v) => f.set('vmax', v)}
        />
        <RangeFilter
          id="tl-date" kind="date" label={t('reg.tlist.rangeDate')}
          min={dFrom} max={dTo} inverted={dateBad}
          onMin={(v) => f.set('from', v)} onMax={(v) => f.set('to', v)}
        />
      </div>

      {activeChips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBlockEnd: 10 }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('reg.tlist.clearFilters')}</button>
        </div>
      )}

      {/* WYSIWYG: the same sentence the printed portfolio report carries, verifiable before printing */}
      <div className="reg-stamp">{stamp}</div>

      {myTenders.length === 0 ? (
        <EmptyState mode="empty">{t('reg.tlist.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={
            <button className="op-btn-ghost" onClick={clearFilters}>
              {t('reg.tlist.clearFilters')}
            </button>
          }
        >
          {valueBad || dateBad ? t('reg.range.invertedBody') : t('reg.tlist.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('tenders.colTender')} sortKey="code" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('tenders.colPath')}</th>
                  <th>{t('tenders.colStage')}</th>
                  <SortableTh
                    label={t('tenders.colProgress')}
                    sortKey="progress"
                    active={sortKey}
                    dir={dir}
                    onToggle={toggle}
                    style={{ width: 160 }}
                  />
                  <th>{t('tenders.colStatus')}</th>
                  <th className="op-end">{t('tenders.colDeviation')}</th>
                  <th className="op-end" style={{ width: 190 }}>
                    {t('tenders.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((x) => {
                  const cur = currentStage(x);
                  const status = tenderStatus(x, today, cal);
                  const pct = progressPct(x);
                  const href = `#/operator/t/${x.id}`;
                  return (
                    <tr key={x.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">
                          {x.title[lang]}
                        </div>
                        <div className="op-tbl__code">{x.code}</div>
                      </td>
                      <td>
                        <PathChip id={x.methodId} lang={lang} />
                      </td>
                      <td>
                        <div className="op-tbl__stage">{cur ? stageByKey(cur.key)?.[lang] ?? cur.key : t('tenders.completed')}</div>
                        {/* د4 — WHERE in the path, said by shape. One slot per real stage of THIS
                            request, so a 10-stage method draws ten and an 11-stage method eleven;
                            the current one is bigger and ringed, and turns red only where a
                            planned end actually passed unclosed. */}
                        <StageRail tender={x} today={today} lang={lang} />
                      </td>
                      <td>
                        <div className="op-prog">
                          <div className="op-prog__track">
                            <div
                              className="op-prog__fill"
                              style={{ width: `${pct}%`, background: PROGRESS_COLOR[status] }}
                            />
                          </div>
                          <span className="op-prog__v">{pct}%</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill size="sm" status={status} title={t(`match.status.${status}`)}>{t(`status.${status}`)}</StatusPill>
                      </td>
                      <td className="op-end">
                        <DevChip wd={tenderDeviationWd(x, today, cal)} />
                      </td>
                      <td className="op-end">
                        <div className="op-rowbtns">
                          <button className="op-btn-ghost" onClick={() => openQuickLook(x.id)}>
                            <Icon name="eye" size={13} />
                            {t('tenders.preview')}
                          </button>
                          {/* a real link so the file is keyboard-reachable — a bare <tr onClick> is not */}
                          <a className="op-btn-primary" href={href}>
                            {t('tenders.file')}
                          </a>
                        </div>
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
