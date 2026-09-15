import { StatusPill } from '@masaar/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount } from '../operator/derive';
import { DevBadge } from '../operator/DevBadge';
import { Icon } from '../operator/Icon';
import { loadSession } from '../session';
import { EmptyState } from '../registry/EmptyState';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { ScoreBar } from '../registry/ScoreBar';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useFilterParams, type ArchiveView } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { govReasonValid, todayIso, useStore, type VendorState } from '../store';
import { useAdminUi } from './AdminShell';
import { roleKey } from './access';
import { deriveParticipation, vendorStats, vendorStatus, type VendorGovStatus } from './entities';
import { MinistryListsExplainer } from './MinistryLists';
import { Modal } from './Modal';
import { useActor } from './UserActions';

const STATUS_PILL = { eligible: 'done', suspended: 'delayed', banned: 'blocked' } as const;

/**
 * '' = every classification. `moo` is the MINISTRY SUPPLIERS list (C8.7 — government and private
 * firms alike), `state` the five Article-25 government companies; ق5 separated them because one
 * label «قائمة الوزارة» was standing for both and they govern different rules. The rest are the
 * derived governance statuses. The ARCHIVE (ق7) is a separate, orthogonal dimension — it lives in
 * `?arch=` rather than in this one-of-N set, because an entity is archived AND eligible, not
 * archived INSTEAD of eligible.
 */
type VendorFilter = '' | 'moo' | 'state' | VendorGovStatus;

/** A registry row: the vendor plus its derived governance status and participation counts. */
interface Row {
  vendor: VendorState;
  status: VendorGovStatus;
  bids: number;
  wins: number;
}

/**
 * Entity registry (سجل الجهات) — classification, capability, participation, per-row 360° file.
 *
 * Client request 14: the default view is EVERY entity, archived ones included and visibly muted,
 * with the actions the client asked for on the surface — «إضافة جهة» in the header, «تعديل» on
 * every row (it opens the 360° file, which is where an entity is actually edited), and archive /
 * restore inside that file's governance row (ق7 — archive, never delete).
 */
export default function Vendors() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();
  const session = loadSession();
  const isSuper = session?.role === 'SUPER_ADMIN';

  const words = useStampWords();

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<VendorFilter>('');
  const [adding, setAdding] = useState(false);
  /**
   * The archive side (ق7) in the address (request 7). This registry's default is `all` — request 14
   * asked for EVERY entity by default, archived ones visibly muted — so the widest view is also the
   * default and the stamp names whichever side is in force.
   */
  const f = useFilterParams();
  const arch = (f.get('arch') || 'all') as ArchiveView;

  // One pass over the store: status + participation counts are the shape the table,
  // KPIs, sort and export all read from.
  const derived = useMemo<Row[]>(() => state.vendors.map((v) => {
    const stats = vendorStats(deriveParticipation(state, v, today));
    return { vendor: v, status: vendorStatus(v, today), bids: stats.bids, wins: stats.wins };
  }), [state, today]);

  const qn = q.trim().toLowerCase();
  // the search + the archive side, before the classification chips narrow further — the chip
  // counts read off this set, so a chip never promises rows the archive filter already removed
  const searched = useMemo(() => derived.filter((r) => {
    if (qn && !r.vendor.name.toLowerCase().includes(qn)) return false;
    // the archive is its own dimension: 'all' (the default, request 14) shows EVERY entity with the
    // archived ones visibly muted — a registry that silently omits rows is what the client complained
    // about — while 'live'/'archived' narrow to one side of it.
    if (arch === 'live' && r.vendor.archived) return false;
    if (arch === 'archived' && !r.vendor.archived) return false;
    return true;
  }), [derived, qn, arch]);

  const rows = useMemo(() => searched.filter((r) => {
    if (filter === 'moo') return r.vendor.mooListed;
    if (filter === 'state') return !!r.vendor.isStateCompany;
    if (filter) return r.status === filter;
    return true;
  }), [searched, filter]);

  // Name is Arabic-collated; participation sorts on the real bid count.
  const compare = useMemo(() => ({
    name: arCompare<Row>((r) => r.vendor.name),
    bids: (a: Row, b: Row) => a.bids - b.bids,
  }), []);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  // KPIs read the filtered view — «what the user sees». All counts come from real store fields
  // (the two ministry registers, the derived governance status). Restricted = suspended + banned.
  const restricted = rows.filter((r) => r.status !== 'eligible').length;
  const kpis = [
    { l: t('reg.vendors.kpiShown'), v: rows.length, tone: undefined as string | undefined },
    { l: t('vendors.stateChip'), v: rows.filter((r) => r.vendor.isStateCompany).length, tone: undefined },
    { l: t('vendors.mooChip'), v: rows.filter((r) => r.vendor.mooListed).length, tone: undefined },
    { l: t('reg.vendors.kpiRestricted'), v: restricted, tone: restricted > 0 ? 'var(--status-delayed)' : undefined },
  ];

  /**
   * ق5 — the two lists are now two chips with two different names, because they are two different
   * registers governing two different rules: the five Article-25 GOVERNMENT companies (the §9
   * participation targets) and the ministry's SUPPLIERS list (C8.7, government and private alike).
   * The explainer under the head states which rule reads which.
   */
  const filterChips: FilterChip[] = [
    { key: '', label: t('reg.vendors.all'), count: searched.length, active: filter === '' },
    { key: 'state', label: t('vendors.stateChip'), count: searched.filter((r) => r.vendor.isStateCompany).length, active: filter === 'state', title: t('vendors.stateDef') },
    { key: 'moo', label: t('vendors.mooChip'), count: searched.filter((r) => r.vendor.mooListed).length, active: filter === 'moo', title: t('vendors.mooDef') },
    { key: 'eligible', label: t('entity.status_eligible'), count: searched.filter((r) => r.status === 'eligible').length, active: filter === 'eligible' },
    { key: 'suspended', label: t('entity.status_suspended'), count: searched.filter((r) => r.status === 'suspended').length, active: filter === 'suspended' },
    { key: 'banned', label: t('entity.status_banned'), count: searched.filter((r) => r.status === 'banned').length, active: filter === 'banned' },
  ];
  // the archive chips count the WHOLE registry: they are the dimension a reader widens with, and a
  // count that shrank as the classification narrowed would hide how much the archive holds
  const archChips: FilterChip[] = [
    { key: 'all', label: t('entity.chipArchAll'), count: derived.length, active: arch === 'all' },
    { key: 'live', label: t('entity.chipLive'), count: derived.filter((r) => !r.vendor.archived).length, active: arch === 'live' },
    { key: 'archived', label: t('entity.chipArchived'), count: derived.filter((r) => r.vendor.archived).length, active: arch === 'archived', title: t('entity.archivedNote') },
  ];

  /** ONE declaration of every narrowing — the chips and the export stamp read the same map. */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    class: { label: t('reg.stamp.dim.class'), value: (v) => (
      v === 'moo' ? t('vendors.mooChip') : v === 'state' ? t('vendors.stateChip') : t(`entity.status_${v}`)
    ) },
    arch: { label: t('reg.stamp.dim.arch'), value: (v) => t(`entity.chip${v === 'live' ? 'Live' : v === 'archived' ? 'Archived' : 'ArchAll'}`) },
  };
  /**
   * The archive dimension is stamped only when it NARROWS (phase-4 fix).
   *
   * This registry's default is `all` — request 14 asked for every entity, archived ones visibly
   * muted — so `all` is the widest view, not a filter. Printing it unconditionally put «الأرشيف:
   * الكل (متداولة ومسحوبة)» in the active-filters clause of an unfiltered export and raised a
   * removable chip whose dismiss removed nothing: two claims a reader could check and find false.
   * `live` and `archived` are real narrowings and are still stamped and still dismissible.
   *
   * Contrast `Fields.tsx`, whose default IS a narrowing (`arch=live`): it stamps its default,
   * because there the reader really is being shown less than the registry holds.
   */
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (filter) p.set('class', filter);
    if (arch !== 'all') p.set('arch', arch);
    return p;
  }, [q, qn, filter, arch]);
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });
  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ('');
    else if (name === 'class') setFilter('');
    // '' DELETES the parameter — `arch=all` would leave the widest view still written in the
    // address, so the chip would come back on the next read and the dismiss would be a no-op
    else f.set('arch', '');
  });
  // no `keep`: the widest view IS the default here, so a reset writes nothing at all
  const clearFilters = () => { setQ(''); setFilter(''); f.clear(); };

  // One column contract drives the on-screen table and the CSV — the exported rows
  // are the filtered/sorted set, so the export matches the view.
  const csvColumns: ReportColumn<Row>[] = [
    { key: 'name', label: 'name', value: (r) => r.vendor.name },
    // the two lists are two columns, never one: they answer §9 participation and C8.7 origin
    { key: 'stateCompany', label: 'stateCompanyArticle25', value: (r) => String(!!r.vendor.isStateCompany) },
    { key: 'mooListed', label: 'ministrySuppliersList', value: (r) => String(r.vendor.mooListed) },
    { key: 'status', label: 'status', value: (r) => r.status },
    { key: 'techScore', label: 'techScore', value: (r) => r.vendor.techScore },
    { key: 'financialScore', label: 'financialScore', value: (r) => r.vendor.financialScore },
    { key: 'hseScore', label: 'hseScore', value: (r) => r.vendor.hseScore },
    { key: 'bids', label: 'bids', value: (r) => r.bids },
    { key: 'wins', label: 'wins', value: (r) => r.wins },
    { key: 'banUntil', label: 'banUntil', value: (r) => r.vendor.banUntil ?? '' },
    { key: 'archived', label: 'archived', value: (r) => String(!!r.vendor.archived) },
  ];

  const doExport = () => {
    exportCsv('masaar-vendor-registry', csvColumns, sorted, stamp);
    // local file export only — never written to the server audit log
    toast(t('reg.vendors.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('vendors.title')}</h1>
          <div className="op-page__sub">{t('vendors.hint')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setAdding(true)}>
            {t('entity.add')}
          </button>
          <button className="op-btn-ghost" onClick={doExport}>{t('reg.vendors.exportCsv')}</button>
        </div>
      </div>

      <MinistryListsExplainer />

      {!isSuper && (
        <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>
          {t('access.gateBanner', { role: session ? t(`roles.names.${roleKey(session.role)}`) : '—' })}
        </div>
      )}
      {/* NAMED DEBT: /api/vendors has suspend/lift/ban/scores and nothing else — no create route
          and no archive flag. Both new actions apply locally in either mode, and the banner says so
          rather than letting API mode imply a server write (precedent: Fields.tsx / Operators.tsx). */}
      {isApiMode && (
        <div className="wz-note wz-note--warn" style={{ marginBlockEnd: 12 }}>
          <Icon name="alert" size={15} />
          <span>{t('entity.localOnly')}</span>
          <DevBadge label={t('dev.local')} title={t('entity.localOnly')} />
        </div>
      )}

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{fmtCount(k.v, lang)}</span></div>
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('reg.vendors.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={filterChips} onSelect={(key) => setFilter(key as VendorFilter)} lang={lang} />
        <span className="acc-filters__sep" aria-hidden="true" />
        {/* choosing «الكل» is a widening back to the default, so it removes the parameter rather
            than writing it — the address carries narrowings only */}
        <FilterChips chips={archChips} onSelect={(key) => f.set('arch', key === 'all' ? '' : key)} lang={lang} />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('reg.vendors.clearFilters')}</button>
        </div>
      )}

      <div className="reg-stamp">{stamp}</div>

      {state.vendors.length === 0 ? (
        <EmptyState mode="empty">{t('reg.vendors.emptyStore')}</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('reg.vendors.clearFilters')}</button>}
        >
          {t('reg.vendors.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('vendors.name')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  {/* ق5 — one column per register, each named for what it actually is */}
                  <th title={t('vendors.mooDef')}>{t('vendors.mooChip')}</th>
                  <th style={{ width: 260 }}>{t('vendors.scores')}</th>
                  <th>{t('vendors.eligibility')}</th>
                  <SortableTh label={t('entity.participation')} sortKey="bids" active={sortKey} dir={dir} onToggle={toggle} />
                  <th className="op-end" style={{ width: 120 }}>{t('tenders.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.vendor.id} className={`op-tbl__row${r.vendor.archived ? ' arch-row' : ''}`}>
                    <td>
                      <div className="op-tbl__name" dir="auto">
                        {r.vendor.name}
                        {/* ق5 — the Article-25 five are marked ON THE NAME, because membership of
                            that list is a property of the company, not a capability score */}
                        {r.vendor.isStateCompany && (
                          <span className="ent-state" style={{ marginInlineStart: 8 }} title={t('vendors.stateDef')}>{t('vendors.stateTag')}</span>
                        )}
                        {r.vendor.archived && <span className="arch-pill" style={{ marginInlineStart: 8 }}>{t('entity.archived')}</span>}
                      </div>
                    </td>
                    <td><StatusPill size="sm" status={r.vendor.mooListed ? 'done' : 'planned'} title={t('vendors.mooDef')}>{r.vendor.mooListed ? t('vendors.mooYes') : t('vendors.mooNo')}</StatusPill></td>
                    <td>
                      <ScoreBar label={t('vendors.tech')} value={r.vendor.techScore} />
                      <ScoreBar label={t('vendors.fin')} value={r.vendor.financialScore} />
                      <ScoreBar label={t('vendors.hse')} value={r.vendor.hseScore} />
                    </td>
                    <td>
                      <StatusPill status={STATUS_PILL[r.status]}>{t(`entity.status_${r.status}`)}</StatusPill>
                      {r.status === 'banned' && r.vendor.banUntil && <div className="op-tbl__code">{t('vendors.until')} {r.vendor.banUntil}</div>}
                    </td>
                    <td>
                      <span className="op-code" style={{ fontSize: 12 }}>{fmtCount(r.bids, lang)}</span> {t('entity.bids')} · <span className="op-code" style={{ fontSize: 12, color: 'var(--status-done)' }}>{fmtCount(r.wins, lang)}</span> {t('entity.wins')}
                    </td>
                    <td className="op-end">
                      {/* Request 14 asked for a visible per-row EDIT button. The 360° file IS the
                          edit surface (scores, suspension, ban, archive), so the row action is
                          labelled for what it lets you do rather than for the page it opens — one
                          real link, keyboard-reachable, no duplicate affordance to the same URL. */}
                      <a className="op-btn-primary" href={`#/admin/entities/${r.vendor.id}`} title={t('entity.editHint')}>{t('entity.edit')}</a>
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

      <div className="ad-empty-inline" style={{ marginBlockStart: 10 }}>{t('entity.noDelete')}</div>

      {adding && <AddVendorModal onClose={() => setAdding(false)} />}
    </div>
  );
}

/**
 * Quick-add (م4) — the minimum an entity needs to exist: a name and its MoO-list membership.
 *
 * `isStateCompany` is deliberately NOT offered. The five Iraqi state companies are seeded law
 * (Article 25 / §9 C8.4) — they are the participation targets the 20% clause names, not registry
 * data an administrator invents; a checkbox here would let anyone mint one and change what §9
 * compliance means. Capability scores start at zero for the same reason: nobody has assessed
 * this entity yet, and a fabricated 70 would read as a measurement.
 */
function AddVendorModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [name, setName] = useState('');
  const [mooListed, setMooListed] = useState(false);
  const [reason, setReason] = useState('');

  // 12.4.2 matches a bidder to its entity BY NAME — a duplicate name makes every participation
  // ambiguous, so it is refused here exactly as the reducer refuses it.
  const dupName = !!name.trim() && state.vendors.some((v) => v.name.trim() === name.trim());
  const gate =
    !name.trim() ? t('entity.nameRequired')
    : dupName ? t('entity.dupName')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    const vendorId = `v-${Date.now().toString(36)}`;
    void dispatch({ type: 'CREATE_VENDOR', vendorId, name: name.trim(), mooListed, reason: reason.trim(), by: actor })
      .then((r) => {
        if (!r.ok) return;
        toast(t('entity.toastAdd', { name: name.trim() }));
        onClose();
      });
  };

  return (
    <Modal
      title={t('entity.add')} sub={t('vendors.title')} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('entity.addConfirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="ven-name">{t('vendors.name')}</label>
        <input id="ven-name" className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <button
        type="button"
        className={`wz-check${mooListed ? ' wz-check--on' : ''}`}
        aria-pressed={mooListed}
        style={{ marginBlockStart: 12 }}
        onClick={() => setMooListed((v) => !v)}
      >
        <span className="wz-check__m"><Icon name="check" size={11} strokeWidth={3} /></span>
        {t('entity.mooField')}
      </button>
      <div className="wz-note wz-note--info" style={{ marginBlockStart: 12 }}>{t('entity.addNote')}</div>
      <div style={{ marginBlockStart: 12 }}>
        <label className="wz-field__l" htmlFor="ven-reason">{t('access.reason')}</label>
        <textarea id="ven-reason" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginBlockStart: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}
