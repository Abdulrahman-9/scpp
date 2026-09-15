import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount } from '../derive';
import { Icon } from '../Icon';

export interface WizardCond {
  t: string;
  ok: boolean;
  /**
   * `id` of the control this condition guards. Optional, and the shell degrades cleanly without
   * it — but a condition that names its field turns a refusal into something the keyboard can
   * follow: pressing «التالي» while it is unmet marks that field and puts the caret in it.
   */
  field?: string;
}

/** What the gate refused: the field it belongs to, and the sentence that says why. */
export interface WizardRejection {
  field: string;
  msg: string;
}

/**
 * Field props for a control the gate has just refused — one shape for every wizard, so no screen
 * invents its own error wiring. `aria-describedby` points at the line `<FieldError>` renders, not
 * at the footer gate: the reason belongs beside the field for a screen reader too.
 */
export function fieldReject(rejected: WizardRejection | null, id: string, className: string) {
  const bad = rejected?.field === id;
  return bad
    ? { id, className: `${className} op-in--bad`, 'aria-invalid': true as const, 'aria-describedby': `${id}-err` }
    : { id, className };
}

/**
 * The same wiring for a control that is NOT a text field — a chip group, a checkbox button. It
 * carries the id and the ARIA but never `.op-in--bad`: a red edge on one option would say «this
 * option is wrong» when what the gate refused is that no option was chosen at all.
 */
export function groupReject(rejected: WizardRejection | null, id: string) {
  return rejected?.field === id
    ? { id, 'aria-invalid': true as const, 'aria-describedby': `${id}-err` }
    : { id };
}

/** The refusal said on the field itself. `role="alert"` because it appears in reaction to an act. */
export function FieldError({ rejected, id }: { rejected: WizardRejection | null; id: string }) {
  if (rejected?.field !== id) return null;
  return (
    <span className="op-in__err" id={`${id}-err`} role="alert">
      <Icon name="alert" size={13} />
      {rejected.msg}
    </span>
  );
}
export interface WizardStep {
  label: string;
  title: string;
  sub: string;
  help: { t: string; r: string };
  conditions: WizardCond[];
  content: ReactNode;
}
export interface WizardShellProps {
  title: string;
  tenderName: string;
  code: string;
  steps: WizardStep[];
  finalLabel: string;
  finalInstitutional?: boolean;
  /** dispatched once, when the last step is confirmed */
  onFinish: () => void;
  success: { title: string; desc: string; audit: string };
  /** hash to leave to (✕ exit + success primary) */
  doneHash: string;
  /** hash for the ✕ exit / cancel (defaults to doneHash) */
  exitHash?: string;
  /**
   * Called when the gate refuses an advance: with the offending condition when it names a field,
   * with `null` otherwise. The wizard holds the value and feeds it back through `fieldReject` /
   * `<FieldError>` — the shell cannot reach into `content`, which the wizard builds.
   */
  onReject?: (r: WizardRejection | null) => void;
}

export default function WizardShell({ title, tenderName, code, steps, finalLabel, finalInstitutional, onFinish, success, doneHash, exitHash, onReject }: WizardShellProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [done, setDone] = useState(false);

  const go = (hash: string) => () => { window.location.hash = hash; };

  if (done) {
    return (
      <div className="wz">
        <div className="wz-done">
          <div className="wz-done__card">
            <span className="wz-done__mark"><Icon name="check" size={28} strokeWidth={2.25} /></span>
            <div className="wz-done__t">{success.title}</div>
            <div className="wz-done__d">{success.desc}</div>
            <div className="wz-done__audit">{success.audit}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <a className="op-btn-primary" href={doneHash}>{t('wizard.continue')}</a>
              <a className="op-btn-ghost" href="#/operator">{t('wizard.backPortal')}</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cur = steps[step]!;
  const allOk = cur.conditions.every((c) => c.ok);
  const firstUnmet = cur.conditions.find((c) => !c.ok);
  const isLast = step === steps.length - 1;

  const next = () => {
    if (!allOk) {
      // The refusal is now an EVENT, not just a sentence sitting in the footer: the field that
      // caused it is named, and the caret is moved to it so a keyboard user is put where the fix
      // is. Without `field` on the condition this is exactly the old behaviour — refuse, say why.
      onReject?.(firstUnmet?.field ? { field: firstUnmet.field, msg: firstUnmet.t } : null);
      if (firstUnmet?.field) {
        const el = document.getElementById(firstUnmet.field);
        // focus is the contract; bringing it into view is a courtesy, and jsdom implements no
        // layout, so the optional call keeps the mechanism testable instead of throwing
        if (el) { el.focus(); el.scrollIntoView?.({ block: 'nearest' }); }
      }
      return;
    }
    onReject?.(null);
    if (isLast) { onFinish(); setDone(true); return; }
    const n = step + 1;
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  return (
    <div className="wz">
      <header className="wz-top">
        <a className="wz-exit" href={exitHash ?? doneHash}>✕ {t('wizard.exit')}</a>
        <div className="wz-crumb">
          <span style={{ whiteSpace: 'nowrap' }}>{tenderName}</span>
          <span className="op-code">{code}</span>
          <span className="wz-crumb__sep">›</span>
          <span className="wz-crumb__title">{title}</span>
          <span className="wz-crumb__sep">›</span>
          <span className="wz-crumb__step">{t('wizard.step', { n: fmtCount(step + 1, lang), c: fmtCount(steps.length, lang) })}</span>
        </div>
        {/* D2 — the «مسودة تُحفظ تلقائيًا» badge was removed: no draft mechanism exists, and a
            badge asserting one is a placebo. If drafts ever land, the badge returns WITH them. */}
      </header>

      <div className="wz-body">
        <div className="wz-side">
          <div className="wz-rail">
            {steps.map((s, i) => {
              const isDone = i < step;
              const on = i === step;
              const reachable = i <= maxStep;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                  <button
                    className={`wz-step${on ? ' wz-step--on' : ''}${isDone ? ' wz-step--done' : ''}`}
                    onClick={() => reachable && setStep(i)}
                    disabled={!reachable}
                    style={{ cursor: reachable ? 'pointer' : 'default' }}
                  >
                    <span className="wz-step__c">{isDone ? '✓' : i + 1}</span>
                    <span className="wz-step__l">{s.label}</span>
                  </button>
                  {i < steps.length - 1 && <span className={`wz-step__conn${isDone ? ' wz-step__conn--done' : ''}`} />}
                </div>
              );
            })}
          </div>
          <div className="wz-why">
            <div className="wz-why__head"><Icon name="shield" size={14} />{t('wizard.why')}</div>
            <div className="wz-why__body">{cur.help.t}</div>
            <span className="wz-why__ref">{cur.help.r}</span>
          </div>
        </div>

        <div className="wz-main">
          <div className="wz-card">
            <div className="wz-card__head">
              <div className="wz-card__title">{cur.title}</div>
              <div className="wz-card__sub">{cur.sub}</div>
            </div>
            <div className="wz-card__body">
              {cur.content}

              <div className="wz-conds">
                <div className="wz-conds__l">{t('wizard.conditions')}</div>
                {cur.conditions.map((c, i) => (
                  <div key={i} className={`wz-cond${c.ok ? ' wz-cond--ok' : ''}`}>
                    <span className="wz-cond__m">{c.ok ? '✓' : '•'}</span>
                    <span className="wz-cond__t">{c.t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="wz-foot">
              <button className="wz-prev" onClick={() => step > 0 && setStep(step - 1)} disabled={step === 0}>
                <Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />
                {t('wizard.prev')}
              </button>
              <div className="wz-foot__end">
                <div className="wz-foot__row">
                  {/* D2 — labelled by what it DOES (leave the wizard); «احفظ مسودة» saved nothing */}
                  <button className="op-btn-ghost" onClick={go(exitHash ?? doneHash)}>{t('wizard.exit')}</button>
                  {/* `aria-disabled`, not `disabled`: a hard-disabled button drops out of the tab
                      order and swallows the click, so the ONE moment the form has something to
                      say — «you pressed it and here is what stops you» — never happens, and a
                      screen-reader user cannot even reach the control to be told. The gate is
                      just as closed: `next()` refuses on its own, and the styling below reads
                      `[aria-disabled='true']` alongside `:disabled`. */}
                  <button
                    className="op-btn-primary"
                    onClick={next}
                    aria-disabled={!allOk}
                  >
                    {isLast ? finalLabel : t('wizard.next')}
                    <Icon name="chevronStart" size={13} strokeWidth={2} className="op-chev-fwd" />
                  </button>
                </div>
                <span className={`wz-gate${allOk ? ' wz-gate--ok' : ''}`}>
                  {allOk ? (isLast && finalInstitutional ? t('wizard.institutionalNote') : '') : t('wizard.remaining', { c: firstUnmet?.t ?? '' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
