import { stageByKey } from '@masaar/scpp-rules';
import { StatusPill } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { fmtCount, fmtMoney } from '../operator/derive';
import { DevBadge } from '../operator/DevBadge';
import { Icon } from '../operator/Icon';
import { PathChip } from '../operator/PathChip';
import { ScoreBar } from '../registry/ScoreBar';
import { loadSession } from '../session';
import { banWithinLimit, govReasonValid, todayIso, useStore } from '../store';
import { useAdminUi } from './AdminShell';
import { capHealth } from './contractDerive';
import { deriveParticipation, vendorStats, vendorStatus } from './entities';
import { Modal } from './Modal';
import { useActor } from './UserActions';

type Dialog = null | 'suspend' | 'lift' | 'ban' | 'scores' | 'archive' | 'restore';
const STATUS_PILL = { eligible: 'done', suspended: 'delayed', banned: 'blocked' } as const;
const CAP_PILL = { ok: 'done', risk: 'risk', breach: 'blocked' } as const;

export default function EntityProfile({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();
  const today = todayIso();
  // ق7 archive/restore is a registry act, gated exactly like the field archive on the Fields
  // screen: disabled WITH its reason, never hidden — a capability the reader cannot see is a
  // capability they cannot ask for.
  const isSuper = loadSession()?.role === 'SUPER_ADMIN';

  const vendor = state.vendors.find((v) => v.id === id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reason, setReason] = useState('');
  const [banUntil, setBanUntil] = useState('');
  const [scores, setScores] = useState({ tech: vendor?.techScore ?? 0, fin: vendor?.financialScore ?? 0, hse: vendor?.hseScore ?? 0 });

  if (!vendor) {
    return (
      <div className="op-page" style={{ maxWidth: 1240 }}>
        <a className="file-back" href="#/admin/entities"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('entity.back')}</a>
        <div className="op-empty">{t('entity.notFound')}</div>
      </div>
    );
  }

  const status = vendorStatus(vendor, today);
  const participation = deriveParticipation(state, vendor, today);
  const stats = vendorStats(participation);
  const events = vendor.events ?? [];
  // this entity's post-award contracts — the reverse of ContractProfile's contractor link
  const vendorContracts = state.contracts.filter((c) => c.vendorId === vendor.id);

  const open = (d: Dialog) => { setReason(''); setBanUntil(''); setScores({ tech: vendor.techScore, fin: vendor.financialScore, hse: vendor.hseScore }); setDialog(d); };
  const close = () => setDialog(null);
  const reasonOk = reason.trim().length >= 20;

  const confirmSuspend = () => { dispatch({ type: 'SUSPEND_VENDOR', vendorId: id, reason: reason.trim() }); toast(t('entity.toastSuspend', { name: vendor.name })); close(); };
  const confirmLift = () => { dispatch({ type: 'LIFT_VENDOR', vendorId: id, reason: reason.trim() }); toast(t('entity.toastLift', { name: vendor.name })); close(); };
  const confirmBan = () => { dispatch({ type: 'BAN_VENDOR', vendorId: id, banUntil, reason: reason.trim() }); toast(t('entity.toastBan', { name: vendor.name })); close(); };
  const confirmScores = () => { dispatch({ type: 'SET_VENDOR_SCORES', vendorId: id, techScore: scores.tech, financialScore: scores.fin, hseScore: scores.hse, reason: reason.trim() }); toast(t('entity.toastScores', { name: vendor.name })); close(); };
  /**
   * ق7 — archive / restore. Unlike a field, an entity archives WHATEVER its history: its bids,
   * contracts and governance events are immutable and stay on this page. Archiving withdraws it
   * from the bidder pickers and from the active registry view — nothing is deleted, and the
   * justification (≥20 chars, attributed to the actor) lands in the audit log like its siblings.
   */
  const confirmArchive = (mode: 'archive' | 'restore') => () => {
    if (!actor || !isSuper || !govReasonValid(reason)) return;
    void dispatch(
      mode === 'archive'
        ? { type: 'ARCHIVE_VENDOR', vendorId: id, reason: reason.trim(), by: actor }
        : { type: 'RESTORE_VENDOR', vendorId: id, reason: reason.trim(), by: actor },
    ).then((r) => {
      if (!r.ok) return;
      toast(t(mode === 'archive' ? 'entity.toastArchive' : 'entity.toastRestore', { name: vendor.name }));
      close();
    });
  };

  const kpis = [
    { l: t('entity.bids'), v: stats.bids },
    { l: t('entity.wins'), v: stats.wins },
    { l: t('entity.passRate'), v: `${stats.passRate}%` },
    { l: t('entity.winRate'), v: `${stats.winRate}%` },
  ];

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/admin/entities"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('entity.back')}</a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span dir="auto" style={{ fontSize: 24, fontWeight: 700 }}>{vendor.name}</span>
            {/* ق5 — the two ministry registers, told apart on the face of the file: the
                Article-25 mark (a legal fact about the company, §9 participation) beside the
                suppliers-list membership (C8.7 — an accepted origin route for imported materials) */}
            {vendor.isStateCompany && <span className="ent-state" title={t('vendors.stateDef')}>{t('vendors.stateTag')}</span>}
            <StatusPill status={vendor.mooListed ? 'done' : 'planned'} title={t('vendors.mooDef')}>
              {vendor.mooListed ? t('vendors.mooOnList') : t('vendors.mooOffList')}
            </StatusPill>
            <StatusPill status={STATUS_PILL[status]}>{t(`entity.status_${status}`)}</StatusPill>
            {vendor.archived && <span className="arch-pill">{t('entity.archived')}</span>}
            {status === 'banned' && vendor.banUntil && <span className="op-scpp">14.3 · {t('vendors.until')} {vendor.banUntil}</span>}
          </div>
          <div className="file-meta">{t('entity.profileSub')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {vendor.suspended ? (
            <button className="op-btn-ghost" onClick={() => open('lift')}>{t('entity.lift')}</button>
          ) : (
            <button className="op-btn-ghost" onClick={() => open('suspend')}>{t('entity.suspend')}</button>
          )}
          <button className="op-btn-ghost" onClick={() => open('ban')}>{t('entity.ban')}</button>
          <button className="op-btn-ghost" onClick={() => open('scores')}>{t('entity.editScores')}</button>
          {/* ق7 — the delete the client asked for, as the archive the record permits (8.1-e) */}
          {vendor.archived ? (
            <button className="op-btn-ghost" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => open('restore')}>{t('entity.restore')}</button>
          ) : (
            <button className="op-btn-ghost" disabled={!isSuper} title={isSuper ? undefined : t('access.gateNotSuper')} onClick={() => open('archive')}>{t('entity.archive')}</button>
          )}
        </div>
      </div>

      {/* NAMED DEBT: /api/vendors carries suspend / lift / ban / scores and nothing else — it has
          no archive flag. So on this page the two archive actions apply in the browser while the
          four sanction actions reach the server, and API mode says exactly that rather than letting
          the whole file imply one behaviour (precedent: Vendors.tsx / Fields.tsx). */}
      {isApiMode && (
        <div className="wz-note wz-note--warn" style={{ marginBlockStart: 14 }}>
          <Icon name="alert" size={15} />
          <span>{t('entity.localOnlyFile')}</span>
          <DevBadge label={t('dev.local')} title={t('entity.localOnlyFile')} />
        </div>
      )}

      {/* An archived entity announces itself before anything else on the page: the file still
          reads in full, which is the whole point of archiving instead of deleting. */}
      {vendor.archived && (
        <div className="wz-note wz-note--warn" style={{ marginBlockStart: 14 }}>
          <Icon name="alert" size={15} />
          <span>{t('entity.archivedBanner')}</span>
        </div>
      )}

      <div className="ad-kpis" style={{ marginTop: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi"><div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div><div className="ad-kpi__row"><span className="ad-kpi__v">{typeof k.v === 'number' ? fmtCount(k.v, lang) : k.v}</span></div></div>
        ))}
      </div>

      <div className="ad-cols" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
        {/* Participation history */}
        <div className="ad-panel">
          <div className="ad-panel__head"><div><div className="ad-panel__t">{t('entity.history')}</div><div className="ad-panel__s">{t('entity.historySub')}</div></div></div>
          {participation.length === 0 ? (
            <div className="ad-empty-inline">{t('entity.noHistory')}</div>
          ) : (
            <table className="op-tbl">
              <thead><tr><th>{t('tenders.colTender')}</th><th>{t('tenders.colPath')}</th><th>{t('filebidders.colTech')}</th><th>{t('filebidders.colPrice')}</th><th>{t('entity.outcome')}</th></tr></thead>
              <tbody>
                {participation.map((p) => (
                  <tr key={p.tender.id} className="op-tbl__row" onClick={() => { window.location.hash = `#/admin/review/${p.tender.id}`; }}>
                    <td><div className="op-tbl__name" dir="auto">{p.tender.title[lang]}</div><div className="op-tbl__code">{p.tender.code}</div></td>
                    <td><PathChip id={p.tender.methodId} lang={lang} /></td>
                    <td>{p.technicalResult === 'pass' ? <StatusPill size="sm" status="done">{t('filebidders.techPass')}</StatusPill> : p.technicalResult === 'fail' ? <StatusPill size="sm" status="delayed">{t('filebidders.techFail')}</StatusPill> : <span className="op-dev op-dev--none">—</span>}</td>
                    <td>{p.priceUSD != null ? <span className="op-code">{fmtMoney(p.priceUSD)}</span> : <span className="file-locked"><Icon name="lock" size={12} />12.4.2</span>}</td>
                    <td>
                      {p.won ? <StatusPill status="done">{t('entity.won')}</StatusPill>
                        : p.ongoing ? <StatusPill status="progress">{p.currentStageKey ? stageByKey(p.currentStageKey)?.[lang] : t('entity.ongoing')}</StatusPill>
                        : <StatusPill status="planned">{t('entity.closed')}</StatusPill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Capabilities + governance trail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ad-panel">
            <div className="ad-panel__head"><div className="ad-panel__t">{t('vendors.scores')}</div></div>
            <div style={{ padding: '14px 20px' }}>
              {([['tech', vendor.techScore], ['fin', vendor.financialScore], ['hse', vendor.hseScore]] as const).map(([k, val]) => (
                <ScoreBar key={k} label={t(`vendors.${k}`)} value={val} />
              ))}
            </div>
          </div>
          <div className="ad-panel">
            <div className="ad-panel__head">
              <div><div className="ad-panel__t">{t('entity.contractsTitle')}</div><div className="ad-panel__s">{t('entity.contractsSub')}</div></div>
              {vendorContracts.length > 0 && <span className="ad-panel__count">{fmtCount(vendorContracts.length, lang)}</span>}
            </div>
            {vendorContracts.length === 0 ? (
              <div className="ad-empty-inline">{t('entity.noContracts')}</div>
            ) : (
              vendorContracts.map((c) => {
                const h = capHealth(c);
                return (
                  <a key={c.id} className="ad-late ent-crow" href={`#/admin/contracts/${c.id}`}>
                    <div className="ad-late__body">
                      <div className="ad-late__t" dir="auto">{c.title[lang]}</div>
                      <div className="ad-late__s"><span className="op-code">{c.code}</span> · {fmtMoney(c.valueUSD)}</div>
                    </div>
                    <StatusPill status={CAP_PILL[h]}>{t(`contracts.cap_${h}`)}</StatusPill>
                  </a>
                );
              })
            )}
          </div>
          <div className="ad-panel">
            <div className="ad-panel__head"><div><div className="ad-panel__t">{t('entity.events')}</div><div className="ad-panel__s">{t('entity.eventsSub')}</div></div></div>
            {events.length === 0 ? (
              <div className="ad-empty-inline">{t('entity.noEvents')}</div>
            ) : (
              events.map((e, i) => (
                <div key={i} className="ad-late">
                  <div className="ad-late__body">
                    {/* interpolated key — the vocabulary is pinned in both locales by a test */}
                    <div className="ad-late__t">{t(`entity.ev_${e.kind}`)}{e.detail ? ` — ${e.detail}` : ''}</div>
                    <div className="ad-late__s">{e.reason}</div>
                  </div>
                  <span className="op-code" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{e.on}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ---- governance modals ---- */}
      {(dialog === 'suspend' || dialog === 'lift') && (
        <Modal
          title={dialog === 'suspend' ? t('entity.suspend') : t('entity.lift')}
          sub={vendor.name}
          onClose={close}
          footer={<><button className="op-btn-ghost" onClick={close}>{t('entity.cancel')}</button><span style={{ flex: 1 }} /><button className={dialog === 'suspend' ? 'op-btn-danger' : 'op-btn-primary'} disabled={!reasonOk} onClick={dialog === 'suspend' ? confirmSuspend : confirmLift}>{t('entity.confirm')}</button></>}
        >
          <label className="wz-field__l">{t('entity.reason')}</label>
          <textarea className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('entity.reasonPh')} style={{ width: '100%', marginTop: 6 }} />
          <div className="wz-gate" style={{ marginTop: 6 }}>{reasonOk ? t('entity.auditNote') : t('entity.reasonMin')}</div>
        </Modal>
      )}
      {dialog === 'ban' && (
        <Modal
          title={t('entity.ban')} sub={vendor.name} onClose={close}
          footer={<><button className="op-btn-ghost" onClick={close}>{t('entity.cancel')}</button><span style={{ flex: 1 }} /><button className="op-btn-danger" disabled={!reasonOk || !banWithinLimit(banUntil, today)} onClick={confirmBan}>{t('entity.confirmBan')}</button></>}
        >
          <label className="wz-field__l">{t('entity.banUntil')} <small>— {t('entity.banCap')}</small></label>
          {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
          <input className="wz-in wz-in--mono" type="date" value={banUntil} onChange={(e) => setBanUntil(e.target.value)} style={{ marginTop: 6, marginBottom: 12 }} />
          <label className="wz-field__l">{t('entity.reason')}</label>
          <textarea className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('entity.banReasonPh')} style={{ width: '100%', marginTop: 6 }} />
          <div className="wz-gate" style={{ marginTop: 6 }}>{!banWithinLimit(banUntil, today) ? t('entity.banInvalid') : !reasonOk ? t('entity.reasonMin') : t('entity.auditNote')}</div>
        </Modal>
      )}
      {(dialog === 'archive' || dialog === 'restore') && (
        <Modal
          title={t(dialog === 'archive' ? 'entity.archive' : 'entity.restore')} sub={vendor.name} onClose={close}
          footer={<>
            <button className="op-btn-ghost" onClick={close}>{t('entity.archiveUndo')}</button>
            <span style={{ flex: 1 }} />
            <button className="op-btn-primary" disabled={!reasonOk} onClick={confirmArchive(dialog)}>
              {t(dialog === 'archive' ? 'entity.archiveConfirm' : 'entity.restoreConfirm')}
            </button>
          </>}
        >
          <div className="wz-note wz-note--info">
            {t(dialog === 'archive' ? 'entity.archiveBody' : 'entity.restoreBody', { n: fmtCount(stats.bids, lang), c: fmtCount(vendorContracts.length, lang) })}
          </div>
          <label className="wz-field__l" style={{ marginTop: 12, display: 'block' }}>{t('entity.reason')}</label>
          <textarea className="wz-ta" rows={3} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('entity.archiveReasonPh')} style={{ width: '100%', marginTop: 6 }} />
          <div className="wz-gate" style={{ marginTop: 6 }}>{reasonOk ? t('entity.auditNote') : t('entity.reasonMin')}</div>
        </Modal>
      )}
      {dialog === 'scores' && (
        <Modal
          title={t('entity.editScores')} sub={vendor.name} onClose={close}
          footer={<><button className="op-btn-ghost" onClick={close}>{t('entity.cancel')}</button><span style={{ flex: 1 }} /><button className="op-btn-primary" disabled={!reasonOk} onClick={confirmScores}>{t('entity.confirm')}</button></>}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            {([['tech', 'tech'], ['fin', 'fin'], ['hse', 'hse']] as const).map(([key, label]) => (
              <div key={key} className="wz-field" style={{ flex: 1 }}>
                <label className="wz-field__l">{t(`vendors.${label}`)}</label>
                <input className="wz-in wz-in--mono" type="number" min={0} max={100} value={scores[key]} onChange={(e) => setScores((s) => ({ ...s, [key]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) }))} />
              </div>
            ))}
          </div>
          <label className="wz-field__l" style={{ marginTop: 12, display: 'block' }}>{t('entity.reason')}</label>
          <textarea className="wz-ta" rows={2} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('entity.scoresReasonPh')} style={{ width: '100%', marginTop: 6 }} />
          <div className="wz-gate" style={{ marginTop: 6 }}>{reasonOk ? t('entity.auditNote') : t('entity.reasonMin')}</div>
        </Modal>
      )}
    </div>
  );
}
