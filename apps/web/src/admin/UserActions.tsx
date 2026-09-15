import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../operator/derive';
import { API_ROLES, isOperatorRole, loadSession, type ApiRole } from '../session';
import {
  govReasonValid, isLastEnabledSuper, scopeConsistent, useStore,
  type Actor, type UserAccount,
} from '../store';
import { useAdminUi } from './AdminShell';
import { capsForRole, domainsFor, impactfulCount, roleKey, rolesOrphanedBy } from './access';
import { Modal } from './Modal';

/**
 * The role pickers offer the WHOLE universe, as data. A hand-kept copy is how a role becomes
 * unassignable: JMC_APPROVER existed in the server enum, the guard and the register, and would
 * still have been missing from the one dropdown that creates accounts for it.
 */
const ROLES: readonly ApiRole[] = API_ROLES;

/** The acting super admin, bound by immutable oid — never by display name. */
export function useActor(): Actor | null {
  const { state } = useStore();
  const session = loadSession();
  if (!session) return null;
  const me = state.users.find((u) => u.azureOid === session.oid);
  return { oid: session.oid, name: me?.name ?? session.name, role: me?.role ?? session.role };
}

function ReasonField({ value, onChange, rows = 3 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  const { t } = useTranslation();
  return (
    <>
      <label className="wz-field__l" htmlFor="acc-reason">{t('access.reason')}</label>
      <textarea
        id="acc-reason" className="wz-ta" rows={rows} dir="auto" value={value}
        onChange={(e) => onChange(e.target.value)} placeholder={t('access.reasonPh')}
        style={{ width: '100%', marginTop: 6 }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ add */

export function AddAccountModal({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [oid, setOid] = useState('');
  const [role, setRole] = useState<ApiRole>('OPERATOR_USER');
  const [operatorId, setOperatorId] = useState('');
  const [twoFa, setTwoFa] = useState(true);
  const [reason, setReason] = useState('');

  const needsCompany = isOperatorRole(role);
  const effectiveOperator = needsCompany ? operatorId : '';
  const dupEmail = state.users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  const dupOid = state.users.some((u) => u.azureOid === oid.trim());
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const nameOk = name.trim().length > 0 && name.trim().length <= 160;
  const reasonOk = govReasonValid(reason);
  const noOperators = state.operators.length === 0;

  const gate =
    !nameOk ? t('access.nameRequired')
    : !emailOk ? t('access.emailInvalid')
    : dupEmail ? t('access.dupEmail', { v: email.trim() })
    : !oid.trim() ? t('access.oidRequired')
    : dupOid ? t('access.dupOid')
    : needsCompany && noOperators ? t('access.gateNoOperators')
    : needsCompany && !effectiveOperator ? t('access.gateScope')
    : !reasonOk ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    const id = `u${Date.now().toString(36)}`;
    dispatch({
      type: 'CREATE_USER', userId: id, azureOid: oid.trim(), name: name.trim(), email: email.trim(),
      role, operatorId: effectiveOperator || undefined, twoFa, reason: reason.trim(), by: actor,
    });
    toast(t('access.toastCreate', { name: name.trim(), role: t(`roles.names.${roleKey(role)}`) }));
    onClose();
    window.location.hash = `#/admin/users/${id}`;
  };

  return (
    <Modal
      title={t('access.addAccount')} sub={t('access.title')} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('access.createConfirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="acc-name">{t('access.name')}</label>
        <input id="acc-name" className="wz-in" dir="auto" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="acc-email">{t('access.email')}</label>
        <input id="acc-email" className="wz-in wz-in--mono" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="acc-oid">{t('access.azureOid')}</label>
        <input id="acc-oid" className="wz-in wz-in--mono" maxLength={64} value={oid} onChange={(e) => setOid(e.target.value)} aria-describedby="acc-oid-help" />
        <div id="acc-oid-help" className="wz-gate" style={{ marginTop: 4 }}>{t('access.azureHelp')}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <div className="wz-field" style={{ flex: 1 }}>
          <label className="wz-field__l" htmlFor="acc-role">{t('access.newRole')}</label>
          <select id="acc-role" className="wz-in" value={role} onChange={(e) => setRole(e.target.value as ApiRole)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`roles.names.${roleKey(r)}`)}</option>)}
          </select>
        </div>
        <div className="wz-field" style={{ flex: 1 }}>
          <label className="wz-field__l" htmlFor="acc-co">{t('access.company')}</label>
          <select id="acc-co" className="wz-in" value={operatorId} disabled={!needsCompany} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">{needsCompany ? '—' : t('access.scopeSystem')}</option>
            {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>
      <label className="wz-field__l" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <input type="checkbox" checked={twoFa} onChange={(e) => setTwoFa(e.target.checked)} />
        {t('access.twoFaField')} — {t('access.twoFaOn')}
      </label>
      <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>
        {t('access.createImpact', { n: fmtCount(capsForRole(role).length, lang), d: fmtCount(domainsFor(role).length, lang) })}
      </div>
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} rows={2} /></div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- role */

export function ChangeRoleModal({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const [role, setRole] = useState<ApiRole>(user.role);
  const [operatorId, setOperatorId] = useState(user.operatorId ?? '');
  const [reason, setReason] = useState('');

  const needsCompany = isOperatorRole(role);
  const nextOperator = needsCompany ? operatorId : '';
  const isSelf = actor?.oid === user.azureOid;
  const demotingSuper = user.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN';
  const reasonOk = govReasonValid(reason);

  const orphaned = rolesOrphanedBy(state.users, user.id, { role, disabled: user.disabled });
  const before = capsForRole(user.role).map((c) => c.id);
  const after = capsForRole(role).map((c) => c.id);
  const gained = after.filter((c) => !before.includes(c)).length;
  const lost = before.filter((c) => !after.includes(c)).length;

  const gate =
    role === user.role && nextOperator === (user.operatorId ?? '') ? t('access.reasonMin')
    : demotingSuper && isSelf ? t('access.gateSelf')
    : demotingSuper && isLastEnabledSuper(state, user.id) ? t('access.gateLastSuper')
    : needsCompany && state.operators.length === 0 ? t('access.gateNoOperators')
    : !scopeConsistent(role, nextOperator || undefined) ? t('access.gateScope')
    : !reasonOk ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({ type: 'SET_USER_ROLE', userId: user.id, role, operatorId: nextOperator || undefined, reason: reason.trim(), by: actor });
    toast(t('access.toastRole', {
      name: user.name,
      from: t(`roles.names.${roleKey(user.role)}`),
      to: t(`roles.names.${roleKey(role)}`),
    }));
    onClose();
  };

  return (
    <Modal
      title={t('access.actChangeRole')} sub={user.name} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>
          {t('access.confirm')}
        </button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="acc-newrole">{t('access.newRole')}</label>
        <select id="acc-newrole" className="wz-in" value={role} onChange={(e) => setRole(e.target.value as ApiRole)}>
          {ROLES.map((r) => <option key={r} value={r}>{t(`roles.names.${roleKey(r)}`)}</option>)}
        </select>
      </div>
      {needsCompany && (
        <div className="wz-field" style={{ marginTop: 12 }}>
          <label className="wz-field__l" htmlFor="acc-newco">{t('access.company')}</label>
          <select id="acc-newco" className="wz-in" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
            <option value="">—</option>
            {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      {!needsCompany && user.operatorId && (
        <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>{t('access.scopeExtra')}</div>
      )}
      {role !== user.role && (
        <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>
          {t('access.willGain', { n: fmtCount(gained, lang) })} · {t('access.willLose', { n: fmtCount(lost, lang) })}
        </div>
      )}
      {orphaned.length > 0 && (
        <div className="wz-note wz-note--warn" style={{ marginTop: 12 }}>
          {t('access.orphanWarn', { roles: orphaned.map((r) => t(`roles.names.${roleKey(r)}`)).join(' · ') })}
        </div>
      )}
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} /></div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- scope */

export function MoveScopeModal({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const [operatorId, setOperatorId] = useState(user.operatorId ?? '');
  const [reason, setReason] = useState('');
  const co = state.operators.find((o) => o.id === operatorId);

  const gate =
    state.operators.length === 0 ? t('access.gateNoOperators')
    : !operatorId ? t('access.gateScope')
    : operatorId === user.operatorId ? t('access.reasonMin')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({ type: 'SET_USER_SCOPE', userId: user.id, operatorId, reason: reason.trim(), by: actor });
    toast(t('access.toastScope', { name: user.name, company: co?.name ?? operatorId }));
    onClose();
  };

  return (
    <Modal
      title={t('access.actMoveScope')} sub={user.name} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('access.confirm')}</button>
      </>}
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="acc-scope">{t('access.company')}</label>
        <select id="acc-scope" className="wz-in" value={operatorId} onChange={(e) => setOperatorId(e.target.value)}>
          <option value="">—</option>
          {state.operators.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      {co && <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>{t('access.scopeNote', { company: co.name })}</div>}
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} /></div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- 2FA */

export function TwoFaModal({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const { t } = useTranslation();
  const { dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [reason, setReason] = useState('');
  const next = !user.twoFa;
  const gate = !govReasonValid(reason) ? t('access.reasonMin') : null;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({ type: 'SET_USER_TWOFA', userId: user.id, twoFa: next, reason: reason.trim(), by: actor });
    toast(t('access.toastTwoFa', { name: user.name }));
    onClose();
  };

  return (
    <Modal
      title={t('access.actToggleTwoFa')} sub={user.name} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>{t('access.confirm')}</button>
      </>}
    >
      <div className="wz-note wz-note--warn">{t('access.twoFaWarn')}</div>
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} /></div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
    </Modal>
  );
}

/* -------------------------------------------------------- disable/enable */

export function DisableModal({ user, onClose }: { user: UserAccount; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const [reason, setReason] = useState('');

  const disabling = !user.disabled;
  const isSelf = actor?.oid === user.azureOid;
  const orphaned = disabling ? rolesOrphanedBy(state.users, user.id, { role: user.role, disabled: true }) : [];

  const gate =
    disabling && isSelf ? t('access.gateSelf')
    : disabling && isLastEnabledSuper(state, user.id) ? t('access.gateLastSuper')
    : !disabling && !scopeConsistent(user.role, user.operatorId) ? t('access.gateFixScope')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({ type: 'SET_USER_DISABLED', userId: user.id, disabled: disabling, reason: reason.trim(), by: actor });
    toast(t(disabling ? 'access.toastDisable' : 'access.toastEnable', { name: user.name }));
    onClose();
  };

  return (
    <Modal
      title={t(disabling ? 'access.actDisable' : 'access.actEnable')} sub={user.name} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className={disabling ? 'op-btn-danger' : 'op-btn-primary'} disabled={!!gate} onClick={submit}>
          {t(disabling ? 'access.disableConfirm' : 'access.confirm')}
        </button>
      </>}
    >
      {disabling && (
        <div className="wz-note wz-note--danger">
          {t('access.disableWarn', { n: fmtCount(capsForRole(user.role).length, lang) })}
        </div>
      )}
      {orphaned.length > 0 && (
        <div className="wz-note wz-note--warn" style={{ marginTop: 12 }}>
          {t('access.orphanWarn', { roles: orphaned.map((r) => t(`roles.names.${roleKey(r)}`)).join(' · ') })}
        </div>
      )}
      <div style={{ marginTop: 12 }}><ReasonField value={reason} onChange={setReason} /></div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>
      {disabling && <div className="wz-gate" style={{ marginTop: 8 }}>{t('access.noDelegation')}</div>}
    </Modal>
  );
}

/** Impactful-action count for a role — re-exported so the profile header can cite it. */
export { impactfulCount, fmtCount };
