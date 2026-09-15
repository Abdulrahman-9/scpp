import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiLogin } from './api/endpoints';
import { isApiMode } from './config';
import { DEMO_IDENTITIES, isApiLoginable, saveSession, type ApiRole } from './session';

/**
 * Login — two-step flow (SSO → 2FA). In api mode it authenticates against the
 * backend (httpOnly-cookie session); in local mode it produces a mock session.
 * Either way the role-scoped session shape is identical.
 */
export default function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'sso' | 'otp'>('sso');
  const [role, setRole] = useState<ApiRole>('OPERATOR_ADMIN');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const identity = DEMO_IDENTITIES.find((i) => i.role === role) ?? DEMO_IDENTITIES[0]!;

  const persist = (name: string) =>
    saveSession({ name, role, oid: identity.oid, company: identity.company, companyId: identity.companyId });

  const finish = async () => {
    if (!/^\d{6}$/.test(code) || busy) return;
    setError('');
    if (isApiMode) {
      // the server's LoginDto accepts only API_LOGINABLE_ROLES — this narrows `role` to them
      if (!isApiLoginable(role)) {
        setError(t('login.notApiLoginable'));
        return;
      }
      setBusy(true);
      try {
        const res = await apiLogin(role, code);
        persist(res.user.name);
        onLogin();
      } catch {
        setError(t('login.failed'));
      } finally {
        setBusy(false);
      }
      return;
    }
    persist(identity.name);
    onLogin();
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img className="logo-adaptive" src="/logo.svg" alt="Masaar" style={{ height: 36 }} />
        <h1>{t('login.title')}</h1>
        <p className="hint">{t('login.hint')}</p>

        {step === 'sso' ? (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>{t('login.role')}</label>
              {/* ل1 — the seats are DERIVED from the demo mandate, not re-typed beside it. The
                  hand-written list held three while `DEMO_IDENTITIES` held four, which is exactly
                  how the joint-committee seat came to exist everywhere except at its own door. */}
              <select value={role} onChange={(e) => setRole(e.target.value as ApiRole)}>
                {DEMO_IDENTITIES.map((i) => (
                  <option key={i.role} value={i.role}>{t(i.labelKey)}</option>
                ))}
              </select>
            </div>
            <button className="op-btn-primary login-sso" onClick={() => setStep('otp')}>
              {t('login.sso')}
            </button>
            <p className="g-hint" style={{ marginTop: 12 }}>{t('login.ssoNote')}</p>
          </>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 16 }}>
              <label htmlFor="otp">{t('login.otp')}</label>
              <input
                id="otp"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && void finish()}
                autoFocus
              />
            </div>
            {error && <p className="g-hint late-num" style={{ marginBottom: 10 }}>{error}</p>}
            <button className="op-btn-primary login-sso" aria-busy={busy} disabled={!/^\d{6}$/.test(code) || busy} onClick={() => void finish()}>
              {busy ? '…' : t('login.verify')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
