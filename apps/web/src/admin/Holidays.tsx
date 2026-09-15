import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtDate } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { calendarOf, govReasonValid, holidaysImpact, todayIso, useStore, type HolidayImpact } from '../store';
import { EmptyState } from '../registry/EmptyState';
import { useAdminUi } from './AdminShell';
import { Modal } from './Modal';
import { useActor } from './UserActions';

/**
 * Admin-managed public holidays — the data behind the working-day calendar (§11.3.4-e). Every
 * add/remove reshapes `calendarOf(state)`, so each is a governance action (Actor + documented
 * reason, audited) and each PREVIEWS its retroactive footprint: the published tenders whose derived
 * bid-closing rolls. In API mode the change is written to /api/holidays and survives re-hydration.
 */
export default function Holidays() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  const [dialog, setDialog] = useState<null | { kind: 'add' } | { kind: 'remove'; date: string }>(null);

  const rows = useMemo(() => [...state.holidays].sort((a, b) => a.date.localeCompare(b.date)), [state.holidays]);

  return (
    <section className="card">
      <div className="file-bidders-head">
        <div className="file-bidders-head__l">
          <h2 style={{ margin: 0 }}>{t('holidays.title')}</h2>
          <div className="file-bidders-head__sub">{t('holidays.sub', { n: fmtCount(rows.length, lang) })}</div>
        </div>
        <div className="file-bidders-head__act">
          <button className="op-btn-primary" onClick={() => setDialog({ kind: 'add' })}>
            <Icon name="plus" size={15} />
            {t('holidays.add')}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState mode="empty">{t('holidays.emptyHint')}</EmptyState>
      ) : (
        <div className="file-card" style={{ marginTop: 12 }}>
          <table className="op-tbl">
            <thead>
              <tr>
                <th>{t('holidays.colDate')}</th>
                <th>{t('holidays.colName')}</th>
                <th>{t('holidays.colWeekday')}</th>
                <th className="op-end">{t('holidays.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.date}>
                  <td><span className="mono">{h.date}</span></td>
                  <td dir="auto">{h.name ?? <span className="op-muted">—</span>}</td>
                  <td>{fmtDate(h.date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</td>
                  <td className="op-end">
                    <button className="op-btn-ghost" onClick={() => setDialog({ kind: 'remove', date: h.date })}>
                      <Icon name="close" size={14} />
                      {t('holidays.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === 'add' && <AddHolidayModal onClose={() => setDialog(null)} />}
      {dialog?.kind === 'remove' && <RemoveHolidayModal date={dialog.date} onClose={() => setDialog(null)} />}
    </section>
  );
}

/** The retroactive-footprint preview shared by add and remove — the published tenders whose closing moves. */
function ImpactPreview({ impact }: { impact: HolidayImpact[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const fmt = (iso: string) => fmtDate(iso, lang, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <>
      {impact.length === 0 ? (
        <div className="wz-note">{t('holidays.impactNone')}</div>
      ) : (
        <div className="wz-note wz-note--warn">
          <Icon name="alert" size={15} />
          <div>
            <div>{t('holidays.impactSome', { n: impact.length })}</div>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {impact.map((i) => (
                <li key={i.tenderId}><span className="op-code">{i.code}</span>: {fmt(i.before)} → {fmt(i.after)}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {/* the closing list is the load-bearing part; every WD countdown (deviations, MCT 6.9 windows) also re-reads */}
      <div className="op-muted" style={{ fontSize: 11, marginTop: 4 }}>{t('holidays.impactWd')}</div>
    </>
  );
}

function AddHolidayModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');

  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const isDup = isValidDate && state.holidays.some((h) => h.date === date);
  const impact = useMemo(() => (isValidDate && !isDup ? holidaysImpact(state, date, 'add') : []), [state, date, isValidDate, isDup]);

  const gate = !actor ? t('holidays.noActor')
    : !isValidDate ? t('holidays.gateDate')
    : isDup ? t('holidays.gateDup')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : '';
  const canSubmit = gate === '';

  const submit = () => {
    if (!canSubmit || !actor) return;
    void dispatch({ type: 'ADD_HOLIDAY', date, name: name.trim() || undefined, reason: reason.trim(), by: actor }).then((r) => {
      if (r.ok) toast(t('holidays.added', { d: date }), { kind: 'success' });
    });
    onClose();
  };

  return (
    <Modal
      title={t('holidays.addTitle')}
      sub={t('holidays.addSub')}
      onClose={onClose}
      footer={
        <>
          <button className="op-btn-primary" onClick={submit} disabled={!canSubmit}><Icon name="plus" size={15} />{t('holidays.add')}</button>
          <button className="op-btn-ghost" onClick={onClose}>{t('holidays.cancel')}</button>
          <span className={`wz-gate${canSubmit ? ' wz-gate--ok' : ''}`}>{canSubmit ? t('holidays.gateReady') : gate}</span>
        </>
      }
    >
      <div className="wz-field">
        <label className="wz-field__l" htmlFor="hol-date">{t('holidays.fieldDate')}</label>
        <input id="hol-date" type="date" className="wz-in" min={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="wz-field" style={{ marginTop: 10 }}>
        <label className="wz-field__l" htmlFor="hol-name">{t('holidays.fieldName')}</label>
        <input id="hol-name" className="wz-in" dir="auto" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('holidays.namePh')} />
      </div>
      <div className="wz-field" style={{ marginTop: 10 }}>
        <label className="wz-field__l" htmlFor="hol-reason">{t('access.reason')}</label>
        <textarea id="hol-reason" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
      {isValidDate && !isDup && <div style={{ marginTop: 10 }}><ImpactPreview impact={impact} /></div>}
    </Modal>
  );
}

function RemoveHolidayModal({ date, onClose }: { date: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const [reason, setReason] = useState('');
  const impact = useMemo(() => holidaysImpact(state, date, 'remove'), [state, date]);

  const gate = !actor ? t('holidays.noActor') : !govReasonValid(reason) ? t('access.reasonMin') : '';
  const canSubmit = gate === '';

  const submit = () => {
    if (!canSubmit || !actor) return;
    void dispatch({ type: 'REMOVE_HOLIDAY', date, reason: reason.trim(), by: actor }).then((r) => {
      if (r.ok) toast(t('holidays.removed', { d: date }), { kind: 'success' });
    });
    onClose();
  };

  return (
    <Modal
      title={t('holidays.removeTitle')}
      sub={date}
      onClose={onClose}
      footer={
        <>
          <button className="op-btn-danger" onClick={submit} disabled={!canSubmit}><Icon name="close" size={15} />{t('holidays.remove')}</button>
          <button className="op-btn-ghost" onClick={onClose}>{t('holidays.cancel')}</button>
          <span className={`wz-gate${canSubmit ? ' wz-gate--ok' : ''}`}>{canSubmit ? t('holidays.gateReady') : gate}</span>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>{t('holidays.removeHint')}</p>
      <ImpactPreview impact={impact} />
      <div className="wz-field" style={{ marginTop: 10 }}>
        <label className="wz-field__l" htmlFor="hol-reason-rm">{t('access.reason')}</label>
        <textarea id="hol-reason-rm" className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
      </div>
    </Modal>
  );
}
