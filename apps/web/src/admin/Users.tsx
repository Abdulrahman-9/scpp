import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { API_ROLES, isOperatorRole, loadSession, type ApiRole } from '../session';
import { enabledSuperAdmins, scopeConsistent, todayIso, useStore, type UserAccount } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { FilterChips, type FilterChip } from '../registry/FilterChips';
import { hashParam, useHashParams, writeHashParam } from '../registry/useHashParams';
import { PaginationBar } from '../registry/PaginationBar';
import { exportCsv, reportStamp, type FilterLabels, type ReportColumn } from '../registry/report';
import { SearchBox } from '../registry/SearchBox';
import { SortableTh } from '../registry/SortableTh';
import { usePagination } from '../registry/usePagination';
import { arCompare, useTableSort } from '../registry/useTableSort';
import { useStampWords } from '../registry/useStampWords';
import { useAdminUi } from './AdminShell';
import { impactfulCount, matchUser, orphanRoleCount, readCount, roleKey, roleTone } from './access';
import { AddAccountModal } from './UserActions';

/**
 * The governance hierarchy, as data — `API_ROLES` itself, so a role added to the universe cannot
 * be missing from the sort order, the chip row or the export (the seventh, JMC_APPROVER, would
 * otherwise have needed three separate hand-edits to become visible).
 */
const ROLE_ORDER: readonly ApiRole[] = API_ROLES;

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('');
}

/** '' = all roles, a role, or the synthetic 'disabled' bucket. */
type RoleFilter = '' | ApiRole | 'disabled';

/**
 * The ACCOUNTS tab of «الوصول والأدوار» (client request 20). Behaviour is untouched from the
 * standalone screen it used to be — the same filters, sort, pagination, stamp and export — but the
 * page shell, title and breadcrumb now belong to `Access.tsx`, which owns the section the three
 * tabs share. What was three screens is one subject with three views.
 */
export default function UsersRegistry() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const { toast } = useAdminUi();
  const session = loadSession();
  const today = todayIso();
  const words = useStampWords();

  const [q, setQ] = useState('');
  /**
   * The role narrowing lives in the ADDRESS (`?role=`), so «حاملو الدور» on a role card can link
   * straight to this register already filtered — one register, reached from the card, instead of a
   * second thinner list of holders grown next to it.
   *
   * The mirror follows the phase-4 `useFilterParams` doctrine rather than a bare `useState(param)`:
   * the address is the source of truth whenever it MOVES (a card link, Back), and a chip moves the
   * mirror first so the table answers in the same frame. A value outside the vocabulary is refused
   * on read by `hashParam` and simply narrows nothing — the whole register, never an empty one.
   */
  const params = useHashParams();
  const roleParam = hashParam(params, 'role') as RoleFilter;
  const [roleFilter, setRoleFilter] = useState<RoleFilter>(roleParam);
  useEffect(() => { setRoleFilter(roleParam); }, [roleParam]);
  const [scope, setScope] = useState('');
  const [adding, setAdding] = useState(false);

  const users = state.users;
  const isSuper = session?.role === 'SUPER_ADMIN';
  const enabled = users.filter((u) => !u.disabled).length;
  const orphans = orphanRoleCount(users);
  const supers = enabledSuperAdmins(state);

  /** The server's assertScopeConsistency prevents this — it can only come from a hand-edited store. */
  const conflicted = users.filter((u) => !scopeConsistent(u.role, u.operatorId));

  const qn = q.trim().toLowerCase();
  const rows = useMemo(() => users.filter((u) => {
    if (qn && !(u.name.toLowerCase().includes(qn) || u.email.toLowerCase().includes(qn))) return false;
    if (roleFilter === 'disabled') { if (!u.disabled) return false; }
    else if (roleFilter && u.role !== roleFilter) return false;
    if (scope === '__central') { if (isOperatorRole(u.role)) return false; }
    else if (scope && u.operatorId !== scope) return false;
    return true;
  }), [users, qn, roleFilter, scope]);

  // Tri-state sort — name is Arabic-collated; role follows the governance hierarchy order.
  const compare = useMemo(() => ({
    name: arCompare<UserAccount>((u) => u.name),
    role: (a: UserAccount, b: UserAccount) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role),
  }), []);
  const { sorted, sortKey, dir, toggle } = useTableSort(rows, compare);
  const { pageRows, page, setPage, pageSize, setPageSize, total, start, end } = usePagination(sorted, 10);

  const companyOf = (u: UserAccount) => state.operators.find((o) => o.id === u.operatorId);

  const lastActionOf = (u: UserAccount) => {
    const match = matchUser(u.email);
    for (let i = state.audit.length - 1; i >= 0; i--) {
      const row = state.audit[i]!;
      if (match(row)) return row;
    }
    return undefined;
  };

  // One column contract drives the export — the header labels stay the machine field
  // names (byte-identical to the prior export); the rows are the filtered set as shown.
  const csvColumns: ReportColumn<UserAccount>[] = [
    { key: 'name', label: 'name', value: (u) => u.name },
    { key: 'email', label: 'email', value: (u) => u.email },
    { key: 'azureOid', label: 'azureOid', value: (u) => u.azureOid },
    { key: 'role', label: 'role', value: (u) => u.role },
    { key: 'operatorId', label: 'operatorId', value: (u) => u.operatorId ?? '' },
    { key: 'twoFa', label: 'twoFa', value: (u) => String(u.twoFa) },
    { key: 'disabled', label: 'disabled', value: (u) => String(u.disabled) },
  ];

  /**
   * The three narrowings this registry carries, declared once (م5). It exported without a stamp:
   * an access register filtered to one role, in one company, downloaded as a file indistinguishable
   * from the whole directory — the one document where «who else has this?» is the entire question.
   *
   * `__conflict` is a real narrowing even though it is not a company, so it is named as one rather
   * than printed as a raw sentinel.
   */
  const labels: FilterLabels = {
    q: { label: t('reg.stamp.dim.q') },
    role: {
      label: t('reg.stamp.dim.role'),
      value: (v) => (v === 'disabled' ? t('access.disabledFilter') : t(`roles.names.${roleKey(v as ApiRole)}`)),
    },
    scope: {
      label: t('reg.stamp.dim.userScope'),
      value: (v) => {
        if (v === '__central') return t('access.scopeCentral');
        if (v === '__conflict') return t('access.scopeConflict');
        const o = state.operators.find((x) => x.id === v);
        return o ? (lang === 'ar' ? o.name : o.nameEn ?? o.name) : v;
      },
    },
  };
  const stampParams = useMemo(() => {
    const p = new URLSearchParams();
    if (qn) p.set('q', q.trim());
    if (roleFilter) p.set('role', roleFilter);
    if (scope) p.set('scope', scope);
    return p;
  }, [q, qn, roleFilter, scope]);
  const stamp = reportStamp({ params: stampParams, labels, lang, rows: sorted.length, today, words });

  const doExport = () => {
    exportCsv('masaar-access-registry', csvColumns, sorted, stamp);
    // local file export only — the server audit log will never contain this row
    toast(t('access.toastExport'));
  };

  const kpis = [
    { l: t('access.kpiEnabled'), v: enabled, warn: undefined },
    { l: t('access.kpiSupers'), v: supers, warn: supers <= 1 ? t('access.kpiSupersWarn') : undefined, tone: supers <= 1 ? 'var(--status-risk)' : undefined },
    { l: t('access.kpiOrphans'), v: orphans, warn: orphans > 0 ? t('access.kpiOrphansWarn') : undefined, tone: orphans > 0 ? 'var(--status-delayed)' : undefined },
    { l: t('access.kpiDisabled'), v: users.length - enabled, warn: undefined },
  ];

  const filterChips: FilterChip[] = [
    { key: '', label: t('access.all'), count: users.length, active: roleFilter === '' },
    ...ROLE_ORDER.map((r) => ({ key: r as string, label: t(`roles.names.${roleKey(r)}`), count: users.filter((u) => u.role === r).length, active: roleFilter === r })),
    { key: 'disabled', label: t('access.disabledFilter'), count: users.length - enabled, active: roleFilter === 'disabled' },
  ];
  if (conflicted.length > 0) {
    filterChips.push({
      key: '__conflict',
      label: t('access.scopeConflict'),
      count: conflicted.length,
      active: roleFilter === '' && scope === '__conflict',
      title: t('access.scopeConflictNote'),
    });
  }

  /**
   * Role chips set the role filter AND the address — the narrowing a reader can see is the
   * narrowing they can copy and send. The conflict chip is a shortcut that pins the scope instead,
   * and clears the role in both places so the two never describe different registers.
   */
  const onChip = (key: string) => {
    if (key === '__conflict') { setRoleFilter(''); setScope('__conflict'); writeHashParam('role', null); return; }
    setRoleFilter(key as RoleFilter);
    writeHashParam('role', key || null);
  };
  const clearFilters = () => { setQ(''); setRoleFilter(''); setScope(''); writeHashParam('role', null); };

  return (
    <>
      <div className="acc-tabhead">
        <div className="acc-tabhead__s">{t('access.registrySub', { n: fmtCount(users.length, lang), e: fmtCount(enabled, lang) })}</div>
        <div className="acc-tabhead__a">
          <button className="op-btn-primary" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => setAdding(true)}>
            {t('access.addAccount')}
          </button>
          <button className="op-btn-ghost" onClick={doExport}>{t('access.exportCsv')}</button>
        </div>
      </div>

      {isApiMode ? (
        <div className="wz-note wz-note--info" style={{ marginBottom: 12 }}>{t('access.apiModeNote')}</div>
      ) : (
        <div className="wz-note wz-note--info" style={{ marginBottom: 12 }}>{t('access.localModeNote')}</div>
      )}
      {!isSuper && (
        <div className="wz-note wz-note--warn" style={{ marginBottom: 12 }}>
          {t('access.gateBanner', { role: session ? t(`roles.names.${roleKey(session.role)}`) : '—' })}
        </div>
      )}

      <div className="ad-kpis" style={{ marginTop: 4 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row">
              <span className="ad-kpi__v" style={k.tone ? { color: k.tone } : undefined}>{fmtCount(k.v, lang)}</span>
            </div>
            {k.warn && <div className="ad-kpi__delta" style={{ color: k.tone }}>{k.warn}</div>}
          </div>
        ))}
      </div>

      <div className="acc-filters">
        <SearchBox value={q} onChange={setQ} placeholder={t('access.searchPh')} style={{ width: 280 }} />
        <FilterChips chips={filterChips} onSelect={onChip} lang={lang} />
        <select className="acc-scope-select" value={scope} onChange={(e) => setScope(e.target.value)} aria-label={t('access.scopeAll')}>
          <option value="">{t('access.scopeAll')}</option>
          <option value="__central">{t('access.scopeCentral')}</option>
          {state.operators.map((o) => <option key={o.id} value={o.id}>{lang === 'ar' ? o.name : o.nameEn ?? o.name}</option>)}
        </select>
      </div>

      {/* WYSIWYG: the exact sentence the CSV will carry, readable before the file is written */}
      <div className="reg-stamp">{stamp}</div>

      {users.length === 0 ? (
        <EmptyState
          mode="empty"
          action={<button className="op-btn-primary" disabled={!isSuper} onClick={() => setAdding(true)}>{t('access.addAccount')}</button>}
        >
          {t('access.emptyStore')}
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState
          mode="noMatch"
          action={<button className="op-btn-ghost" onClick={clearFilters}>{t('access.clearFilters')}</button>}
        >
          {t('access.noMatch')}
        </EmptyState>
      ) : (
        <>
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <SortableTh label={t('access.colAccount')} sortKey="name" active={sortKey} dir={dir} onToggle={toggle} />
                  <SortableTh label={t('access.colRole')} sortKey="role" active={sortKey} dir={dir} onToggle={toggle} style={{ width: 180 }} />
                  <th style={{ width: 190 }}>{t('access.colScope')}</th>
                  <th style={{ width: 150 }}>{t('access.colCaps')}</th>
                  <th style={{ width: 130 }}>{t('access.colTwoFa')}</th>
                  <th style={{ width: 120 }}>{t('access.colStatus')}</th>
                  <th style={{ width: 190 }}>{t('access.colLastAction')}</th>
                  <th style={{ width: 84 }} className="op-end" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((u) => {
                  const co = companyOf(u);
                  const last = lastActionOf(u);
                  const badScope = !scopeConsistent(u.role, u.operatorId);
                  return (
                    <tr key={u.id} className={`op-tbl__row${u.disabled ? ' acc-row--off' : ''}`}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="acc-avatar" aria-hidden="true">{initials(u.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div className="op-tbl__name" dir="auto">{u.name}</div>
                            <div className="op-tbl__code">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`acc-role acc-role--${roleTone(u.role)}`}>{t(`roles.names.${roleKey(u.role)}`)}</span>
                        <div className="op-tbl__code">{u.role}</div>
                      </td>
                      <td>
                        {badScope ? (
                          <span className="acc-conflict" title={t('access.scopeConflictNote')}>
                            {isOperatorRole(u.role) ? t('access.scopeMissing') : t('access.scopeExtra')}
                          </span>
                        ) : co ? (
                          <>
                            <div className="op-tbl__name" dir="auto">{lang === 'ar' ? co.name : co.nameEn ?? co.name}</div>
                            <div className="op-tbl__code">{co.id}</div>
                          </>
                        ) : (
                          <span className="op-dev op-dev--none">{t('access.scopeSystem')}</span>
                        )}
                      </td>
                      <td>
                        {u.disabled ? (
                          <span className="op-dev op-dev--none">{t('access.nActions', { n: fmtCount(0, lang) })}</span>
                        ) : (
                          <span style={{ fontSize: 12 }}>
                            {t('access.nActions', { n: fmtCount(impactfulCount(u.role), lang) })}
                            {' · '}
                            {t('access.nReads', { n: fmtCount(readCount(u.role), lang) })}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="acc-attr" title={t('access.twoFaNote')}>
                          {u.twoFa ? t('access.twoFaOn') : t('access.twoFaOff')}
                        </span>
                      </td>
                      <td>
                        <span className={`acc-status acc-status--${u.disabled ? 'disabled' : 'active'}`}>
                          {u.disabled ? t('access.statusDisabled') : t('access.statusActive')}
                        </span>
                      </td>
                      <td>
                        {last ? (
                          <>
                            <div style={{ fontSize: 12 }}>{last.action}</div>
                            <div className="op-tbl__code">{last.ts.slice(0, 10)}</div>
                          </>
                        ) : <span className="op-dev op-dev--none">—</span>}
                      </td>
                      <td className="op-end">
                        {/* a real link, so the file is reachable by keyboard — an onClick <tr> is not */}
                        <a className="acc-open" href={`#/admin/users/${u.id}`}>
                          {t('access.openFile')}
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

      {adding && <AddAccountModal onClose={() => setAdding(false)} />}
    </>
  );
}
