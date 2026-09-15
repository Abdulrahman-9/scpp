import { stageByKey, type ApprovalTier } from '@masaar/scpp-rules';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SectionExplainer } from '../registry/SectionExplainer';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useFilterParams } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { loadSession } from '../session';
import { byName, byOid, calendarOf, currentStage, resolveTiersFor, todayIso, useStore } from '../store';
import {
  approvalChain, awaitingTier, ratifiedInMonth, ratifyWait,
  type ApprovalRow, type RatifyWait,
} from './adminDerive';
import { useAdminUi } from './AdminShell';
import { DefaultLadderNote, TierPill } from './TierPill';

/** '' = both gated tiers, else one of them. ط1 is never in this registry — it opens no gate. */
type TierFilter = '' | Exclude<ApprovalTier, 'OPERATOR'>;
const GATED: Exclude<ApprovalTier, 'OPERATOR'>[] = ['JMC', 'MDOC'];

/** Ladder order for the sortable tier column — the two gates in ascending authority. */
const TIER_RANK: Record<string, number> = { JMC: 1, MDOC: 2 };

/**
 * س‌ل2 — the two SETTLED decisions offered as chips. `pending` is not among them on purpose: it is
 * the `?pending=1` gate every follow-up-room tile already links through, and a second control for
 * the same concept is the duplication §2-د ع7 refuses. `cancelled`/`suspended` are lifecycle
 * states, not decisions of an approving body — the table shows them, nothing filters by them.
 */
const SETTLED = ['ratified', 'returned'] as const;
type DecFilter = '' | (typeof SETTLED)[number];

/**
 * سلسلة الموافقات» — the approval chain (client decision ق1, replacing the MCT screen per ق3).
 *
 * The client does not run an abstract cost cycle; it runs a named chain of approving bodies, and
 * this is that chain made visible: every request whose estimated value climbs past the operating
 * company's own authority, the body whose signature it waits on, and where its decision stands.
 * Nothing here is stored — the tier is derived from the value against the GLOBAL ladder, so the
 * screen re-sorts itself the moment a ceiling moves, and no row can claim an approval the store
 * cannot vouch for.
 *
 * د12 adds what the registry could not previously say: WHO signed and WHEN (س‌ل1, off the stored
 * `ratification.by/on` that were being kept and never shown), how long an undecided file has been
 * owed its signature (س‌ل3/ل5), and — for a session that holds the ط2 seat — an opening view of
 * exactly what waits on IT (ل2). What it still does not do, and must not: decide. There is no act
 * on any row here but «open the file», because the decision ritual (authority gate, entry preview,
 * mandatory reason) lives in the tender file and a row cannot carry it (س‌ل6/ل7).
 */
export default function Approvals() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const cal = calendarOf(state);
  /** د9 — the SYSTEM DEFAULT, used only by the explainer and the empty state, both of which
   *  describe the system rather than one request. Every ROW resolves its own operator's ladder. */
  const tiers = state.approvalTiers;
  const words = useStampWords();
  const session = loadSession();

  const [q, setQ] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [fieldId, setFieldId] = useState('');

  /**
   * The address contract (§5-ج), now read through the SAME `useFilterParams` mirror every other
   * registry uses. It replaces the hand-rolled `useHashParams` + `useState` + `useEffect` trio this
   * screen carried: three dimensions now move together (a tile sets the band AND the decision gate),
   * and `setMany` is what makes that one history entry instead of two half-applied ones.
   *
   * `OPERATOR` is rejected by this screen's own narrowing because the chain, by definition (ق1),
   * never holds a ط1 row — the shared whitelist admits the value, this registry does not.
   */
  const f = useFilterParams();
  const tierRaw = f.get('tier');
  const tierFilter: TierFilter = tierRaw === 'JMC' || tierRaw === 'MDOC' ? tierRaw : '';
  /**
   * `?pending=1` — the gate that makes this screen able to HOLD what the follow-up room's
   * «بانتظار موافقة …» tiles counted. Those tiles count `decision === 'pending'` within a band;
   * `?tier=JMC` alone opens the whole band, ratified and returned requests included.
   *
   * It and `?dec=` are ONE dimension in two names: every control that sets one clears the other, so
   * «صودق» and «بانتظار القرار» can never both narrow the same list into the empty set.
   */
  const pendingOnly = f.get('pending') === '1';
  const decFilter = f.get('dec') as DecFilter;

  const chain = useMemo(() => approvalChain(state), [state]);

  const fieldName = (id: string | undefined) => {
    const x = state.fields.find((y) => y.id === id);
    return x ? (lang === 'ar' ? x.name : x.nameEn ?? x.name) : null;
  };
  const operatorName = (id: string | undefined) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : null;
  };

  const qn = q.trim().toLowerCase();
  /**
   * The base every counting tile reads off: each OTHER narrowing applied, and neither of the two
   * this screen's tiles own (the band and the decision). It is the same law د10 proved on the
   * tenders registry — «a tile opens EXACTLY what it counted» — and counting off a set that already
   * carried one of the tile's own dimensions is precisely how a tile prints 3 and lands 1.
   */
  const base = useMemo(() => chain.filter((r) => {
    if (operatorId && r.tender.operatorId !== operatorId) return false;
    if (fieldId && r.tender.fieldId !== fieldId) return false;
    if (qn && !(`${r.tender.code} ${r.tender.title.ar} ${r.tender.title.en}`.toLowerCase().includes(qn))) return false;
    return true;
  }), [chain, operatorId, fieldId, qn]);

  /** The decision gate alone — what the TIER chips count off, so a band chip never promises rows the gate removed. */
  const decided = useMemo(() => {
    if (pendingOnly) return base.filter((r) => r.decision === 'pending');
    return decFilter ? base.filter((r) => r.decision === decFilter) : base;
  }, [base, pendingOnly, decFilter]);
  /** The band alone — what the DECISION chips count off, by the same rule mirrored. */
  const tiered = useMemo(
    () => (tierFilter ? base.filter((r) => r.tier === tierFilter) : base),
    [base, tierFilter],
  );
  const rows = useMemo(
    () => (tierFilter ? decided.filter((r) => r.tier === tierFilter) : decided),
    [decided, tierFilter],
  );

  /**
   * ل2 — a joint-committee session opens on what waits for ITS signature.
   *
   * A DEFAULT, not a cell: it is written into the address exactly once per mount, only when the
   * address carries no narrowing of its own, and every chip it sets is removable the instant it
   * lands (the band widens on «كل الطبقات», the gate carries its own ✕). A link that already says
   * what to show — from the follow-up room, from a colleague — is never overridden, and a reader
   * who clears the filters is not re-imprisoned on the next render.
   */
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (session?.role !== 'JMC_APPROVER') return;
    const p = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
    if (p.has('tier') || p.has('pending') || p.has('dec')) return;
    f.setMany({ tier: 'JMC', pending: '1' });
  }, [session?.role, f]);

  const compare = useMemo(() => ({
    tender: arCompare<ApprovalRow>((r) => r.tender.title[lang]),
    value: (a: ApprovalRow, b: ApprovalRow) => a.tender.estimatedValueUSD - b.tender.estimatedValueUSD,
    tier: (a: ApprovalRow, b: ApprovalRow) => (TIER_RANK[a.tier] ?? 0) - (TIER_RANK[b.tier] ?? 0),
    // an undecided row sorts as no date at all rather than as the epoch — «not yet» is not «oldest»
    decidedOn: (a: ApprovalRow, b: ApprovalRow) =>
      (a.tender.ratification?.on ?? '').localeCompare(b.tender.ratification?.on ?? ''),
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  /**
   * س‌ل4 + §2-ط — the counting strip, filled by tone and clickable where a filter exists behind it.
   *
   * The two ladder tiles wear the SAME two fills the tier pills wear (`--status-jmc/mdoc-fill`,
   * measured in tokens.css and guarded by the §2-ط contrast test), so «بانتظار اللجنة» and the JMC
   * chip beside it are one colour for one body. Each sets BOTH dimensions it owns in one `setMany`.
   *
   * «صودق هذا الشهر» is deliberately NOT a button: its narrowing is a calendar MONTH, and this
   * registry has no month dimension to land on. `?dec=ratified` would open every ratified row ever,
   * i.e. a tile that counts 2 and lands 9 — the false button §2-د ع4 refuses. It states its figure
   * and stays still until a month filter exists to make it honest.
   */
  const jmcOn = tierFilter === 'JMC' && pendingOnly;
  const mdocOn = tierFilter === 'MDOC' && pendingOnly;
  const bandTile = (tier: Exclude<ApprovalTier, 'OPERATOR'>, on: boolean) => () =>
    f.setMany(on ? { tier: '', pending: '', dec: '' } : { tier, pending: '1', dec: '' });
  const kpis: { key: string; l: string; v: number; tone: string; on?: boolean; go?: () => void }[] = [
    { key: 'jmc', l: t('approvals.kpiJmc'), v: awaitingTier(base, 'JMC').length, tone: 'jmc', on: jmcOn, go: bandTile('JMC', jmcOn) },
    { key: 'mdoc', l: t('approvals.kpiMdoc'), v: awaitingTier(base, 'MDOC').length, tone: 'mdoc', on: mdocOn, go: bandTile('MDOC', mdocOn) },
    { key: 'ratified', l: t('approvals.kpiRatified'), v: ratifiedInMonth(base, today).length, tone: 'done' },
  ];

  const tierChips: FilterChip[] = [
    { key: '', label: t('approvals.allTiers'), count: decided.length, active: tierFilter === '' },
    ...GATED.map((tier) => ({
      key: tier,
      label: t(`tier.pill.${tier}`),
      count: decided.filter((r) => r.tier === tier).length,
      active: tierFilter === tier,
    })),
  ];
  /**
   * س‌ل2 — the decision chips, living alongside the band chips without restating them. «الكل» is
   * pressed only while NEITHER half of the decision dimension narrows anything, and pressing it
   * clears both — which is what keeps `pending` and `dec` one concept with one visible state.
   */
  const decChips: FilterChip[] = [
    {
      key: '',
      label: t('approvals.allDecisions'),
      count: tiered.length,
      active: !decFilter && !pendingOnly,
    },
    ...SETTLED.map((d) => ({
      key: d,
      label: t(`approvals.dec.${d}`),
      count: tiered.filter((r) => r.decision === d).length,
      active: decFilter === d,
    })),
  ];
  /** The URL-borne gate, as a standing chip carrying its own dismiss (§5-ج). */
  const linkChips: FilterChip[] = pendingOnly
    ? [{ key: 'pending', label: t('approvals.chipPending'), count: rows.length, active: true, onRemove: () => f.set('pending', '') }]
    : [];

  /**
   * The narrowings this registry carries, declared ONCE so the exported file describes the same
   * view the screen shows (م5). `pending` prints its value alone («بانتظار المصادقة فقط»), the
   * reading a flag takes in Arabic — a label-less `FilterLabel` is exactly that case.
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    tier: { label: t('reg.stamp.dim.tier'), value: (v) => t(`tier.pill.${v}`) },
    pending: { label: '', value: () => t('approvals.chipPending') },
    dec: { label: t('reg.stamp.dim.decision'), value: (v) => t(`approvals.dec.${v}`) },
    op: { label: t('reg.stamp.dim.op'), value: (v) => operatorName(v) ?? v },
    field: { label: t('reg.stamp.dim.field'), value: (v) => fieldName(v) ?? v },
  };
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (tierFilter) p.set('tier', tierFilter);
    if (pendingOnly) p.set('pending', '1');
    if (decFilter) p.set('dec', decFilter);
    if (operatorId) p.set('op', operatorId);
    if (fieldId) p.set('field', fieldId);
    return p;
    // `labels` closes over `lang` for its renderers; the PARAMS depend only on the filters
  }, [q, qn, tierFilter, pendingOnly, decFilter, operatorId, fieldId]);
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  /**
   * س‌ل1/س‌ل3 ride into the export too: a chain filtered to «صودق» whose CSV could not say by whom
   * would send the reader back to the screen for the one fact they exported the file to keep.
   * `waitWd` carries the measure only where it exists — an empty cell for a decided or unplanned
   * row, never a 0 that reads as «on time».
   */
  const csvColumns: ReportColumn<ApprovalRow>[] = [
    { key: 'code', label: 'code', value: (r) => r.tender.code },
    { key: 'title', label: 'title', value: (r) => r.tender.title[lang] },
    { key: 'operator', label: 'operator', value: (r) => operatorName(r.tender.operatorId) ?? '' },
    { key: 'field', label: 'field', value: (r) => fieldName(r.tender.fieldId) ?? '' },
    { key: 'valueUSD', label: 'valueUSD', value: (r) => r.tender.estimatedValueUSD },
    { key: 'tier', label: 'tier', value: (r) => r.tier },
    { key: 'stage', label: 'stage', value: (r) => currentStage(r.tender)?.key ?? 'completed' },
    { key: 'decision', label: 'decision', value: (r) => r.decision },
    { key: 'decidedBy', label: 'decidedBy', value: (r) => (r.tender.ratification ? byName(r.tender.ratification.by) : '') },
    { key: 'decidedOn', label: 'decidedOn', value: (r) => r.tender.ratification?.on ?? '' },
    {
      key: 'waitWd',
      label: 'waitWd',
      value: (r) => {
        const w = ratifyWait(r, today, cal);
        return w.kind === 'overdue' ? w.wd : '';
      },
    },
  ];
  const doExport = () => {
    exportCsv('masaar-approval-chain', csvColumns, sorted, stamp);
    toast(t('approvals.toastExport'));
  };

  /** «مسح الفلاتر» clears the ADDRESS and the local controls in one act — otherwise the next
   *  render re-seeds from the hash the button just appeared to clear. */
  const clearFilters = () => {
    setQ(''); setOperatorId(''); setFieldId('');
    f.clear();
  };

  /** س‌ل3/ل5 — the four answers, each said in its own words; only one of them is a number. */
  const waitCell = (w: RatifyWait) => {
    if (w.kind === 'overdue') {
      return <span className="op-dev" title={t('approvals.waitDef')}>{t('approvals.waitWd', { n: fmtCount(w.wd, lang) })}</span>;
    }
    const why = w.kind === 'onPlan' ? 'waitOnPlan' : w.kind === 'unplanned' ? 'waitUnplanned' : 'waitDecided';
    return <span className="op-dev op-dev--none" title={t(`approvals.${why}`)}>{t('audit.byNone')}</span>;
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('approvals.title')}</h1>
          <div className="op-page__sub">{t('approvals.sub', { n: fmtCount(chain.length, lang) })}</div>
        </div>
        {/* the admin reads the chain here and decides inside the tender file — no primary act on this screen */}
        <button className="op-btn-ghost" onClick={doExport}>{t('approvals.exportCsv')}</button>
      </div>

      {/* The ladder itself, in the client's own numbers — collapsed, because the registry is the
          subject and the model is one click away for whoever needs it. */}
      <SectionExplainer title={t('approvals.explainTitle')}>
        <p>{t('approvals.explainIntro')}</p>
        <p><strong>{t('tier.pill.OPERATOR')}</strong> — {t('tier.band.OPERATOR', { max: fmtMoney(tiers.operatorMaxUSD) })}</p>
        <p><strong>{t('tier.pill.JMC')}</strong> — {t('tier.band.JMC', { min: fmtMoney(tiers.operatorMaxUSD), max: fmtMoney(tiers.jmcMaxUSD) })}</p>
        <p><strong>{t('tier.pill.MDOC')}</strong> — {t('tier.band.MDOC', { min: fmtMoney(tiers.jmcMaxUSD) })}</p>
        <p>{t('approvals.explainFailClosed')}</p>
        {/* د9 — the three bands above are the SYSTEM DEFAULT, and since 2026-08-25 that is no
            longer the whole truth: this names it as the default and says how many companies stand
            on a ladder of their own. The rows below are unaffected — each is measured against its
            own company's ladder already. */}
        <DefaultLadderNote state={state} />
      </SectionExplainer>

      {/* Honesty (Design Principle 4): the ladder is client-side configuration — there is no
          server route that issues it yet, and the screen says so rather than implying one. */}
      {isApiMode && <div className="wz-note wz-note--warn" style={{ marginBlockStart: 12 }}>{t('approvals.localLadder')}</div>}

      <div className="ad-kpis ad-kpis--3" style={{ marginBlockStart: 12 }} data-noprint="1">
        {kpis.map((k) => {
          const body = (
            <>
              <span className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></span>
              <span className="ad-kpi__row"><span className="ad-kpi__v">{fmtCount(k.v, lang)}</span></span>
            </>
          );
          return k.go ? (
            <button
              key={k.key}
              type="button"
              className="ad-kpi ad-fill ad-kpi--fill"
              data-tone={k.tone}
              aria-pressed={k.on}
              title={t('approvals.kpiHint', { label: k.l })}
              onClick={k.go}
            >
              {body}
            </button>
          ) : (
            <div key={k.key} className="ad-kpi ad-fill ad-kpi--fill" data-tone={k.tone}>
              {body}
              <span className="ad-kpi__win">{t('approvals.kpiMonthWindow')}</span>
            </div>
          );
        })}
      </div>

      <div className="acc-filters" data-noprint="1">
        <SearchBox value={q} onChange={setQ} placeholder={t('approvals.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={tierChips} onSelect={(key) => f.set('tier', key)} lang={lang} />
        {/* one dimension, two names: choosing a settled decision drops the pending gate */}
        <FilterChips chips={decChips} onSelect={(key) => f.setMany({ dec: key, pending: '' })} lang={lang} />
        {linkChips.length > 0 && <FilterChips chips={linkChips} onSelect={() => {}} lang={lang} />}
        {/* the registries are empty in API mode (no /operators, /fields route) — an empty select
            would be a control with nothing to choose, so it is simply not rendered */}
        {state.operators.length > 0 && (
          <select className="op-filter-select" value={operatorId} aria-label={t('fields.allOperators')} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">{t('fields.allOperators')}</option>
            {state.operators.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.name : o.nameEn ?? o.name}</option>)}
          </select>
        )}
        {state.fields.length > 0 && (
          <select className="op-filter-select" value={fieldId} aria-label={t('approvals.allFields')} onChange={(e) => setFieldId(e.target.value)}>
            <option value="">{t('approvals.allFields')}</option>
            {state.fields.map((x) => <option key={x.id} value={x.id}>{lang === 'ar' ? x.name : x.nameEn ?? x.name}</option>)}
          </select>
        )}
      </div>

      {/* WYSIWYG: the exact sentence the CSV will carry, readable before the file is written */}
      <div className="reg-stamp">{stamp}</div>

      {chain.length === 0 ? (
        <EmptyState mode="empty">{t('approvals.emptyStore', { max: fmtMoney(tiers.operatorMaxUSD) })}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('approvals.clearFilters')}</button>}
        >
          {t('approvals.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard acc-chain">
            <table className="op-tbl">
              <thead>
                <tr>
                  {/* only the action column is pinned — the rest size to their content, so the
                      tender title keeps the width it needs in both languages */}
                  <SortableTh label={t('tenders.colTender')} sortKey="tender" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('approvals.colField')}</th>
                  <SortableTh label={t('approvals.colValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} />
                  <SortableTh label={t('approvals.colTier')} sortKey="tier" active={sortKey} dir={dir} onToggle={toggle} />
                  <th>{t('approvals.colBody')}</th>
                  <th>{t('tenders.colStage')}</th>
                  <th>{t('approvals.colDecision')}</th>
                  {/* س‌ل3 — the header carries the arithmetic, so the figure is never a number
                      whose origin has to be guessed (the same rule `match.def` set for ق4) */}
                  <th title={t('approvals.waitDef')}>{t('approvals.colWaiting')}</th>
                  <th>{t('approvals.colDecidedBy')}</th>
                  <SortableTh label={t('approvals.colDecidedOn')} sortKey="decidedOn" active={sortKey} dir={dir} onToggle={toggle} />
                  <th style={{ width: 150 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const cur = currentStage(r.tender);
                  const field = fieldName(r.tender.fieldId);
                  const rat = r.tender.ratification;
                  return (
                    <tr key={r.tender.id} className="op-tbl__row">
                      <td>
                        <div className="op-tbl__name" dir="auto">{r.tender.title[lang]}</div>
                        <div className="op-tbl__code">{r.tender.code}</div>
                      </td>
                      <td>
                        {field
                          ? <span dir="auto" style={{ fontSize: 12.5 }}>{field}</span>
                          : <span className="op-dev op-dev--none" title={t('approvals.noField')}>{t('audit.byNone')}</span>}
                      </td>
                      <td><span className="op-code">{fmtMoney(r.tender.estimatedValueUSD)}</span></td>
                      {/* د9 — the row's ladder, not the screen's: `r.tier` was already resolved
                          against this tender's operator, so the tooltip must be too */}
                      <td><TierPill tier={r.tier} tiers={resolveTiersFor(state, r.tender.operatorId)} /></td>
                      <td><span style={{ fontSize: 12.5 }}>{t(`tier.body.${r.tier}`)}</span></td>
                      <td>{cur ? stageByKey(cur.key)?.[lang] ?? cur.key : t('tenders.completed')}</td>
                      <td>
                        <span className={`ad-dec ad-dec--${r.decision}`}>{t(`approvals.dec.${r.decision}`)}</span>
                      </td>
                      <td>{waitCell(ratifyWait(r, today, cal))}</td>
                      {/* س‌ل1 — the stored actor, read through the shape-tolerant byName/byOid: the
                          registry said «صودق» and could not say by whom, while `ratification.by`
                          was on file the whole time. A row with no decision shows the ONE dash key
                          both this table and the audit log read (`audit.byNone`) — no second way of
                          writing «nobody is recorded here». */}
                      <td dir="auto" title={rat ? byOid(rat.by) : undefined}>
                        {rat ? byName(rat.by) : <span className="op-dev op-dev--none">{t('audit.byNone')}</span>}
                      </td>
                      <td>
                        {rat
                          ? <span className="op-code">{rat.on.slice(0, 10)}</span>
                          : <span className="op-dev op-dev--none">{t('audit.byNone')}</span>}
                      </td>
                      <td className="op-end">
                        {/* a real link — the decision itself is taken in the tender file, never here */}
                        <a className="acc-open" href={`#/admin/review/${r.tender.id}`}>
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
