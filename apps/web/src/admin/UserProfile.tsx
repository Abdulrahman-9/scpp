import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { isOperatorRole, loadSession } from '../session';
import { isLastEnabledSuper, scopeConsistent, useStore, type UserEvent } from '../store';
import {
  capsForRole, domainsFor, impactfulCount, matchUser, roleKey, roleTone, rolesHolding, withheldFrom,
} from './access';
import type { CapDomain } from './capabilities';
import { initials } from './Users';
import { ChangeRoleModal, DisableModal, MoveScopeModal, TwoFaModal, useActor } from './UserActions';

type Dialog = null | 'role' | 'scope' | 'twofa' | 'disable';
type CapFilter = 'all' | 'actions' | 'reads';

const DOMAIN_ORDER: CapDomain[] = ['tenders', 'mct', 'contracts', 'vendors', 'users', 'audit', 'holidays'];

export default function UserProfile({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();
  const session = loadSession();
  const actor = useActor();

  const [dialog, setDialog] = useState<Dialog>(null);
  const [capFilter, setCapFilter] = useState<CapFilter>('all');

  const user = state.users.find((u) => u.id === id);

  if (!user) {
    return (
      <div className="op-page" style={{ maxWidth: 1240 }}>
        <a className="file-back" href="#/admin/users">
          <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('access.back')}
        </a>
        <div className="op-empty">{t('access.notFound')}</div>
      </div>
    );
  }

  const isSuper = session?.role === 'SUPER_ADMIN';
  const isSelf = actor?.oid === user.azureOid;
  const lastSuper = isLastEnabledSuper(state, user.id);
  const badScope = !scopeConsistent(user.role, user.operatorId);
  const company = state.operators.find((o) => o.id === user.operatorId);

  const caps = capsForRole(user.role);
  const withheld = withheldFrom(user.role);
  const events = user.events ?? [];
  const auditedCount = state.audit.filter(matchUser(user.email)).length;

  const shown = caps.filter((c) => capFilter === 'all' || (capFilter === 'actions' ? c.mutating : !c.mutating));
  const grouped = DOMAIN_ORDER.map((d) => ({ domain: d, items: shown.filter((c) => c.domain === d) })).filter((g) => g.items.length > 0);

  const kpis = [
    { l: t('access.kpiCaps'), v: caps.length },
    { l: t('access.kpiImpactful'), v: impactfulCount(user.role) },
    { l: t('access.kpiDomains'), v: domainsFor(user.role).length },
    { l: t('access.kpiAudited'), v: auditedCount },
  ];

  // gates are shown under the button, before it is pressed — never as an error after
  const roleGate = !isSuper ? t('access.gateNotSuper')
    : user.role === 'SUPER_ADMIN' && isSelf ? t('access.gateSelf')
    : user.role === 'SUPER_ADMIN' && lastSuper ? t('access.gateLastSuper')
    : null;
  const disableGate = !isSuper ? t('access.gateNotSuper')
    : !user.disabled && isSelf ? t('access.gateSelf')
    : !user.disabled && lastSuper ? t('access.gateLastSuper')
    : user.disabled && badScope ? t('access.gateFixScope')
    : null;
  const scopeGate = !isSuper ? t('access.gateNotSuper')
    : state.operators.length === 0 ? t('access.gateNoOperators')
    : null;

  const evLabel = (e: UserEvent) => t(`access.ev_${e.kind}`);

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/admin/users">
        <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('access.back')}
      </a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span dir="auto" style={{ fontSize: 24, fontWeight: 700 }}>{user.name}</span>
            <span className={`acc-role acc-role--${roleTone(user.role)}`}>{t(`roles.names.${roleKey(user.role)}`)}</span>
            <span className={`acc-status acc-status--${user.disabled ? 'disabled' : 'active'}`}>
              {user.disabled ? t('access.statusDisabled') : t('access.statusActive')}
            </span>
            <span className="op-scpp">{user.role}</span>
            {!user.twoFa && <span className="acc-attr" title={t('access.twoFaNote')}>{t('access.twoFaOff')}</span>}
            {isSelf && <span className="acc-attr">{t('access.you')}</span>}
            {lastSuper && <span className="acc-attr">{t('access.lastSuper')}</span>}
          </div>
          <div className="file-meta" style={{ gap: 18 }}>
            <span className="op-code">{user.email}</span>
            <span>{company ? (lang === 'ar' ? company.name : company.nameEn ?? company.name) : t('access.scopeSystem')}</span>
            <span className="op-code" title={user.azureOid}>{user.azureOid}</span>
            <span>{t('access.profileSub')}</span>
          </div>
        </div>

        <div className="acc-actionstack">
          <div className="acc-actionstack__row">
            <button className="op-btn-ghost" disabled={!!roleGate} onClick={() => setDialog('role')}>{t('access.actChangeRole')}</button>
            {isOperatorRole(user.role) && (
              <button className="op-btn-ghost" disabled={!!scopeGate} onClick={() => setDialog('scope')}>{t('access.actMoveScope')}</button>
            )}
            <button className="op-btn-ghost" disabled={!isSuper} onClick={() => setDialog('twofa')}>{t('access.actToggleTwoFa')}</button>
            <button className="op-btn-ghost" disabled={!!disableGate} onClick={() => setDialog('disable')}>
              {user.disabled ? t('access.actEnable') : t('access.actDisable')}
            </button>
          </div>
          {(roleGate || disableGate || scopeGate) && (
            <div className="wz-gate">{roleGate ?? disableGate ?? scopeGate}</div>
          )}
        </div>
      </div>

      {user.disabled && (
        <div className="wz-note wz-note--danger" style={{ marginTop: 14 }}>
          {t('access.disableWarn', { n: fmtCount(caps.length, lang) })}
        </div>
      )}
      {badScope && (
        <div className="wz-note wz-note--warn" style={{ marginTop: 14 }}>{t('access.scopeConflictNote')}</div>
      )}

      <div className="ad-kpis" style={{ marginTop: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v">{fmtCount(k.v, lang)}</span></div>
          </div>
        ))}
      </div>

      <div className="ad-cols" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
        {/* what this account CAN do — derived from the server matrix */}
        <div className="ad-panel" style={{ opacity: user.disabled ? 0.55 : 1 }}>
          <div className="ad-panel__head">
            <div>
              <div className="ad-panel__t">{t('access.capsTitle')}</div>
              <div className="ad-panel__s">{t('access.capsSub')}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
              {(['all', 'actions', 'reads'] as CapFilter[]).map((f) => (
                <button
                  key={f}
                  className={`wz-chip${capFilter === f ? ' wz-chip--on' : ''}`}
                  aria-pressed={capFilter === f}
                  onClick={() => setCapFilter(f)}
                >
                  {t(`access.capsFilter${f === 'all' ? 'All' : f === 'actions' ? 'Actions' : 'Reads'}`)}
                </button>
              ))}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="ad-empty-inline">
              {capFilter === 'actions' ? t('caps.layer_AUDITOR') : t('access.noMatch')}
            </div>
          ) : (
            <table className="op-tbl">
              <thead>
                <tr>
                  <th>{t('access.capCol')}</th>
                  <th style={{ width: 90 }}>{t('access.capClause')}</th>
                  <th style={{ width: 150 }}>{t('access.capScope')}</th>
                  <th style={{ width: 90 }}>{t('access.capType')}</th>
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <Fragment key={g.domain}>
                    <tr className="acc-domain"><td colSpan={4}>{t(`caps.dom_${g.domain}`)}</td></tr>
                    {g.items.map((c) => {
                      const scopedForUser = c.scoped && isOperatorRole(user.role);
                      return (
                        <tr key={c.id} title={t('caps.authority', { route: `${c.method} ${c.route}`, roles: c.roles.join(', ') || '—' })}>
                          <td>
                            <div className="op-tbl__name" dir="auto">{c.label[lang]}</div>
                            {c.stateGated && <div className="op-tbl__code">{t('access.stateGated')}</div>}
                          </td>
                          <td>{c.clause ? <span className="op-scpp">{c.clause}</span> : <span className="op-dev op-dev--none">{t('access.capNoClause')}</span>}</td>
                          <td style={{ fontSize: 12 }}>
                            <Icon name={scopedForUser ? 'building' : 'layers'} size={12} />{' '}
                            {scopedForUser ? t('access.scopeOwnCompany') : t('access.scopeWhole')}
                          </td>
                          <td className={c.mutating ? 'acc-type--action' : 'acc-type--read'} style={{ fontSize: 12 }}>
                            {c.mutating ? t('access.typeAction') : t('access.typeRead')}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* separation of duties — the negative space, attributed */}
          <div className="ad-panel">
            <div className="ad-panel__head">
              <div>
                <div className="ad-panel__t">{t('access.withheldTitle')}</div>
                <div className="ad-panel__s">{t('access.withheldSub')}</div>
              </div>
            </div>
            {withheld.length === 0 ? (
              <div className="ad-empty-inline">{t('access.noWithheld')}</div>
            ) : (
              <>
                {withheld.slice(0, 6).map((c) => (
                  <div key={c.id} className="ad-late">
                    <div className="ad-late__body">
                      <div className="ad-late__t">{c.label[lang]}</div>
                      <div className="ad-late__s">
                        {t('access.heldBy', { roles: rolesHolding(c).map((r) => t(`roles.names.${roleKey(r)}`)).join(' · ') })}
                      </div>
                    </div>
                    {c.clause && <span className="op-scpp">{c.clause}</span>}
                  </div>
                ))}
                {withheld.length > 6 && (
                  <div className="ad-empty-inline">
                    {/* the full endpoint × role grid — the reference tab, not the role cards */}
                    <a href="#/admin/users?tab=matrix">{t('access.withheldMore', { n: fmtCount(withheld.length - 6, lang) })}</a>
                  </div>
                )}
              </>
            )}
          </div>

          {/* append-only governance trail — with actor and outcome */}
          <div className="ad-panel">
            <div className="ad-panel__head">
              <div>
                <div className="ad-panel__t">{t('access.trailTitle')}</div>
                <div className="ad-panel__s">{t('access.trailSub')}</div>
              </div>
            </div>
            {events.length === 0 ? (
              <div className="ad-empty-inline">{t('access.noEvents')}</div>
            ) : (
              events.map((e, i) => (
                <div key={`${e.at}-${i}`} className="ad-late">
                  <div className="ad-late__body">
                    <div className="ad-late__t">
                      {evLabel(e)}
                      {e.detail && e.kind !== 'refused' && <span className="acc-mono"> {e.detail}</span>}
                      {e.kind === 'refused' && <span className="acc-refused">{t('access.refused')}</span>}
                    </div>
                    <div className="ad-late__s">
                      {e.reason} · <span className="acc-by">{e.by.name}</span> ({t(`roles.names.${roleKey(e.by.role)}`)})
                    </div>
                  </div>
                  <span className="op-code" style={{ fontSize: 10.5, color: 'var(--text-muted)' }} title={e.at}>{e.on}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {dialog === 'role' && <ChangeRoleModal user={user} onClose={() => setDialog(null)} />}
      {dialog === 'scope' && <MoveScopeModal user={user} onClose={() => setDialog(null)} />}
      {dialog === 'twofa' && <TwoFaModal user={user} onClose={() => setDialog(null)} />}
      {dialog === 'disable' && <DisableModal user={user} onClose={() => setDialog(null)} />}
    </div>
  );
}
