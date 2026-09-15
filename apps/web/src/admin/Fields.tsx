import { contractFinancialAuthority, serviceContractEffective } from '@masaar/scpp-rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { loadSession } from '../session';
import { Icon } from '../operator/Icon';
import { DevBadge } from '../operator/DevBadge';
import { activeTendersOfField, fieldArchivable, govReasonValid, todayIso, useStore, aboveOwnFA, type Field, type ServiceContract } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { activeFilterChips, FilterChips, type FilterChip } from '../registry/FilterChips';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SelectFilter } from '../registry/SelectFilter';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useFilterParams, type ArchiveView } from '../registry/useHashParams';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { roleKey } from './access';
import { Modal } from './Modal';
import { useActor } from './UserActions';

interface FieldRow {
  f: Field;
  contract?: ServiceContract;
  effective: boolean;
  fa: number | null;
  tenders: number;
  aboveFa: number;
  /** in-flight tenders (ق7) — the count that decides whether the field may be archived */
  active: number;
}

/**
 * The oil fields (spec §1) and their Service Contracts — the source of every field's Financial
 * Authority (§7.1). This is where FA is actually edited (per contract), and where a new operator
 * gets its first usable field (a field carries its contract, so it can raise tenders at once).
 */
export default function Fields() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const session = loadSession();
  const isSuper = session?.role === 'SUPER_ADMIN';
  const today = todayIso();
  const words = useStampWords();

  const [q, setQ] = useState('');
  /**
   * The `?op=` deep link. THE FIX (§5-ج): this used to be `useState(opParam())` — read once at
   * mount — so following a link that changed only the query string left the table exactly where
   * it was. `useFilterParams` makes it state that re-syncs on every `hashchange`, and the select
   * writes the hash back, so the address bar and the screen are the same fact and the URL stays
   * shareable. An id the store does not know filters nothing rather than emptying the registry.
   *
   * Request 7 put the ARCHIVE side (ق7) in the address beside it. An absent `?arch=` means `live`
   * — the working registry — which is a real narrowing, so the stamp names it even when the
   * address is silent: an all-live export and an all-archived export otherwise look identical.
   */
  const f = useFilterParams();
  const opFilter = f.get('op', state.operators.map((o) => o.id));
  const arch = (f.get('arch') || 'live') as ArchiveView;
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'add' }
    | { kind: 'fa'; row: FieldRow }
    | { kind: 'rename'; row: FieldRow }
    | { kind: 'archive'; row: FieldRow }
    | { kind: 'restore'; row: FieldRow }
  >(null);

  const nameOf = (f: Field) => (lang === 'ar' ? f.name : f.nameEn ?? f.name);
  const opName = (id: string) => {
    const o = state.operators.find((x) => x.id === id);
    return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : id;
  };

  const allRows: FieldRow[] = useMemo(() => state.fields.map((f) => {
    const contract = state.serviceContracts.find((c) => c.fieldId === f.id);
    const tendersOfField = state.tenders.filter((x) => x.fieldId === f.id);
    return {
      f,
      contract,
      effective: contract ? serviceContractEffective(contract) : false,
      fa: contract ? contractFinancialAuthority(contract) : null,
      tenders: tendersOfField.length,
      aboveFa: tendersOfField.filter((x) => aboveOwnFA(state, x)).length,
      active: activeTendersOfField(state, f.id).length,
    };
  }), [state]);

  const qn = q.trim().toLowerCase();
  const filtered = useMemo(() => allRows.filter((r) => {
    if (arch === 'live' && r.f.archived) return false;
    if (arch === 'archived' && !r.f.archived) return false;
    // 'all' widens: both sides of the archive, the archived rows visibly muted
    if (opFilter && r.f.operatorId !== opFilter) return false;
    if (qn && !(r.f.name.toLowerCase().includes(qn) || (r.f.nameEn ?? '').toLowerCase().includes(qn) || r.f.code.toLowerCase().includes(qn))) return false;
    return true;
  }), [allRows, qn, opFilter, arch]);

  const archivedCount = allRows.filter((r) => r.f.archived).length;
  const chips: FilterChip[] = [
    { key: 'live', label: t('fields.chipLive'), count: allRows.length - archivedCount, active: arch === 'live' },
    { key: 'archived', label: t('fields.chipArchived'), count: archivedCount, active: arch === 'archived', title: t('fields.archivedNote') },
    { key: 'all', label: t('fields.chipAll'), count: allRows.length, active: arch === 'all' },
  ];

  /** ONE declaration of every narrowing — the chips and the export/print stamp read the same map. */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    op: { label: t('reg.stamp.dim.op'), value: (id) => opName(id) },
    arch: { label: t('reg.stamp.dim.arch'), value: (v) => t(`fields.chip${v === 'live' ? 'Live' : v === 'archived' ? 'Archived' : 'All'}`) },
  };
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (opFilter) p.set('op', opFilter);
    // always stamped: `live` is the DEFAULT view and still a real narrowing of the registry
    p.set('arch', arch);
    return p;
  }, [q, qn, opFilter, arch]);

  const compare = useMemo(() => ({
    name: arCompare<FieldRow>((r) => (lang === 'ar' ? r.f.name : r.f.nameEn ?? r.f.name)),
    fa: (a: FieldRow, b: FieldRow) => (a.fa ?? -1) - (b.fa ?? -1),
    tenders: (a: FieldRow, b: FieldRow) => a.tenders - b.tenders,
  }), [lang]);
  const { sorted, sortKey, dir, toggle } = useTableSort(filtered, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 12);

  const csvColumns: ReportColumn<FieldRow>[] = [
    { key: 'name', label: 'name', value: (r) => r.f.name },
    { key: 'code', label: 'code', value: (r) => r.f.code },
    { key: 'operator', label: 'operator', value: (r) => r.f.operatorId },
    { key: 'contract', label: 'contract', value: (r) => r.contract?.code ?? '' },
    { key: 'faUSD', label: 'faUSD', value: (r) => r.fa ?? '' },
    { key: 'effective', label: 'effective', value: (r) => String(r.effective) },
    { key: 'tenders', label: 'tenders', value: (r) => r.tenders },
    { key: 'archived', label: 'archived', value: (r) => String(!!r.f.archived) },
  ];
  /**
   * WYSIWYG export (design principle 4): the rows are the sorted+filtered rows on screen, so the
   * FILE has to say which scope it holds. The archive chip is the one filter a reader cannot infer
   * from the rows themselves — an all-live export and an all-archived export both look like «the
   * registry» — so the filename carries it (masaar-fields-live / -archived / -all) AND the stamp
   * on the file's first line spells out every narrowing in words, with the row count and the date.
   */
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });
  const activeChips = activeFilterChips(stampParams, labels, lang, (name) => {
    if (name === 'q') setQ('');
    else if (name === 'arch') f.set('arch', 'all');
    else f.set('op', '');
  });
  // «أزل كل المرشّحات» widens to BOTH sides of the archive: the default `live` view is itself a
  // narrowing, and a registry whose fields are all archived would otherwise still read as empty.
  const clearFilters = () => { setQ(''); f.clear({ arch: 'all' }); };

  const doExport = () => {
    exportCsv(`masaar-fields-${arch}`, csvColumns, sorted, stamp);
    toast(t('fields.toastExport'));
  };

  return (
    <div className="op-page" style={{ maxWidth: 1240 }}>
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('fields.title')}</h1>
          <div className="op-page__sub">{t('fields.sub', { n: fmtCount(state.fields.length, lang) })}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setDialog({ kind: 'add' })}>
            {t('fields.add')}
          </button>
          <button className="op-btn-ghost" onClick={doExport}>{t('fields.exportCsv')}</button>
        </div>
      </div>

      {!isSuper && (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>
          {t('access.gateBanner', { role: session ? t(`roles.names.${roleKey(session.role)}`) : '—' })}
        </div>
      )}
      {isApiMode && (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={15} />
          <span>{t('fields.apiModeNote')}</span>
          <DevBadge label={t('dev.local')} title={t('fields.apiModeNote')} />
        </div>
      )}

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('fields.searchPh')} style={{ width: 280 }} />
        <SelectFilter
          allLabel={t('fields.allOperators')}
          value={opFilter}
          hideWhenEmpty
          onChange={(v) => f.set('op', v)}
          options={state.operators.map((o) => ({ value: o.id, label: lang === 'ar' ? o.name : o.nameEn ?? o.name }))}
        />
        <FilterChips chips={chips} onSelect={(key) => f.set('arch', key)} lang={lang} />
      </div>

      {activeChips.length > 0 && (
        <div className="acc-filters" style={{ marginBlock: '0 10px' }}>
          <FilterChips chips={activeChips} onSelect={() => {}} lang={lang} />
          <button className="op-btn-ghost" onClick={clearFilters}>{t('fields.clearFilters')}</button>
        </div>
      )}

      <div className="reg-stamp">{stamp}</div>

      {state.fields.length === 0 ? (
        <EmptyState mode="empty">{t('fields.empty')}</EmptyState>
      ) : filtered.length === 0 ? (
        // the archive chip is a filter like any other: «أزل كل المرشّحات» must clear it too,
        // or a registry whose fields are all archived reads as an empty registry
        <EmptyState mode="noMatch" action={<button className="op-btn-ghost" onClick={clearFilters}>{t('fields.clearFilters')}</button>}>
          {t('fields.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('fields.colField')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  <th style={{ width: 200 }}>{t('fields.colOperator')}</th>
                  <SortableTh label={t('fields.colFa')} sortKey="fa" active={sortKey} dir={dir} onToggle={toggle} className="op-end" />
                  <th style={{ width: 150 }}>{t('fields.colContract')}</th>
                  <SortableTh label={t('fields.colTenders')} sortKey="tenders" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 130 }} />
                  <th style={{ width: 120 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.f.id} className={`op-tbl__row${r.f.archived ? ' arch-row' : ''}`}>
                    <td>
                      <div className="op-tbl__name" dir="auto">
                        {nameOf(r.f)}
                        {r.f.archived && <span className="arch-pill" style={{ marginInlineStart: 8 }}>{t('fields.archived')}</span>}
                      </div>
                      <div className="op-tbl__code">{r.f.code}</div>
                    </td>
                    <td><span style={{ fontSize: 13 }} dir="auto">{opName(r.f.operatorId)}</span></td>
                    <td className="op-end">
                      {r.fa == null
                        ? <span className="op-dev op-dev--none">—</span>
                        : <span className="op-code">{fmtMoney(r.fa)}</span>}
                    </td>
                    <td>
                      {!r.contract
                        ? <span className="acc-status acc-status--disabled">{t('fields.noContract')}</span>
                        : r.effective
                          ? <span className="acc-status acc-status--active">{t('fields.effective')}</span>
                          : <span className="acc-status acc-status--disabled">{t('fields.ineffective')}</span>}
                    </td>
                    <td>
                      {r.tenders === 0
                        ? <span className="op-dev op-dev--none">—</span>
                        : <span style={{ fontSize: 12 }}>{t('fields.nTenders', { n: fmtCount(r.tenders, lang), above: fmtCount(r.aboveFa, lang) })}</span>}
                    </td>
                    <td className="op-end">
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {/* request 9 «إمكانية التعديل لاحقاً» — display names are correctable after
                            creation; the code and the owning company are not (see RENAME_FIELD). */}
                        <button
                          className="acc-open"
                          disabled={!isSuper}
                          title={isSuper ? undefined : t('access.gateNotSuper')}
                          onClick={() => setDialog({ kind: 'rename', row: r })}
                        >
                          {t('fields.rename')}
                        </button>
                        {/* FA is editable only for an EFFECTIVE contract, only for a super admin,
                            and only in local mode (no /service-contracts server write path yet) */}
                        <button
                          className="acc-open"
                          disabled={!isSuper || !r.effective || isApiMode}
                          title={!r.effective ? t('fields.ineffective') : isApiMode ? t('fields.apiModeNote') : isSuper ? undefined : t('access.gateNotSuper')}
                          onClick={() => r.contract && setDialog({ kind: 'fa', row: r })}
                        >
                          {t('fields.editFa')}
                        </button>
                        {/* ق7 — archive, never delete: the field's tenders, contracts and audit
                            rows exist, so a deletion would orphan them (8.1-e). */}
                        {r.f.archived ? (
                          <button
                            className="acc-open"
                            disabled={!isSuper}
                            title={isSuper ? undefined : t('access.gateNotSuper')}
                            onClick={() => setDialog({ kind: 'restore', row: r })}
                          >
                            {t('fields.restore')}
                          </button>
                        ) : (
                          <button
                            className="acc-open"
                            disabled={!isSuper || r.active > 0}
                            title={r.active > 0 ? t('fields.archiveBlocked', { n: fmtCount(r.active, lang) }) : isSuper ? undefined : t('access.gateNotSuper')}
                            onClick={() => setDialog({ kind: 'archive', row: r })}
                          >
                            {t('fields.archive')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={total} start={start} end={end} lang={lang} />
        </>
      )}

      <div className="ad-empty-inline" style={{ marginTop: 10 }}>{t('fields.faNote')}</div>

      {dialog?.kind === 'add' && <AddFieldModal onClose={() => setDialog(null)} defaultOperator={opFilter} />}
      {dialog?.kind === 'fa' && <EditFaModal row={dialog.row} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'rename' && <RenameFieldModal row={dialog.row} onClose={() => setDialog(null)} />}
      {(dialog?.kind === 'archive' || dialog?.kind === 'restore') && (
        <ArchiveFieldModal row={dialog.row} mode={dialog.kind} onClose={() => setDialog(null)} />
      )}
    </div>
  );

}

function AddFieldModal({ onClose, defaultOperator }: { onClose: () => void; defaultOperator: string }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [code, setCode] = useState('');
  const [operatorId, setOperatorId] = useState(defaultOperator || state.operators[0]?.id || '');
  const [fa, setFa] = useState('');
  const [signedOn, setSignedOn] = useState('2024-01-01');
  const [expiresOn, setExpiresOn] = useState('2031-01-01');
  const [reason, setReason] = useState('');

  const faNum = Number(fa);
  const dupCode = state.fields.some((f) => f.code.trim() === code.trim() && code.trim());
  const gate =
    !name.trim() ? t('fields.nameRequired')
    : !code.trim() ? t('fields.codeRequired')
    : dupCode ? t('fields.dupCode')
    : !operatorId ? t('fields.operatorRequired')
    : !(faNum > 0) ? t('operators.faInvalid')
    : !(signedOn < expiresOn) ? t('fields.datesInvalid')
    : !(expiresOn > todayIso()) ? t('fields.expiryPast') // a contract that expired yesterday is born unusable
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    const fieldId = `f-${Date.now().toString(36)}`;
    dispatch({
      type: 'CREATE_FIELD', fieldId, operatorId, name: name.trim(), nameEn: nameEn.trim() || undefined, code: code.trim().toUpperCase(),
      contractId: `sc-${Date.now().toString(36)}`, contractCode: `SC-${code.trim().toUpperCase()}`, financialAuthorityUSD: faNum,
      signedOn, expiresOn, reason: reason.trim(), by: actor,
    });
    toast(t('fields.toastAdd', { name: name.trim() }));
    onClose();
  };

  return (
    <Modal
      title={t('fields.add')} sub={t('fields.title')} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('fields.addConfirm')}</button>
      </>}
    >
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="wz-field" style={{ flex: 2 }}>
          <label className="wz-field__l" htmlFor="fd-name">{t('fields.name')}</label>
          <input id="fd-name" className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="wz-field" style={{ flex: 1 }}>
          <label className="wz-field__l" htmlFor="fd-code">{t('fields.code')}</label>
          <input id="fd-code" className="wz-in wz-in--mono" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-nameen">{t('fields.nameEn')}</label>
        <input id="fd-nameen" className="wz-in" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-op">{t('fields.operator')}</label>
        <select id="fd-op" className="wz-in" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
          {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div className="wz-note wz-note--info" style={{ marginTop: 14 }}>{t('fields.contractIntro')}</div>
      <div className="wz-field" style={{ marginTop: 10 }}>
        <label className="wz-field__l" htmlFor="fd-fa">{t('operators.faField')}</label>
        <input id="fd-fa" className="wz-in wz-in--mono" type="number" min={1} value={fa} onChange={(e) => setFa(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <div className="wz-field" style={{ flex: 1 }}>
          <label className="wz-field__l" htmlFor="fd-signed">{t('fields.signedOn')}</label>
          {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
          <input id="fd-signed" className="wz-in wz-in--mono" type="date" value={signedOn} onChange={(e) => setSignedOn(e.target.value)} />
        </div>
        <div className="wz-field" style={{ flex: 1 }}>
          <label className="wz-field__l" htmlFor="fd-expires">{t('fields.expiresOn')}</label>
          {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
          <input id="fd-expires" className="wz-in wz-in--mono" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-reason">{t('access.reason')}</label>
        <textarea id="fd-reason" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

function EditFaModal({ row, onClose }: { row: FieldRow; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const nameOf = (f: Field) => (lang === 'ar' ? f.name : f.nameEn ?? f.name);
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const contract = row.contract!;
  const [fa, setFa] = useState(String(contract.financialAuthorityUSD));
  const [reason, setReason] = useState('');
  const faNum = Number(fa);

  // live governance consequence: which of this field's tenders cross the line
  const mine = state.tenders.filter((x) => x.fieldId === row.f.id);
  const nowAbove = mine.filter((x) => x.estimatedValueUSD > contract.financialAuthorityUSD).length;
  const willBeAbove = faNum > 0 ? mine.filter((x) => x.estimatedValueUSD > faNum).length : nowAbove;
  const delta = willBeAbove - nowAbove;

  const gate =
    !(faNum > 0) ? t('operators.faInvalid')
    : faNum === contract.financialAuthorityUSD ? t('access.reasonMin')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({ type: 'SET_CONTRACT_FA', contractId: contract.id, financialAuthorityUSD: faNum, reason: reason.trim(), by: actor });
    toast(t('fields.toastFa', { name: row.f.name, v: fmtMoney(faNum) }));
    onClose();
  };

  return (
    <Modal
      title={t('fields.editFa')} sub={nameOf(row.f)} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('access.confirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="fd-fa2">{t('operators.faField')}</label>
        <input id="fd-fa2" className="wz-in wz-in--mono" type="number" min={1} value={fa} onChange={(e) => setFa(e.target.value)} />
        <div className="wz-gate" style={{ marginTop: 4 }}>{t('operators.faCurrent', { v: fmtMoney(contract.financialAuthorityUSD) })} · {contract.code}</div>
      </div>
      <div className={`wz-note wz-note--${delta !== 0 ? 'warn' : 'info'}`} style={{ marginTop: 12 }}>
        {delta === 0
          ? t('fields.faNoChange', { n: fmtCount(nowAbove, lang) })
          : t('fields.faImpact', { from: fmtCount(nowAbove, lang), to: fmtCount(willBeAbove, lang) })}
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-reason2">{t('access.reason')}</label>
        <textarea id="fd-reason2" className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('operators.faReasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/**
 * Request 9 «إمكانية التعديل لاحقاً» — the later-edit path for a field's display names.
 * Deliberately narrow: the CODE is quoted in tender codes, contract codes and every CSV already
 * exported, and the OWNING COMPANY is fixed by the Service Contract that grants the authority —
 * neither is a display detail, so neither is editable here. Contract FA has its own dialog.
 */
function RenameFieldModal({ row, onClose }: { row: FieldRow; onClose: () => void }) {
  const { t } = useTranslation();
  const { dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [name, setName] = useState(row.f.name);
  const [nameEn, setNameEn] = useState(row.f.nameEn ?? '');
  const [reason, setReason] = useState('');

  const changed = name.trim() !== row.f.name || (nameEn.trim() || undefined) !== row.f.nameEn;
  const gate =
    !name.trim() ? t('fields.nameRequired')
    : !changed ? t('fields.renameNoChange')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    // قناة الصدق: the success toast waits on the store's own outcome
    void dispatch({ type: 'RENAME_FIELD', fieldId: row.f.id, name: name.trim(), nameEn: nameEn.trim() || undefined, reason: reason.trim(), by: actor })
      .then((r) => {
        if (!r.ok) return;
        toast(t('fields.toastRename', { from: row.f.name, to: name.trim() }));
        onClose();
      });
  };

  return (
    <Modal
      title={t('fields.rename')} sub={row.f.code} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('fields.renameConfirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="fd-rn">{t('fields.name')}</label>
        <input id="fd-rn" className="wz-in" dir="auto" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-rne">{t('fields.nameEn')}</label>
        <input id="fd-rne" className="wz-in" dir="ltr" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </div>
      <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>{t('fields.renameScope')}</div>
      <div style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-rr">{t('access.reason')}</label>
        <textarea id="fd-rr" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/**
 * ق7 — archive / restore. Archiving withdraws the field from every picker that offers FUTURE
 * work (the request wizard's field select, the registry filters); it deletes nothing, and the
 * field's tenders, contracts and audit rows stay exactly where they are. A field with in-flight
 * tenders is refused, and the gate NAMES the count rather than greying out silently.
 */
function ArchiveFieldModal({ row, mode, onClose }: { row: FieldRow; mode: 'archive' | 'restore'; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [reason, setReason] = useState('');

  // recomputed live from the store — the same predicate the reducer runs, never a copy
  const { ok: archivable, activeTenders } = fieldArchivable(state, row.f.id);
  const blocked = mode === 'archive' && !archivable;
  const gate =
    blocked ? t('fields.archiveBlocked', { n: fmtCount(activeTenders, lang) })
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    void dispatch(
      mode === 'archive'
        ? { type: 'ARCHIVE_FIELD', fieldId: row.f.id, reason: reason.trim(), by: actor }
        : { type: 'RESTORE_FIELD', fieldId: row.f.id, reason: reason.trim(), by: actor },
    ).then((r) => {
      if (!r.ok) return;
      toast(t(mode === 'archive' ? 'fields.toastArchive' : 'fields.toastRestore', { name: row.f.name }));
      onClose();
    });
  };

  return (
    <Modal
      title={t(mode === 'archive' ? 'fields.archiveTitle' : 'fields.restoreTitle')} sub={`${row.f.name} · ${row.f.code}`} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('fields.archiveUndo')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>
          {t(mode === 'archive' ? 'fields.archiveConfirm' : 'fields.restoreConfirm')}
        </button>
      </>}
    >
      <div className={`wz-note wz-note--${blocked ? 'danger' : 'info'}`}>
        {blocked
          ? t('fields.archiveBlockedBody', { n: fmtCount(activeTenders, lang) })
          : t(mode === 'archive' ? 'fields.archiveBody' : 'fields.restoreBody', { n: fmtCount(row.tenders, lang) })}
      </div>
      <div style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="fd-ar">{t('access.reason')}</label>
        <textarea id="fd-ar" className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('fields.archiveReasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}
