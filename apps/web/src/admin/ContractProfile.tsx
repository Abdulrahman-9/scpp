import {
  extensionCap,
  guaranteeExpiringSoon,
  liquidatedDamagesCap,
  performanceBondValid,
  renewalAllowed,
  stageDeviationDays,
  suspensionCap,
  variationOrdersCap,
  type CapResult,
} from '@masaar/scpp-rules';
import { CapMeter, StatusPill } from '@masaar/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isApiMode } from '../config';
import { DevBadge } from '../operator/DevBadge';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { todayIso, useStore } from '../store';
import { useAdminUi } from './AdminShell';
import { actualDelivery, capHealth, contractProgress, currentStageIndex, currentStageKey, plannedDelivery, plannedProgressPct, scheduleVariancePct, stageLabel } from './contractDerive';
import { Modal } from './Modal';

type Drawer = 'vo' | 'ext' | 'ld' | 'guar' | 'susp' | 'renew' | 'stage' | null;
const CAP_PILL = { ok: 'done', risk: 'risk', breach: 'blocked' } as const;
const TITLE_KEY: Record<Exclude<Drawer, null>, string> = {
  vo: 'addVo', ext: 'addExt', ld: 'addLd', guar: 'addGuar', susp: 'addSusp', renew: 'addRenew', stage: 'advanceStage',
};

/** Contract file 360° — lifecycle stages, the §18–21 (+§19.1) cap meters, guarantees,
 *  governance actions (VO / extension / LD / guarantee / suspension / renewal / advance stage)
 *  and an append-only event trail. Every cap action is gated exactly like the reducer. */
export default function ContractProfile({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const today = todayIso();

  const c = state.contracts.find((x) => x.id === id);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  // «إجراءات أخرى» overflow menu — a lightweight disclosure, not a modal: each item opens its
  // own focus-trapping Modal, so trapping focus in the menu too would be redundant. Escape
  // closes and returns focus to the trigger; a click outside closes it.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMenuOpen(false); menuBtnRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  if (!c) {
    return (
      <div className="op-page" style={{ maxWidth: 1240 }}>
        <a className="file-back" href="#/admin/contracts"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('contracts.back')}</a>
        <div className="op-empty">{t('contracts.notFound')}</div>
      </div>
    );
  }

  const vo = variationOrdersCap(c.voTotalUSD, c.valueUSD);
  const ext = extensionCap(c.extensionDays, c.termDays);
  const susp = suspensionCap(c.suspensionDays, c.termDays);
  const ld = liquidatedDamagesCap(c.ldTotalUSD, c.valueUSD);
  const health = capHealth(c);
  const prog = contractProgress(c);
  const plannedPct = plannedProgressPct(c, today);
  const variance = scheduleVariancePct(c, today);
  const delivery = plannedDelivery(c);
  const delivered = actualDelivery(c);
  const curIdx = currentStageIndex(c);
  const stageKey = currentStageKey(c);
  const events = c.events ?? [];
  // origin tender for the «من المناقصة» chip — only when the link resolves to a loaded tender,
  // so we never render a fabricated code (seed contracts are honestly unlinked → no chip)
  const fromTender = c.tenderId ? state.tenders.find((x) => x.id === c.tenderId) : undefined;

  const open = (d: Exclude<Drawer, null>) => { setAmount(''); setDate(d === 'guar' ? '' : today); setDrawer(d); };
  const close = () => setDrawer(null);

  const num = Number(amount) || 0;
  const isDaysKind = drawer === 'ext' || drawer === 'susp';
  let preview: CapResult | null = null;
  let perfOk = true;
  let valid = false;
  if (drawer === 'vo') preview = variationOrdersCap(c.voTotalUSD + num, c.valueUSD);
  else if (drawer === 'ext') preview = extensionCap(c.extensionDays + num, c.termDays);
  else if (drawer === 'ld') preview = liquidatedDamagesCap(c.ldTotalUSD + num, c.valueUSD);
  else if (drawer === 'susp') preview = suspensionCap(c.suspensionDays + num, c.termDays);
  else if (drawer === 'guar') perfOk = performanceBondValid(num, c.valueUSD).ok;

  if (drawer === 'renew') valid = renewalAllowed(num).ok && !!date;
  else if (drawer === 'vo' || drawer === 'ext' || drawer === 'ld' || drawer === 'susp' || drawer === 'guar') {
    const amountOk = isDaysKind ? Number.isInteger(num) && num >= 1 : num >= 0.01;
    valid = amountOk && !!date && (drawer === 'guar' ? perfOk : preview!.status !== 'breach');
  }

  const confirm = () => {
    switch (drawer) {
      case 'vo': if (!valid) return; dispatch({ type: 'ADD_VO', contractId: id, valueUSD: num, approvedOn: date }); toast(t('contracts.toastVo', { code: c.code })); break;
      case 'ext': if (!valid) return; dispatch({ type: 'ADD_EXTENSION', contractId: id, days: num, approvedOn: date }); toast(t('contracts.toastExt', { code: c.code })); break;
      case 'ld': if (!valid) return; dispatch({ type: 'ADD_LD', contractId: id, valueUSD: num, appliedOn: date }); toast(t('contracts.toastLd', { code: c.code })); break;
      case 'guar': if (!valid) return; dispatch({ type: 'ADD_GUARANTEE', contractId: id, kind: 'performance', valueUSD: num, expiresOn: date }); toast(t('contracts.toastGuar', { code: c.code })); break;
      case 'susp': if (!valid) return; dispatch({ type: 'ADD_SUSPENSION', contractId: id, days: num, on: date }); toast(t('contracts.toastSusp', { code: c.code })); break;
      case 'renew': if (!valid) return; dispatch({ type: 'RENEW_CONTRACT', contractId: id, years: num, on: date }); toast(t('contracts.toastRenew', { code: c.code })); break;
      case 'stage': dispatch({ type: 'ADVANCE_CONTRACT_STAGE', contractId: id, actualTo: today }); toast(t('contracts.toastStage', { code: c.code })); break;
    }
    close();
  };

  const amountLabel = drawer === 'renew' ? t('contracts.years') : isDaysKind ? t('contracts.days') : t('contracts.amountUSD');
  const amountMin = drawer === 'renew' ? 0.25 : isDaysKind ? 1 : 0.01;
  const dateLabel = drawer === 'ld' ? t('contracts.appliedOn') : drawer === 'guar' ? t('contracts.expiresOn') : t('contracts.approvedOn');

  /**
   * What the completion bar would read the instant this stage closes — the same
   * `contractProgress` arithmetic with one more stage counted, never a guess.
   */
  const afterPct = prog.total ? Math.round(((prog.done + 1) / prog.total) * 100) : 0;

  const varianceText = variance === 0 ? t('contracts.onTrack') : variance > 0 ? `+${variance}%` : `${variance}%`;
  const kpis: { l: string; v: string; tone?: 'ok' | 'late' }[] = [
    { l: t('contracts.value'), v: fmtMoney(c.valueUSD) },
    { l: t('contracts.term'), v: `${fmtCount(c.termDays, lang)} ${t('contracts.daysUnit')}` },
    { l: t('contracts.deliveryPlanned'), v: delivery },
    { l: t('contracts.variance'), v: varianceText, tone: variance < 0 ? 'late' : 'ok' },
  ];

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/admin/contracts"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{t('contracts.back')}</a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span className="op-code" style={{ fontSize: 13 }}>{c.code}</span>
            <span dir="auto" style={{ fontSize: 24, fontWeight: 700 }}>{c.title[lang]}</span>
          </div>
          <div className="file-head__tags" style={{ marginTop: 8 }}>
            {/* contractor → its Vendor file when linked; an inert, explained pill otherwise */}
            {c.vendorId ? (
              <a className="m-pill m-pill--planned ad-pill-link" href={`#/admin/entities/${c.vendorId}`}>
                <Icon name="building" size={12} /> {c.contractorName}
              </a>
            ) : (
              <span className="m-pill m-pill--planned" title={t('contracts.vendorUnlinked')}>
                <Icon name="building" size={12} /> {c.contractorName}
              </span>
            )}
            {/* origin tender lineage — a real link, only when the tender is resolvable */}
            {fromTender && (
              <a className="ad-fromtender" href={`#/admin/review/${fromTender.id}`}>
                <Icon name="layers" size={12} /> {t('contracts.fromTender', { code: fromTender.code })}
              </a>
            )}
            <StatusPill status={CAP_PILL[health]}>{t(`contracts.cap_${health}`)}</StatusPill>
            {stageKey ? <StatusPill status="progress">{stageLabel(stageKey, lang)}</StatusPill> : <StatusPill status="done">{t('contracts.delivered')}</StatusPill>}
            {c.renewalYears ? <StatusPill status="planned">{t('contracts.renewedBadge', { y: c.renewalYears })}</StatusPill> : null}
            <span className="file-meta">{t('contracts.signedOn')} <span className="op-code">{c.signedOn}</span></span>
          </div>
        </div>
        {/* Action row ordered by frequency (principle م6): the three recurring §18–21 cap events stay
            visible; the exceptional one-offs (guarantee / suspension / renewal) fold into an
            overflow menu; advance-stage remains the single primary. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="op-btn-ghost" onClick={() => open('vo')}>+ {t('contracts.addVo')}</button>
          <button className="op-btn-ghost" onClick={() => open('ext')}>+ {t('contracts.addExt')}</button>
          <button className="op-btn-ghost" onClick={() => open('ld')}>+ {t('contracts.addLd')}</button>
          <div className="ctr-actions" ref={menuRef}>
            <button
              ref={menuBtnRef}
              className="op-btn-ghost"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {t('contracts.moreActions')}
            </button>
            {menuOpen && (
              <div className="ctr-menu" role="menu">
                <button className="ctr-menuitem" role="menuitem" onClick={() => { setMenuOpen(false); open('guar'); }}>+ {t('contracts.addGuar')}</button>
                {/* suspension & renewal are CLIENT_ONLY — no server endpoint yet (store CLIENT_ONLY) */}
                <button className="ctr-menuitem" role="menuitem" onClick={() => { setMenuOpen(false); open('susp'); }}>
                  + {t('contracts.addSusp')}
                  {isApiMode && <DevBadge label={t('dev.local')} title={t('contracts.clientOnlyTitle')} />}
                </button>
                <button className="ctr-menuitem" role="menuitem" onClick={() => { setMenuOpen(false); open('renew'); }}>
                  + {t('contracts.addRenew')}
                  {isApiMode && <DevBadge label={t('dev.local')} title={t('contracts.clientOnlyTitle')} />}
                </button>
              </div>
            )}
          </div>
          {stageKey && (
            <button className="op-btn-primary" onClick={() => open('stage')}>
              <Icon name="check" size={14} />{t('contracts.advanceStage')}
              {/* advance-stage is CLIENT_ONLY too — flag it honestly in API mode, never hide it */}
              {isApiMode && <DevBadge label={t('dev.local')} title={t('contracts.clientOnlyTitle')} />}
            </button>
          )}
        </div>
      </div>

      <div className="ad-kpis" style={{ marginTop: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row">
              <span className="ad-kpi__v" style={{ fontSize: 20, color: k.tone === 'late' ? 'var(--status-delayed)' : k.tone === 'ok' ? 'var(--status-done)' : undefined }}>{k.v}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="ad-cols" style={{ gridTemplateColumns: '1.55fr 1fr' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Schedule & progress */}
          <div className="ad-panel">
            <div className="ad-panel__head"><div><div className="ad-panel__t">{t('contracts.schedule')}</div><div className="ad-panel__s">{t('contracts.scheduleSub')}</div></div></div>
            <div style={{ padding: '14px 20px' }}>
              <div className="ctr-sched-dates">
                <div><span className="ctr-sched__l">{t('contracts.signedOn')}</span><span className="op-code">{c.signedOn}</span></div>
                <div><span className="ctr-sched__l">{t('contracts.deliveryPlanned')}</span><span className="op-code">{delivery}</span></div>
                <div><span className="ctr-sched__l">{t('contracts.deliveryActual')}</span>{delivered ? <span className="op-code">{delivered}</span> : <span className="ctr-sched__pending">{t('contracts.inProgress')}</span>}</div>
              </div>
              <div className="ctr-bar">
                <span className="ctr-bar__l">{t('contracts.plannedProgress')}</span>
                <span className="ctr-bar__track"><span className="ctr-bar__fill" style={{ width: `${plannedPct}%`, background: 'var(--chart-neutral)' }} /></span>
                <span className="ctr-bar__v">{plannedPct}%</span>
              </div>
              <div className="ctr-bar">
                <span className="ctr-bar__l">{t('contracts.actualProgress')}</span>
                <span className="ctr-bar__track"><span className="ctr-bar__fill" style={{ width: `${prog.pct}%`, background: variance < 0 ? 'var(--status-delayed)' : 'var(--status-done)' }} /></span>
                <span className="ctr-bar__v">{prog.pct}%</span>
              </div>
              {/* Client request 12 — «من أين تأتي النسبة وكيف أتحكّم بها». The arithmetic is stated
                  in one line under the bar it produces, with the live denominator read off the
                  contract's own stage list, so the reader never has to infer why a number moved. */}
              <div className="ctr-formula">
                {t('contracts.progFormula', { done: fmtCount(prog.done, lang), total: fmtCount(prog.total, lang), pct: fmtCount(prog.pct, lang) })}
              </div>
              <div className="ctr-variance" style={{ color: variance < 0 ? 'var(--status-delayed)' : 'var(--status-done)' }}>
                {variance === 0 ? t('contracts.onTrack') : variance > 0 ? t('contracts.ahead', { n: variance }) : t('contracts.behind', { n: Math.abs(variance) })}
              </div>
            </div>
          </div>

          {/* Lifecycle stages */}
          <div className="ad-panel">
            <div className="ad-panel__head">
              <div><div className="ad-panel__t">{t('contracts.stages')}</div><div className="ad-panel__s">{t('contracts.stagesSub')}</div></div>
              <span className="ad-panel__count">{fmtCount(prog.done, lang)}/{fmtCount(prog.total, lang)}</span>
            </div>
            <div style={{ padding: '6px 20px 14px' }}>
              {c.stages.map((s, i) => {
                const done = !!s.actualTo;
                const isCurrent = i === curIdx;
                const late = !!(s.actualTo && s.plannedTo && s.actualTo > s.plannedTo);
                return (
                  <div key={s.key} className="ctr-stage">
                    <span className={`ctr-stage__dot ctr-stage__dot--${done ? 'done' : isCurrent ? 'now' : 'todo'}`}>{done ? '✓' : i + 1}</span>
                    <div className="ctr-stage__body">
                      <div className="ctr-stage__t">{stageLabel(s.key, lang)}</div>
                      <div className="ctr-stage__d">
                        {done
                          ? <>{t('contracts.doneOn')} <span className="op-code">{s.actualTo}</span></>
                          : s.plannedTo
                            ? <>{t('contracts.plannedFor')} <span className="op-code">{s.plannedTo}</span></>
                            : '—'}
                        {done && s.plannedTo && s.actualTo && (() => {
                          const dev = stageDeviationDays(s.plannedTo, s.actualTo);
                          return dev !== 0 ? <span className={`ctr-dev ${dev > 0 ? 'ctr-dev--late' : 'ctr-dev--early'}`}>{dev > 0 ? `+${dev}` : dev}d</span> : null;
                        })()}
                      </div>
                    </div>
                    {done
                      ? <StatusPill status={late ? 'delayed' : 'done'}>{late ? t('contracts.stLate') : t('contracts.stDone')}</StatusPill>
                      : isCurrent
                        ? <StatusPill status="progress">{t('contracts.stNow')}</StatusPill>
                        : <StatusPill status="planned">{t('contracts.stTodo')}</StatusPill>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cap meters (§18–21) */}
          <div className="ad-panel">
            <div className="ad-panel__head"><div><div className="ad-panel__t">{t('contracts.caps')}</div><div className="ad-panel__s">{t('contracts.capsSub')}</div></div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, padding: '16px 20px' }}>
              <CapMeter result={vo} lang={lang} label={t('contracts.vo')} />
              <CapMeter result={ext} lang={lang} label={t('contracts.extension')} valueText={`${c.extensionDays}d / ${ext.usedPct.toFixed(1)}%`} />
              <CapMeter result={susp} lang={lang} label={t('contracts.suspension')} valueText={`${c.suspensionDays}d / ${susp.usedPct.toFixed(1)}%`} />
              <CapMeter result={ld} lang={lang} label={t('contracts.ld')} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Guarantees */}
          <div className="ad-panel">
            <div className="ad-panel__head"><div className="ad-panel__t">{t('contracts.guaranteesTitle')}</div></div>
            {c.guarantees.length === 0 ? (
              <div className="ad-empty-inline">{t('contracts.noGuarantees')}</div>
            ) : (
              <table className="op-tbl">
                <thead><tr><th>{t('contracts.guarantee')}</th><th className="op-end">{t('operator.value')}</th><th>{t('contracts.expiry')}</th></tr></thead>
                <tbody>
                  {c.guarantees.map((g, gi) => {
                    const check = g.kind === 'performance' ? performanceBondValid(g.valueUSD, c.valueUSD) : { ok: true, pct: 0 };
                    const soon = guaranteeExpiringSoon(g.expiresOn, today);
                    return (
                      <tr key={`${g.kind}-${g.expiresOn}-${gi}`}>
                        <td>
                          {t(`contracts.kind.${g.kind}`)}
                          {g.kind === 'performance' && <div className="op-tbl__code" style={{ color: check.ok ? 'var(--status-done)' : 'var(--status-delayed)' }}>{check.ok ? t('contracts.ok') : t('contracts.below')} {check.pct}%</div>}
                        </td>
                        <td className="op-end mono">{fmtMoney(g.valueUSD)}</td>
                        <td><span className="op-code">{g.expiresOn}</span>{soon && <div><StatusPill size="sm" status="risk">{t('contracts.expiringSoon')}</StatusPill></div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Event trail */}
          <div className="ad-panel">
            <div className="ad-panel__head"><div><div className="ad-panel__t">{t('contracts.events')}</div><div className="ad-panel__s">{t('contracts.eventsSub')}</div></div></div>
            {events.length === 0 ? (
              <div className="ad-empty-inline">{t('contracts.noEvents')}</div>
            ) : (
              events.map((e, i) => (
                <div key={i} className="ad-late">
                  <div className="ad-late__body">
                    <div className="ad-late__t">{t(`contracts.ev_${e.kind}`)}{e.kind === 'stage' ? ` — ${stageLabel(e.detail as never, lang)}` : ` — ${e.detail}`}</div>
                  </div>
                  <span className="op-code" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{e.on}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ---- governance drawers ---- */}
      {(drawer === 'vo' || drawer === 'ext' || drawer === 'ld' || drawer === 'susp' || drawer === 'renew' || drawer === 'guar') && (
        <Modal
          title={t(`contracts.${TITLE_KEY[drawer]}`)}
          sub={`${c.code} — ${c.title[lang]}`}
          onClose={close}
          footer={<><button className="op-btn-ghost" onClick={close}>{t('contracts.cancel')}</button><span style={{ flex: 1 }} /><button className="op-btn-primary" disabled={!valid} onClick={confirm}>{t('contracts.confirm')}</button></>}
        >
          {drawer === 'guar' && (
            <div className="wz-field" style={{ marginBottom: 12 }}>
              <label className="wz-field__l">{t('contracts.gkind')}</label>
              <div className="wz-in" style={{ background: 'var(--bg-page)', color: 'var(--text-2)' }}>{t('contracts.kind.performance')}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="wz-field" style={{ flex: 1 }}>
              <label className="wz-field__l">{amountLabel}</label>
              <input className="wz-in wz-in--mono" type="number" min={amountMin} max={drawer === 'renew' ? 1 : undefined} step={amountMin} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="wz-field" style={{ flex: 1 }}>
              <label className="wz-field__l">{dateLabel}</label>
              {/* native date widget: value stored as Latin ISO; display digits follow browser locale (documented Track-0 exclusion) */}
              <input className="wz-in wz-in--mono" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {preview && (
            <div style={{ marginTop: 14 }}>
              <div className="wz-field__l" style={{ marginBottom: 6 }}>{t('contracts.projected')}</div>
              <CapMeter result={preview} lang={lang} label={t(`contracts.${TITLE_KEY[drawer]}`)} valueText={drawer === 'ext' ? `${c.extensionDays + num}d / ${preview.usedPct.toFixed(1)}%` : drawer === 'susp' ? `${c.suspensionDays + num}d / ${preview.usedPct.toFixed(1)}%` : undefined} />
            </div>
          )}
          <div className="wz-gate" style={{ marginTop: 12 }}>
            {preview && preview.status === 'breach'
              ? t('contracts.willBreach', { clause: preview.clause })
              : drawer === 'renew' && num > 0 && !renewalAllowed(num).ok
                ? t('contracts.renewMax')
                : drawer === 'guar' && num > 0 && !perfOk
                  ? t('contracts.perfMin')
                  : t('contracts.capNote')}
          </div>
        </Modal>
      )}

      {drawer === 'stage' && stageKey && (
        <Modal
          title={t('contracts.advanceStage')}
          sub={`${c.code} — ${c.title[lang]}`}
          onClose={close}
          footer={<><button className="op-btn-ghost" onClick={close}>{t('contracts.cancel')}</button><span style={{ flex: 1 }} /><button className="op-btn-primary" onClick={confirm}>{t('contracts.confirm')}</button></>}
        >
          <p className="hint" style={{ marginTop: 0 }}>{t('contracts.advanceConfirm', { stage: stageLabel(stageKey, lang) })}</p>
          {/* Design Principle 2 — the confirmation previews the AFTER-STATE. Closing a stage is
              the only act that moves the completion percentage, and this is where the reader is
              told by exactly how much, before committing. Both figures are derived from the same
              `contractProgress` arithmetic the bar above uses; nothing is estimated. */}
          <div className="ctr-prev">
            <span className="ctr-prev__v">{fmtCount(prog.pct, lang)}%</span>
            <span className="ctr-prev__arrow"><Icon name="chevronStart" size={14} strokeWidth={2} className="op-chev-fwd" /></span>
            <span className="ctr-prev__v ctr-prev__v--after">{fmtCount(afterPct, lang)}%</span>
            <span className="ctr-prev__l">{t('contracts.advancePreview', { done: fmtCount(prog.done + 1, lang), total: fmtCount(prog.total, lang) })}</span>
          </div>
          <div className="wz-gate" style={{ marginTop: 8 }}>{t('contracts.advanceNote')} <span className="op-code">{today}</span></div>
        </Modal>
      )}
    </div>
  );
}
