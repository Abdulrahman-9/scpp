import { awardVerdict, isPriceVisible, lowestQualified } from '@masaar/scpp-rules';
import { VerdictStrip } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { currentStage, evalStepName, requiredDocsFor, todayIso, useStore } from '../../store';
import { ToastViewport, useToasts } from '../../Toasts';
import BidderAddDialog, { BIDDER_GATE_KEY, canAddBidders } from '../BidderAddDialog';
import { fmtCount, fmtMoney } from '../derive';
import { DevBadge } from '../DevBadge';
import { Icon } from '../Icon';
import WizardShell, { type WizardStep } from './WizardShell';

const FAIL_REASONS = ['bondMissing', 'nonCompliant', 'docsMissing', 'lateBid'];

export default function EvaluateWizard({ tenderId }: { tenderId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useToasts();
  const tender = state.tenders.find((x) => x.id === tenderId);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [minutes, setMinutes] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (!tender) return <div className="op-empty">{t('file.notFound')}</div>;

  const gate = canAddBidders(tender);
  const gateNote = gate.reason ? t(BIDDER_GATE_KEY[gate.reason]) : '';

  const step = evalStepName(tender.evaluationStep);
  const opened = tender.evaluationStep >= 2; // commercial step reached
  const allClassified = tender.bidders.every((b) => b.technicalResult);
  const passCount = tender.bidders.filter((b) => b.technicalResult === 'pass').length;
  const failsNeedReason = tender.bidders.filter((b) => b.technicalResult === 'fail' && !reasons[b.id]);
  const lowest = lowestQualified(tender.bidders);
  const lowestBidder = lowest ? tender.bidders.find((b) => b.id === lowest.id) : undefined;
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, tender.estimatedValueUSD) : null;
  const within = verdict ? verdict.deltaPct <= 20 : false;
  const cur = currentStage(tender);
  // The stage this wizard closes cannot be closed without its documents (8.1). The wizard NEVER
  // marks them itself — each one is marked received explicitly below, exactly as in the Documents
  // tab, so no «document received» row is ever written on the operator's behalf.
  const reqDocs = cur ? requiredDocsFor(cur.key) : [];
  const missingDocs = cur ? reqDocs.filter((d) => !cur.uploadedDocs.includes(d)) : [];
  const docsOk = !!cur && missingDocs.length === 0;

  const markReceived = (doc: string, name: string) => {
    // قناة الصدق: the success toast fires only after the store confirms the commit.
    void dispatch({ type: 'TOGGLE_DOC', tenderId, stageKey: cur!.key, doc }).then((r) => {
      if (r.ok) toast(t('filedocs.received', { doc: name }), { kind: 'success' });
    });
  };

  const steps: WizardStep[] = [
    {
      label: t('wizev.s0'), title: t('wizev.s0'), sub: t('wizev.sub0'),
      help: { t: t('wizev.help0'), r: 'SCPP 12.4 · 10.6.1' },
      conditions: [
        { t: t('wizev.cClassified'), ok: allClassified },
        { t: t('wizev.cReasons'), ok: allClassified && failsNeedReason.length === 0 },
        { t: t('wizev.cOnePass'), ok: passCount >= 1 },
      ],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="file-bidders-head">
            <div className="file-bidders-head__l">
              <div className="file-bidders-head__title">{t('wizev.slateTitle')}</div>
              <div className="file-bidders-head__sub">{t('filebidders.count', { n: fmtCount(tender.bidders.length, lang) })}</div>
            </div>
            <div className="file-bidders-head__act">
              <button className="op-btn-ghost" onClick={() => setAddOpen(true)} disabled={!gate.ok} title={gate.ok ? undefined : gateNote}>
                <Icon name="plus" size={15} />
                {t('filebidders.addBidder')}
              </button>
            </div>
          </div>
          {!gate.ok && <span className="wz-gate">{gateNote}</span>}
          {tender.bidders.length === 0 && <div className="op-empty">{gate.ok ? t('wizev.noBidders') : gateNote}</div>}
          {tender.bidders.map((b) => {
            const st = b.technicalResult;
            // A classified row wears the SAME status pair its verdict button wears, so the tint and
            // the button can never drift apart. The v1 tints mixed by hand here were light-theme
            // literals: rgba(248,222,219,.35) on the dark card left the subline at 2.413 and
            // rgba(178,53,53,.4) left the edge at 1.305. Tokens make the row follow the theme.
            const tone = st === 'fail' ? 'delayed' : st === 'pass' ? 'done' : null;
            return (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '13px 16px', borderRadius: 11, border: `1px solid ${tone ? `var(--status-${tone}-bd)` : 'var(--border-1)'}`, background: tone ? `var(--status-${tone}-bg)` : 'var(--bg-card)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }} dir="auto">{b.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    <span>{t('bids.docs')}: {b.docsOk ? t('filebidders.docsOk') : t('filebidders.docsNo')}</span>
                    <span className="op-task__mdot" />
                    <span>{t('filebidders.colBond')}: {b.bondOk ? t('filebidders.bondOk') : t('filebidders.bondNo')}</span>
                  </div>
                </div>
                <span className="file-locked"><Icon name="lock" size={13} />{t('wizev.priceLocked')} <span className="op-code" style={{ fontSize: 10 }}>12.4.2</span></span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={st === 'pass' ? 'op-btn-primary' : 'op-btn-ghost'} style={st === 'pass' ? { background: 'var(--status-done)' } : undefined} onClick={() => dispatch({ type: 'SET_TECHNICAL', tenderId, bidderId: b.id, result: 'pass' })}>{t('bids.pass')}</button>
                  <button className={st === 'fail' ? 'op-btn-primary' : 'op-btn-ghost'} style={st === 'fail' ? { background: 'var(--status-delayed)' } : undefined} onClick={() => dispatch({ type: 'SET_TECHNICAL', tenderId, bidderId: b.id, result: 'fail' })}>{t('bids.fail')}</button>
                </div>
                {st === 'fail' && (
                  <select className="wz-in" style={{ width: '100%', height: 34, fontSize: 12.5 }} value={reasons[b.id] ?? ''} onChange={(e) => setReasons((r) => ({ ...r, [b.id]: e.target.value }))}>
                    <option value="">{t('wizev.reasonPh')}</option>
                    {FAIL_REASONS.map((fr) => <option key={fr} value={fr}>{t(`wizev.reason_${fr}`)}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ),
    },
    {
      label: t('wizev.s1'), title: t('wizev.s1'), sub: t('wizev.sub1'),
      help: { t: t('wizev.help1'), r: 'SCPP 12.4.2' },
      conditions: [{ t: t('wizev.cOpened'), ok: opened }],
      content: !opened ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '28px 20px', border: '1px dashed var(--border-2)', borderRadius: 12, background: 'var(--bg-page)' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--btn-secondary-bg)', color: 'var(--link)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="lock" size={24} /></span>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{t('wizev.gateTitle')}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-2)', maxWidth: 480, textAlign: 'center' }}>{t('wizev.gateDesc', { n: passCount })}</div>
          <button className="op-btn-primary" onClick={() => dispatch({ type: 'SET_EVAL_STEP', tenderId, step: 3 })}><Icon name="lock" size={15} />{t('wizev.openBtn')}</button>
        </div>
      ) : (
        <div>
          <div className="wz-note wz-note--ok"><Icon name="check" size={15} strokeWidth={2} /><span>{t('wizev.openedNote')}</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
            {tender.bidders.map((b) => {
              const visible = isPriceVisible(step, b);
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: '1px solid var(--border-1)', borderRadius: 9, background: 'var(--bg-card)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: b.technicalResult === 'pass' ? 'var(--status-done)' : 'var(--status-delayed)' }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }} dir="auto">{b.name}</span>
                  {visible ? (
                    <input className="wz-in wz-in--mono" style={{ width: 150, height: 34, fontSize: 13 }} inputMode="numeric" value={b.priceUSD != null ? String(b.priceUSD) : ''} placeholder="0" onChange={(e) => dispatch({ type: 'SET_PRICE', tenderId, bidderId: b.id, priceUSD: Number(e.target.value.replace(/[^0-9]/g, '')) || 0 })} />
                  ) : (
                    <span className="file-locked"><Icon name="lock" size={13} />{t('wizev.excludedLocked')}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ),
    },
    {
      label: t('wizev.s2'), title: t('wizev.s2'), sub: t('wizev.sub2'),
      help: { t: t('wizev.help2'), r: 'SCPP 6.6 · 6.9.3' },
      conditions: [{ t: t('wizev.cWithin'), ok: within }],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="wz-side-box" style={{ background: 'var(--bg-card)' }}>
            <div className="wz-kv"><span>{t('wizev.accCost')}</span><b>{fmtMoney(tender.estimatedValueUSD)}</b></div>
            <div className="wz-kv"><span>{t('wizev.lowest')}</span><b>{lowest?.priceUSD != null ? fmtMoney(lowest.priceUSD) : '—'}</b></div>
          </div>
          {verdict ? <VerdictStrip verdict={verdict} lang={lang} /> : <div className="wz-note wz-note--warn"><Icon name="clock" size={15} /><span>{t('wizev.noPrices')}</span></div>}
        </div>
      ),
    },
    {
      label: t('wizev.s3'), title: t('wizev.s3'), sub: t('wizev.sub3'),
      help: { t: t('wizev.help3'), r: 'SCPP 12.2.2' },
      conditions: [
        { t: t('wizev.cMinutes'), ok: minutes },
        { t: t('wizev.cDocs', { n: `${reqDocs.length - missingDocs.length}/${reqDocs.length}` }), ok: docsOk },
      ],
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lowest && verdict && (
            <div style={{ border: '2px solid var(--status-done)', background: 'var(--status-done-bg)', borderRadius: 12, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {/* the ink on a saturated fill inverts with the theme: white on #147739 is 5.634,
                  while white on the dark fill #4ADE80 is 1.743 — the mark simply vanished. */}
              <span style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--status-done)', color: 'var(--status-on-fill)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="check" size={18} strokeWidth={2} /></span>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12, color: 'var(--status-done)', fontWeight: 600 }}>{t('wizev.recTitle')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }} dir="auto">{lowestBidder?.name ?? ''} — <span className="op-code">{fmtMoney(lowest.priceUSD!)}</span></div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 3 }}>{t('wizev.recDelta', { pct: Math.abs(verdict.deltaPct).toFixed(1) })} <span className="op-code" style={{ fontSize: 10.5 }}>6.9.3</span></div>
              </div>
            </div>
          )}
          <button className={`wz-check${minutes ? ' wz-check--on' : ''}`} style={{ width: '100%', alignSelf: 'stretch' }} onClick={() => setMinutes(!minutes)}>
            <span className="wz-check__m">✓</span>
            <span style={{ flex: 1, textAlign: 'start' }}>{t('wizev.minutesLabel')}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{minutes ? t('wizev.uploaded') : t('wizev.clickUpload')}</span>
          </button>

          <div className="wz-field">
            <label className="wz-field__l">{t('wizev.docsTitle')}</label>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8, marginBlockEnd: 8 }}>{t('wizev.docsNote')}</div>
            {!cur ? (
              <div className="wz-note wz-note--warn"><Icon name="alert" size={15} /><span>{t('wizev.noStage')}</span></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {reqDocs.map((d) => {
                  const up = cur.uploadedDocs.includes(d);
                  const name = t(`docs.${d}`);
                  return (
                    <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: '1px solid var(--border-1)', borderRadius: 10, background: 'var(--bg-card)' }}>
                      <Icon name="doc" size={16} />
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{name}</span>
                      <span className="op-task__due" style={{ background: up ? 'var(--status-done-bg)' : 'var(--status-delayed-bg)', color: up ? 'var(--status-done)' : 'var(--status-delayed)' }}>
                        {up ? t('filedocs.stDone') : t('wizco.docMissing')}
                      </span>
                      {!up && (
                        <>
                          <button className="op-btn-primary" onClick={() => markReceived(d, name)}>
                            <Icon name="check" size={12} />
                            {t('filedocs.markReceived')}
                          </button>
                          <DevBadge title={t('filedocs.simTitle')} />
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {!docsOk && <span className="wz-gate">{t('wizev.docsGate')}</span>}

          <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.8 }}>{t('wizev.recNote')}</div>
        </div>
      ),
    },
  ];

  return (
    <>
      <WizardShell
        title={t('wizev.title')}
        tenderName={tender.title[lang]}
        code={tender.code}
        steps={steps}
        finalLabel={t('wizev.final')}
        doneHash={`#/operator/t/${tenderId}`}
        exitHash={`#/operator/t/${tenderId}`}
        success={{ title: t('wizev.doneTitle'), desc: t('wizev.doneDesc'), audit: `${tender.code} · RECOMMENDATION SENT` }}
        onFinish={() => {
          // The finish step is gated on every required document already being marked received, so
          // this closes the stage honestly — it never fabricates the documents to get past the guard.
          if (docsOk && cur) void dispatch({ type: 'COMPLETE_STAGE', tenderId, stageKey: cur.key, actualTo: todayIso() });
        }}
      />
      {addOpen && <BidderAddDialog tender={tender} onClose={() => setAddOpen(false)} />}
      {/* wizards render outside OperatorShell, which owns the only other viewport */}
      <ToastViewport />
    </>
  );
}
