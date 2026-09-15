import { contractFinancialAuthority, type ApprovalTiers } from '@masaar/scpp-rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney, fmtMoneyShort } from '../operator/derive';
import { operatorContact, orgName } from '../orgIdentity';
import { loadSession } from '../session';
import {
  aboveOwnFA, calendarOf, resolveTiersFor, todayIso, useStore,
  type OperatorOrg, type UserAccount,
} from '../store';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { hashParam, useHashParams, writeHashParam } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { roleKey } from './access';
import { companyStats, type CompanyStat } from './dashboardDerive';
import OperatorFieldsWizard from './OperatorFieldsWizard';
import OperatorLadderModal from './OperatorLadderModal';
import { LadderSourceTag, tierRange } from './TierPill';

/** '' = every company, else one of the honest data-derived buckets. */
type ChipFilter = '' | 'costCycle' | 'noAccounts';

/** One operating company enriched with its live governance counts — the sort/CSV row. */
interface OperatorRow {
  op: OperatorOrg;
  /**
   * ج2 · ج3 — the company's portfolio, taken WHOLE from `companyStats`, the one derivation the
   * follow-up room's company table and the company bars already read. Fields, tenders, the
   * lifecycle split, late stages, attributed contracts and the estimated value are its members;
   * none of them is recomputed here. That is not tidiness: a second count written on this screen
   * is a second definition, and the moment one of them drifts the registry and the room print two
   * different portfolios for the same company. The gap this batch closed was never in the data.
   */
  stat: CompanyStat;
  accounts: number;
  accountsTotal: number;
  aboveFa: number;
  /** the FA of each of the company's fields' contracts (§7.1) — display is derived, never stored */
  faList: number[];
  /** ج6/س18 — the company's first ENABLED account, or nobody at all */
  contact: UserAccount | undefined;
  /** ج5 — the company's field names and codes, folded once so the search box can reach them */
  fieldHay: string;
  /** د9 — has a ladder of its own been approved for this company (2026-08-25)? */
  ownLadder: boolean;
  /** the ceilings its requests are ACTUALLY measured against — its own, or the system default */
  tiers: ApprovalTiers;
}

/**
 * The operating companies (المشغّلون) — the counterpart to the vendor registry.
 * Each one's Financial Authority (§7) decides which of its requests enter the MCT
 * cost cycle (6.9), which MDOC participation tier applies (12.2), and what counts as
 * split procurement (7.2). That is why editing it is a justified, audited action.
 */
export default function Operators() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const session = loadSession();
  const isSuper = session?.role === 'SUPER_ADMIN';
  const today = todayIso();
  const words = useStampWords();

  const [dialog, setDialog] = useState<null | { kind: 'add' } | { kind: 'ladder'; op: OperatorOrg }>(null);
  const [q, setQ] = useState('');
  const [chipFilter, setChipFilter] = useState<ChipFilter>('');

  // one resolver (orgIdentity.orgName) for every company name on this screen — the table cell,
  // the sort key and the standing filter chip all print the same string
  const nameOf = (o: OperatorOrg) => orgName(o, lang);

  /**
   * The portfolio of every company, from the SINGLE derivation (§2-هـ ج2: «الفجوة مكانية لا
   * بياناتية»). It already covers all twelve — `companyStats` maps the operator registry, so a
   * company that has raised nothing still gets a row — and it orders them by portfolio value
   * descending, which is the resting order this table now inherits: an explainable order rather
   * than the store's insertion order, and the same one the room's bars are read in.
   */
  const cal = useMemo(() => calendarOf(state), [state]);
  const stats = useMemo(() => companyStats(state, today, cal), [state, today, cal]);

  // Every company with its live counts, computed once from the store — the
  // single source that feeds the KPI strip, the table and the CSV export.
  const allRows: OperatorRow[] = useMemo(() => stats.map((stat) => {
    const op = stat.op;
    const opFields = state.fields.filter((f) => f.operatorId === op.id);
    const opFieldIds = new Set(opFields.map((f) => f.id));
    // only EFFECTIVE contracts count toward the displayed authority — a terminated/expired
    // contract must not stretch the range and misrepresent current authority on a governance screen.
    const faList = state.serviceContracts
      .filter((c) => opFieldIds.has(c.fieldId))
      .map((c) => contractFinancialAuthority(c))
      .filter((n): n is number => n != null);
    return {
      op,
      stat,
      accounts: state.users.filter((u) => u.operatorId === op.id && !u.disabled).length,
      accountsTotal: state.users.filter((u) => u.operatorId === op.id).length,
      // no `CompanyStat` counterpart, and there should not be: crossing a company's OWN authority
      // is this registry's question (§7.1), not the portfolio's
      aboveFa: state.tenders.filter((x) => x.operatorId === op.id && aboveOwnFA(state, x)).length,
      faList,
      contact: operatorContact(state, op.id),
      // archived fields included on purpose: a company IS searchable by a field it used to hold —
      // the tenders and contracts raised under that name are still in the registry (ق7)
      fieldHay: opFields.map((f) => `${f.name} ${f.nameEn ?? ''} ${f.code}`).join(' ').toLowerCase(),
      // د9 — the row states WHICH ladder governs it, read through the one resolver; the flag is
      // the presence of an entry and the ceilings are the resolution of it, never two answers
      ownLadder: !!state.operatorTiers[op.id],
      tiers: resolveTiersFor(state, op.id),
    };
  }), [state, stats]);

  const orphanTenders = state.tenders.filter((x) => !x.operatorId).length;

  /** `?op=` — the company-detail table in the follow-up room links each name here (§5-ج). */
  const params = useHashParams();
  const opParam = hashParam(params, 'op', state.operators.map((o) => o.id));
  /** The record behind that id. The whitelist above guarantees it resolves, but the CHIP is built
   *  from the record rather than from the id, so there is no branch in which a label could fall
   *  back to «op-alwaha»: no record, no chip. */
  const opRecord = state.operators.find((o) => o.id === opParam);

  const qn = q.trim().toLowerCase();
  const filtered = useMemo(() => allRows.filter((r) => {
    if (opParam && r.op.id !== opParam) return false;
    // ج5 — the FIELD is how this registry is actually navigated: a reader arrives holding «الواحة
    // الشمالي», not the company's registered name. The field is what the authority hangs off
    // (§7.1), so searching by it is searching by the thing the row is about.
    if (qn && !(
      r.op.name.toLowerCase().includes(qn) ||
      (r.op.nameEn ?? '').toLowerCase().includes(qn) ||
      r.op.id.toLowerCase().includes(qn) ||
      r.fieldHay.includes(qn)
    )) return false;
    if (chipFilter === 'costCycle' && !(r.aboveFa > 0)) return false;
    if (chipFilter === 'noAccounts' && r.accountsTotal !== 0) return false;
    return true;
  }), [allRows, qn, chipFilter, opParam]);

  // Tri-state sort — the company name is Arabic-collated; the numeric columns sort by value.
  // Every numeric comparator reads the SAME member the cell prints, so «sort by late» orders the
  // column a reader is looking at rather than a parallel figure.
  const compare = useMemo(() => ({
    name: arCompare<OperatorRow>((r) => (lang === 'ar' ? r.op.name : r.op.nameEn ?? r.op.name)),
    fa: (a: OperatorRow, b: OperatorRow) => Math.min(...(a.faList.length ? a.faList : [0])) - Math.min(...(b.faList.length ? b.faList : [0])),
    accounts: (a: OperatorRow, b: OperatorRow) => a.accounts - b.accounts,
    tenders: (a: OperatorRow, b: OperatorRow) => a.stat.tenders - b.stat.tenders,
    active: (a: OperatorRow, b: OperatorRow) => a.stat.parts.active - b.stat.parts.active,
    late: (a: OperatorRow, b: OperatorRow) => a.stat.late - b.stat.late,
    aboveFa: (a: OperatorRow, b: OperatorRow) => a.aboveFa - b.aboveFa,
    contracts: (a: OperatorRow, b: OperatorRow) => a.stat.contracts - b.stat.contracts,
    value: (a: OperatorRow, b: OperatorRow) => a.stat.valueUSD - b.stat.valueUSD,
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(filtered, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs summed over the FILTERED companies — every value is a real store count.
  const kAccounts = filtered.reduce((s, r) => s + r.accounts, 0);
  const kTenders = filtered.reduce((s, r) => s + r.stat.tenders, 0);
  const kAboveFa = filtered.reduce((s, r) => s + r.aboveFa, 0);
  // ج4 — the two figures the registry already held and never printed: `fields` was computed for
  // the «الحقول (n)» link and thrown away in aggregate, and the estimated value had no tile at all.
  const kFields = filtered.reduce((s, r) => s + r.stat.fields, 0);
  const kValue = filtered.reduce((s, r) => s + r.stat.valueUSD, 0);
  const kValueShort = fmtMoneyShort(kValue);
  const kValueExact = fmtMoney(kValue);
  // د9 — companies standing OUTSIDE the system default. Counted over the filtered rows like every
  // other tile here, and off the row's own flag: `allRows` is built from the operator registry, so
  // an override left behind for a company that is no longer registered has no row and is counted
  // by nothing — the same «a figure must resolve to a row» rule the six tiles above obey.
  const kOwnLadder = filtered.filter((r) => r.ownLadder).length;
  /**
   * §2-ط — the filled statistical surface, spent here exactly as on the tenders registry, the
   * approvals chain and the contracts registry: one class, one tone map, the ink and its contrast
   * measured in tokens.css.
   *
   * NOT ONE OF THESE SIX IS A BUTTON, and that is the finding rather than an omission. The two
   * narrowings this registry owns are already offered as chips, and neither of them is what any
   * of these tiles counts: «فوق الصلاحية» counts TENDERS while the chip behind it selects
   * COMPANIES, so a tile that wrote it would land a set it never printed. A tile that cannot open
   * exactly what it counted is the placebo this plan rejects by name — so it stays a number.
   */
  const kpis: { key: string; l: string; v: string; tone: string; title?: string; delta?: string }[] = [
    { key: 'companies', l: t('reg.operators.kpiCompanies'), v: fmtCount(filtered.length, lang), tone: 'brand' },
    { key: 'fields', l: t('reg.operators.kpiFields'), v: fmtCount(kFields, lang), tone: 'planned', title: t('operators.fieldsNote') },
    { key: 'accounts', l: t('reg.operators.kpiAccounts'), v: fmtCount(kAccounts, lang), tone: 'planned' },
    { key: 'tenders', l: t('reg.operators.kpiTenders'), v: fmtCount(kTenders, lang), tone: 'progress' },
    { key: 'aboveFa', l: t('reg.operators.kpiAboveFa'), v: fmtCount(kAboveFa, lang), tone: 'risk', title: t('operators.aboveFaNote') },
    { key: 'ownLadder', l: t('opladder.kpiOwn'), v: fmtCount(kOwnLadder, lang), tone: 'progress', title: t('opladder.kpiOwnNote') },
    // the headline is short-form because a nine-figure sum cannot live at display size; the exact
    // grouped figure is printed under it whenever the short form rounded, so nothing hides
    {
      key: 'value',
      l: t('reg.operators.kpiValue'),
      v: kValueShort,
      tone: 'planned',
      title: t('operators.valueNote'),
      delta: kValueShort === kValueExact ? undefined : kValueExact,
    },
  ];

  const filterChips: FilterChip[] = [
    ...(opRecord
      ? [{
          key: 'op',
          label: t('reg.operators.chipOne', { name: nameOf(opRecord) }),
          count: filtered.length,
          active: true,
          onRemove: () => writeHashParam('op', null),
        }]
      : []),
    { key: '', label: t('reg.operators.chipAll'), count: allRows.length, active: chipFilter === '' },
    { key: 'costCycle', label: t('reg.operators.chipCostCycle'), count: allRows.filter((r) => r.aboveFa > 0).length, active: chipFilter === 'costCycle', title: t('operators.aboveFaNote') },
    { key: 'noAccounts', label: t('reg.operators.chipNoAccounts'), count: allRows.filter((r) => r.accountsTotal === 0).length, active: chipFilter === 'noAccounts' },
  ];
  const onChip = (key: string) => setChipFilter(key as ChipFilter);

  // One column contract drives the CSV — headers stay the machine field names,
  // rows are the filtered+sorted set exactly as shown on screen.
  const csvColumns: ReportColumn<OperatorRow>[] = [
    { key: 'name', label: 'name', value: (r) => r.op.name },
    { key: 'nameEn', label: 'nameEn', value: (r) => r.op.nameEn ?? '' },
    { key: 'id', label: 'id', value: (r) => r.op.id },
    { key: 'faMin', label: 'faMinUSD', value: (r) => (r.faList.length ? Math.min(...r.faList) : '') },
    { key: 'faMax', label: 'faMaxUSD', value: (r) => (r.faList.length ? Math.max(...r.faList) : '') },
    // د9 — the same fact the badge states, plus the two ceilings that fact resolves to. The
    // machine names say WHICH ladder and WHAT it is: a file carrying only the ceilings could not
    // be told apart from one carrying the default, which is the distinction the column exists for.
    { key: 'tiersSource', label: 'tiersSource', value: (r) => (r.ownLadder ? 'own' : 'default') },
    { key: 'tierOpMax', label: 'tierOperatorMaxUSD', value: (r) => r.tiers.operatorMaxUSD },
    { key: 'tierJmcMax', label: 'tierJmcMaxUSD', value: (r) => r.tiers.jmcMaxUSD },
    { key: 'fields', label: 'fields', value: (r) => r.stat.fields },
    { key: 'accountsEnabled', label: 'accountsEnabled', value: (r) => r.accounts },
    { key: 'accountsTotal', label: 'accountsTotal', value: (r) => r.accountsTotal },
    // ج6 — the same «no account, no person» rule the cell obeys: an empty field, never a guess
    { key: 'contact', label: 'contact', value: (r) => r.contact?.name ?? '' },
    { key: 'contactRole', label: 'contactRole', value: (r) => r.contact?.role ?? '' },
    { key: 'tenders', label: 'tenders', value: (r) => r.stat.tenders },
    // the four columns ج2/ج3 added to the screen travel into the file too — a CSV that carried
    // fewer columns than the table would break the screen↔file equivalence this registry keeps
    { key: 'tendersActive', label: 'tendersActive', value: (r) => r.stat.parts.active },
    { key: 'tendersLate', label: 'tendersLate', value: (r) => r.stat.late },
    { key: 'tendersAboveFa', label: 'tendersAboveFa', value: (r) => r.aboveFa },
    { key: 'contracts', label: 'contracts', value: (r) => r.stat.contracts },
    // the machine field name says what the figure IS (§2-هـ ج3): an estimate on tenders, not a
    // signed contract value — the column heading on screen says the same thing in words
    { key: 'tenderValueUSD', label: 'tenderValueUSD', value: (r) => r.stat.valueUSD },
  ];
  /**
   * The three narrowings this registry carries, declared once (م5). It exported without a stamp,
   * so a file holding ONE company — the `?op=` deep link the follow-up room's company table
   * writes — was byte-indistinguishable from a file holding all of them.
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    op: { label: t('reg.stamp.dim.op'), value: (v) => (opRecord && opRecord.id === v ? nameOf(opRecord) : v) },
    bucket: {
      label: t('reg.stamp.dim.bucket'),
      value: (v) => (v === 'costCycle' ? t('reg.operators.chipCostCycle') : t('reg.operators.chipNoAccounts')),
    },
  };
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opParam) p.set('op', opParam);
    if (chipFilter) p.set('bucket', chipFilter);
    return p;
  }, [q, qn, opParam, chipFilter]);
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  const doExport = () => {
    exportCsv('masaar-operators-registry', csvColumns, sorted, stamp);
    // local file export only — the server audit log will never contain this row
    toast(t('reg.operators.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1400 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('operators.title')}</h1>
          <div className="op-page__sub">{t('operators.sub', { n: fmtCount(state.operators.length, lang) })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setDialog({ kind: 'add' })}>
            {t('opfields.title')}
          </button>
          <button className="op-btn-ghost" onClick={doExport}>{t('reg.operators.exportCsv')}</button>
        </div>
      </div>

      {/* Honesty: this registry has no /operators endpoint — say so plainly in API mode. */}
      {isApiMode ? (
        <>
          <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>{t('reg.operators.localOnly')}</div>
          {/* د9 — the ladder editor is WITHHELD here, and this states the debt rather than
              offering a dead control: the server rules by the default ladder alone, so a locally
              approved ceiling would make a disabled «صادق» button and a 403 disagree. Disclosure,
              not breakage: the resolved ladder column above still reads, and it reads the default,
              which is exactly what the server enforces. */}
          <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>{t('opladder.apiBlocked')}</div>
        </>
      ) : (
        <div className="wz-note wz-note--info" style={{ marginBlockEnd: 12 }}>{t('operators.localNote')}</div>
      )}
      {!isSuper && (
        <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>
          {t('access.gateBanner', { role: session ? t(`roles.names.${roleKey(session.role)}`) : '—' })}
        </div>
      )}
      {orphanTenders > 0 && (
        <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>
          {/* an unowned tender has no field, so no Service Contract and no derivable authority:
              the engine fails CLOSED and reads it as ABOVE authority (§7.1) — no default figure. */}
          {t('operators.orphanTenders', { n: fmtCount(orphanTenders, lang) })}
        </div>
      )}

      <div className="ad-kpis ad-kpis--wrap" style={{ marginBlockStart: 4 }}>
        {kpis.map((k) => (
          <div key={k.key} className="ad-kpi ad-fill ad-kpi--fill" data-tone={k.tone}>
            <span className="ad-kpi__head">
              {/* the dot inherits the tile's ink under the fill (§2-ط): it is the tone worn twice,
                  not a second colour — and no tile here pulses, because none of them is «متأخرة» */}
              <span className="ad-kpi__dot" />
              <span className="ad-kpi__l" title={k.title}>{k.l}</span>
            </span>
            <span className="ad-kpi__row"><span className="ad-kpi__v">{k.v}</span></span>
            {k.delta && <span className="ad-kpi__delta mono">{k.delta}</span>}
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.operators.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={filterChips} onSelect={onChip} lang={lang} />
      </div>

      {/* WYSIWYG: the exact sentence the CSV will carry, readable before the file is written */}
      <div className="reg-stamp">{stamp}</div>

      {state.operators.length === 0 ? (
        <EmptyState
          mode="empty"
          /* an empty registry is exactly where the merged flow pays: ONE dialog produces the
             company AND its first usable field, instead of two screens and a re-pick. */
          action={<button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setDialog({ kind: 'add' })}>{t('opfields.title')}</button>}
        >
          {t('reg.operators.empty')}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={() => { setQ(''); setChipFilter(''); }}>{t('reg.operators.clearFilters')}</button>}
        >
          {t('reg.operators.noMatch')}
        </EmptyState>
      ) : (
        <>
          {/* eleven columns now: it scrolls INSIDE its own box, so the page never gains a
              horizontal scrollbar — the same containment the room's widest table uses */}
          <div className="op-tablecard ad-tblwrap">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('operators.colCompany')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  <SortableTh label={t('operators.colFa')} sortKey="fa" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 180 }} />
                  {/* not sortable: two values with no order between them — «own» is not above
                      «default», it is beside it, and a sort control would imply a ranking */}
                  <th style={{ width: 190 }}>{t('opladder.colSource')}</th>
                  {/* not sortable: the contact is a derived courtesy, not a governance figure —
                      a sort control on a column that is empty for half the rows offers an act
                      whose result the reader cannot predict */}
                  <th style={{ width: 150 }}>{t('operators.colContact')}</th>
                  <SortableTh label={t('operators.colAccounts')} sortKey="accounts" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 120 }} />
                  <SortableTh label={t('operators.colTenders')} sortKey="tenders" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 96 }} />
                  <SortableTh label={t('operators.colActive')} sortKey="active" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 90 }} />
                  <SortableTh label={t('operators.colLate')} sortKey="late" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 92 }} />
                  <SortableTh label={t('operators.colAboveFa')} sortKey="aboveFa" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 112 }} />
                  <SortableTh label={t('operators.colContracts')} sortKey="contracts" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 92 }} />
                  {/* ج3 — the heading is the judgment: this is what the company ASKED for across
                      its tenders, never what it signed. «قيمة العقود» is a different column, and
                      it lives in the follow-up room where the contracts are the subject. */}
                  <SortableTh label={t('operators.colTenderValue')} sortKey="value" active={sortKey} dir={dir} onToggle={toggle} className="op-end" style={{ width: 140 }} />
                  <th style={{ width: 200 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.op.id} className="op-tbl__row">
                    <td>
                      <div className="op-tbl__name" dir="auto">{nameOf(r.op)}</div>
                      <div className="op-tbl__code">{r.op.id}</div>
                    </td>
                    <td>
                      {r.faList.length === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : Math.min(...r.faList) === Math.max(...r.faList)
                          ? <span className="op-code">{fmtMoney(r.faList[0]!)}</span>
                          : <span className="op-code">{fmtMoney(Math.min(...r.faList))}–{fmtMoney(Math.max(...r.faList))}</span>}
                    </td>
                    {/* د9 — WHICH ladder this company's requests are measured against. The badge
                        states the source and the range under it states what that source resolves
                        to, so the row never asserts a ladder without showing it. */}
                    <td>
                      <LadderSourceTag own={r.ownLadder} />
                      <div className="op-tbl__code" style={{ marginBlockStart: 3 }}>
                        {tierRange('OPERATOR', r.tiers)} · {tierRange('JMC', r.tiers)}
                      </div>
                    </td>
                    {/* ج6/س18 — a company with no enabled account gets NO cell content at all.
                        The alternative on offer (a name lifted off an audit line, a role with
                        nobody behind it) is the fabrication this registry exists to refuse. */}
                    <td>
                      {r.contact ? (
                        <>
                          <div className="op-tbl__name" dir="auto">{r.contact.name}</div>
                          <div className="op-tbl__code">{t(`roles.names.${roleKey(r.contact.role)}`)}</div>
                        </>
                      ) : (
                        <span className="op-dev op-dev--none">—</span>
                      )}
                    </td>
                    <td>
                      {r.accountsTotal === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : <span style={{ fontSize: 12 }}>{t('operators.nAccounts', { n: fmtCount(r.accounts, lang), all: fmtCount(r.accountsTotal, lang) })}</span>}
                    </td>
                    <td className="op-end mono">
                      {r.stat.tenders === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : fmtCount(r.stat.tenders, lang)}
                    </td>
                    <td className="op-end mono" title={t('operators.activeNote')}>
                      {r.stat.parts.active === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : fmtCount(r.stat.parts.active, lang)}
                    </td>
                    {/* the ONE cell in this table that changes ink, for the one reason the alarm
                        vocabulary allows: a real count of stages past their planned close */}
                    <td className={`op-end mono${r.stat.late > 0 ? ' ad-num--late' : ''}`} title={t('operators.lateNote')}>
                      {r.stat.late === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : fmtCount(r.stat.late, lang)}
                    </td>
                    <td className="op-end mono">
                      {r.aboveFa > 0
                        ? <span className="acc-attr" title={t('operators.aboveFaNote')}>{t('operators.nAboveFa', { n: fmtCount(r.aboveFa, lang) })}</span>
                        : <span className="op-dev op-dev--none">—</span>}
                    </td>
                    <td className="op-end mono" title={t('operators.contractsNote')}>
                      {r.stat.contracts === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : fmtCount(r.stat.contracts, lang)}
                    </td>
                    <td className="op-end mono" title={t('operators.valueNote')}>
                      {r.stat.valueUSD === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : fmtMoneyShort(r.stat.valueUSD)}
                    </td>
                    <td className="op-end">
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {/* FA is edited on the field's Service Contract (§7.1) — go there */}
                        <a className="acc-open" href={`#/admin/fields?op=${encodeURIComponent(r.op.id)}`}>
                          {t('operators.openFields', { n: fmtCount(r.stat.fields, lang) })}
                        </a>
                        {/* ج1 — the most-asked path off this row, and the registry it lands in
                            already reads `?op=` through `useFilterParams`. A real <a>: it is
                            addressable, middle-clickable and copyable, which a handler is not. */}
                        <a className="acc-open" href={`#/admin/tenders?op=${encodeURIComponent(r.op.id)}`}>
                          {t('operators.openTenders', { n: fmtCount(r.stat.tenders, lang) })}
                        </a>
                        {/* د9 — the supervisor's act, gated exactly like the add button beside it:
                            reading the ladder is everyone's, approving one is SUPER_ADMIN's. In
                            api-mode it is withheld entirely (the banner above says why), because
                            the server enforces the default alone — a button whose result the 403
                            would contradict is worse than an absent one. */}
                        {!isApiMode && (
                          <button
                            className="acc-open"
                            disabled={!isSuper}
                            title={isSuper ? undefined : t('access.gateNotSuper')}
                            onClick={() => setDialog({ kind: 'ladder', op: r.op })}
                          >
                            {t('opladder.action')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      <div className="ad-empty-inline" style={{ marginBlockStart: 10 }}>{t('operators.noDelete')}</div>

      {/* request 9 — registering a company and registering its fields are one errand (every field
          has exactly one operator), so the old add-operator modal is replaced by the merged
          checklist form. The GLOBAL approval ladder it used to display moved inside it. */}
      {dialog?.kind === 'add' && <OperatorFieldsWizard onClose={() => setDialog(null)} />}
      {/* د9 — approving one company's own ladder (client decision 2026-08-25) */}
      {dialog?.kind === 'ladder' && <OperatorLadderModal op={dialog.op} onClose={() => setDialog(null)} />}
    </div>
  );

}
