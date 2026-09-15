import { awardVerdict, bidderCounts, lowestQualified, mayRatifyTier, mctCycleStatus, stageByKey, stageDeviationDays } from '@masaar/scpp-rules';
import { PathBadge, StatusPill, VerdictStrip } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { Icon } from '../operator/Icon';
import { loadSession } from '../session';
import { accreditedEstimate, byName, byOid, calendarOf, currentStage, govReasonValid, resolveTiersFor, singleBidStatus, tenderApprovalTier, todayIso, useStore, type Actor, type Tender } from '../store';
import { roleKey } from './access';
import { useAdminUi } from './AdminShell';
import { Modal } from './Modal';
import { TierPill } from './TierPill';

type Gov = null | 'cancel' | 'suspend' | 'resume';
type Decide = null | 'ratify' | 'return';

/**
 * Admin tender review — the MDOC ratify / return-with-notes screen, rebuilt on the file-card
 * skin (op-page / file-head / ad-panel). Ratify and return each open a confirmation phrased
 * as the real-world event, previewing the audit record before it is written; the commit awaits
 * the server verdict (batch-2 outcome channel) and only toasts success on ok:true. Every act is
 * attributed to the immutable Actor (oid), never to a mutable display name.
 */
export default function TenderReview({ id }: { id: string }) {
  const { t: tr, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const [notes, setNotes] = useState('');
  const [gov, setGov] = useState<Gov>(null);
  const [govReason, setGovReason] = useState('');
  const [decide, setDecide] = useState<Decide>(null);
  const today = todayIso();
  const session = loadSession();
  /**
   * The immutable identity the audit record is bound to (oid), taken from the live session — and
   * NOTHING when there is no live session.
   *
   * FAIL CLOSED (phase-5 fix). This used to read
   *   `{ oid: session?.oid ?? '—', name: session?.name ?? 'MDOC', role: session?.role ?? 'MDOC_ADMIN' }`
   * — an absent or unreadable session was handed the parent company's seat, the HIGHEST ratifying
   * body on the ق1 ladder, by default. That is the one direction a default may never point: a
   * reader with no standing at all saw an enabled «صادق» and a ledger preview attributing the act
   * to «MDOC». `loadSession` already returns null for a blob whose role names nothing
   * (`normalizeRole` fails closed), and `ratifyingRank` scores an unknown name -1 rather than
   * trusting it — this screen now agrees with both instead of overriding them.
   *
   * `Actor | null` rather than a harmless-looking placeholder role: a decision, a cancellation or
   * a suspension that cannot be attributed to a real identity is not a record (8.1-e), so the
   * absence is modelled instead of papered over. Every control that dispatches is gated on it.
   */
  const actor: Actor | null = session ? { oid: session.oid, name: session.name, role: session.role } : null;

  const tender: Tender | undefined = state.tenders.find((x) => x.id === id);
  if (!tender) {
    return (
      <div className="op-page op-page--file">
        <a className="file-back" href="#/admin/tenders"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{tr('review.backTenders')}</a>
        <div className="op-empty">—</div>
      </div>
    );
  }

  const cur = currentStage(tender);
  const atRatify = cur?.key === 'ratify';
  const decided = tender.ratification;
  // §15.3 — a lone bid advertised under 21 days may not be awarded; the reducer refuses RATIFY and
  // the server audits it, so the button is blocked here with the remedy (re-advertise) shown.
  const sb = singleBidStatus(tender);
  const blocked15_3 = sb.single && !sb.ok;

  // accredited estimate: if above-FA use the prevailing MCT estimate, else the tender estimate
  let accredited = tender.estimatedValueUSD;
  if (tender.mct) {
    const s = mctCycleStatus({
      notifiedOn: tender.mct.notifiedOn,
      meetingHeldOn: tender.mct.meetingHeldOn,
      agreementReachedOn: tender.mct.agreementReachedOn,
      asOf: today,
      calendar: calendarOf(state),
    });
    accredited = accreditedEstimate(tender.mct, s.prevailingEstimate);
  }
  const lowest = lowestQualified(tender.bidders);
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, accredited) : null;
  const counts = bidderCounts(tender.bidders);

  const life = tender.lifecycle;
  const isRatified = tender.ratification?.status === 'ratified';
  // the contract this ratified award produced, if one is linked back to this tender
  const producedContract = isRatified ? state.contracts.find((c) => c.tenderId === tender.id) : undefined;
  const govReasonOk = govReasonValid(govReason);
  const notesOk = notes.trim().length >= 1; // mirrors the reducer guard + server ReturnDto @Length(1, …)

  const openGov = (k: Exclude<Gov, null>) => { setGovReason(''); setGov(k); };
  const closeGov = () => setGov(null);
  // cancel/suspend/resume — await the server verdict, then toast success only on ok:true
  // (the shell's registered fail handler surfaces refusals; we never double-toast).
  const confirmGov = async () => {
    if (!gov || !actor) return; // no identity → no governance act to attribute
    const reason = govReason.trim();
    const res = await (gov === 'cancel'
      ? dispatch({ type: 'CANCEL_TENDER', tenderId: tender.id, reason, by: actor })
      : gov === 'suspend'
        ? dispatch({ type: 'SUSPEND_TENDER', tenderId: tender.id, reason, by: actor })
        : dispatch({ type: 'RESUME_TENDER', tenderId: tender.id, reason, by: actor }));
    if (res.ok) toast(tr(`review.toast_${gov}`, { code: tender.code }), { kind: 'success' });
    closeGov();
  };

  const openRatify = () => setDecide('ratify');
  const openReturn = () => { setNotes(''); setDecide('return'); };
  const closeDecide = () => setDecide(null);

  const commitRatify = async () => {
    if (!actor || !mayDecide) return; // the same two gates the button is disabled on
    const res = await dispatch({ type: 'RATIFY', tenderId: tender.id, by: actor });
    if (res.ok) {
      toast(tr('review.toastRatified', { code: tender.code, name: actor.name }), {
        kind: 'success',
        desc: tr('review.ratifiedDesc', { accredited: fmtMoney(accredited), lowest: lowest?.priceUSD != null ? fmtMoney(lowest.priceUSD) : '—' }),
      });
    }
    closeDecide();
  };

  const commitReturn = async () => {
    if (!notesOk || !actor || !mayDecide) return;
    const res = await dispatch({ type: 'RETURN_WITH_NOTES', tenderId: tender.id, by: actor, notes: notes.trim() });
    if (res.ok) toast(tr('review.toastReturned', { code: tender.code, name: actor.name }), { kind: 'success', desc: tr('review.returnedDesc') });
    closeDecide();
  };

  // «القيد الذي سيُكتب» — the record the commit will write: who (name + immutable oid), when,
  // and the award facts already shown on the page (no invented numbers).
  const ledger = (
    <div className="rv-ledger">
      <div className="rv-ledger__cap">{tr('review.ledgerCap')}</div>
      <div className="wz-reviewrow">
        <span>{tr('review.byActor')}</span>
        {/* no session → no identity to preview; the dash is the truth, not a placeholder name */}
        <span>{actor ? <>{actor.name} · <span className="op-code">{actor.oid}</span></> : '—'}</span>
      </div>
      <div className="wz-reviewrow"><span>{tr('review.onDate')}</span><span className="op-code">{today}</span></div>
      <div className="wz-reviewrow"><span>{tr('mct.accredited')}</span><span className="op-code">{fmtMoney(accredited)}</span></div>
      <div className="wz-reviewrow"><span>{tr('review.lowest')}</span><span className="op-code">{lowest?.priceUSD != null ? fmtMoney(lowest.priceUSD) : '—'}</span></div>
      {verdict && (
        <div className="wz-reviewrow"><span>{tr('review.verdictLabel')}</span><span className="op-code">{`${verdict.deltaPct >= 0 ? '+' : '−'}${Math.abs(verdict.deltaPct).toFixed(1)}% · ${verdict.clause}`}</span></div>
      )}
    </div>
  );

  /**
   * Which body clears THIS tender (ق1). Named at the gate itself, because that is where the
   * question is actually asked: an admin about to press «صادق» must see whether the signature
   * is the operating company's own, the joint committee's, or the parent company's — and for
   * ط1 the body is the operating company by name, not an abstraction.
   */
  const tier = tenderApprovalTier(state, tender);
  const ownerOrg = state.operators.find((o) => o.id === tender.operatorId);
  const decisionBody = tier === 'OPERATOR' && ownerOrg
    ? (lang === 'ar' ? ownerOrg.name : ownerOrg.nameEn ?? ownerOrg.name)
    : tr(`tier.body.${tier}`);
  const tierLine = (
    <div className="rv-tier">
      {/* د9 — this describes ONE tender, so the tooltip must state the bands of the ladder that
          tender was actually judged by: its operator's own if one is approved, else the default.
          Passing `state.approvalTiers` here printed a range the gate may not have used. */}
      <TierPill tier={tier} tiers={resolveTiersFor(state, tender.operatorId)} />
      <span className="rv-tier__s">{tr('tier.sentence', { tier: tr(`tier.name.${tier}`), body: decisionBody })}</span>
    </div>
  );

  /**
   * The AUTHORITY gate (client request 19ب): may THIS session's body sign THIS band? The same
   * `mayRatifyTier` the reducer and `TendersService.assertTierAuthority` ask, so the disabled
   * button and the server's 403 can never tell different stories. Named, never silent — the gate
   * says which body the band belongs to and which body the reader is (wz-gate law).
   */
  const mayDecide = actor != null && mayRatifyTier(actor.role, tier);
  /**
   * Two refusals, two sentences. A session that HOLDS a body but not this band is told which body
   * owns the band and which body it is; a reader with no session at all is told the truth about
   * itself instead of being named as a role it does not hold — the gate never invents a body to
   * put in the sentence.
   */
  const tierGateText = actor
    ? tr('review.tierGate', {
      tier: tr(`tier.name.${tier}`),
      body: tr(`tier.body.${tier}`),
      role: tr(`roles.names.${roleKey(actor.role)}`),
    })
    : tr('review.tierGateNoSession', { tier: tr(`tier.name.${tier}`), body: tr(`tier.body.${tier}`) });

  const kpis: { l: string; v: string }[] = [
    { l: tr('mct.accredited'), v: fmtMoney(accredited) },
    { l: tr('review.lowest'), v: lowest?.priceUSD != null ? fmtMoney(lowest.priceUSD) : '—' },
    { l: tr('bids.qualified'), v: `${fmtCount(counts.qualified, lang)} / ${fmtCount(counts.applied, lang)}` },
  ];

  return (
    <div className="op-page op-page--file">
      <a className="file-back" href="#/admin/tenders"><Icon name="chevronEnd" size={13} strokeWidth={2} className="op-chev-fwd" />{tr('review.backTenders')}</a>

      <div className="file-head">
        <div className="file-head__main">
          <div className="file-head__tags">
            <span className="op-code" style={{ fontSize: 13 }}>{tender.code}</span>
            <PathBadge id={tender.methodId} lang={lang} showClause />
          </div>
          <span dir="auto" style={{ fontSize: 24, fontWeight: 700 }}>{tender.title[lang]}</span>
          <div className="file-head__tags">
            {life && <StatusPill status={life.status === 'cancelled' ? 'blocked' : 'delayed'}>{tr(`review.life_${life.status}`)}</StatusPill>}
            {decided && <StatusPill status={decided.status === 'ratified' ? 'done' : 'delayed'}>{tr(`review.${decided.status}`)}</StatusPill>}
            {!life && !decided && (atRatify
              ? <StatusPill status="progress">{tr('review.decision')}</StatusPill>
              : <StatusPill status="planned">{tr('review.notReady')}</StatusPill>)}
            {/* forward lineage — the contract this ratified award produced (real link) */}
            {producedContract && (
              <a className="ad-fromtender" href={`#/admin/contracts/${producedContract.id}`}>
                <Icon name="doc" size={12} /> {tr('review.producedContract', { code: producedContract.code })}
              </a>
            )}
          </div>
        </div>
        {/* governance acts are attributed records too — held shut without an identity to bind them to */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {life?.status === 'suspended' && (
            <button className="op-btn-ghost" disabled={!actor} title={actor ? undefined : tr('review.noSessionGate')} onClick={() => openGov('resume')}>{tr('review.resumeTender')}</button>
          )}
          {!life && (
            <button className="op-btn-ghost" disabled={!actor} title={actor ? undefined : tr('review.noSessionGate')} onClick={() => openGov('suspend')}>{tr('review.suspendTender')}</button>
          )}
          {!life && !isRatified && (
            <button className="op-btn-danger" disabled={!actor} title={actor ? undefined : tr('review.noSessionGate')} onClick={() => openGov('cancel')}>{tr('review.cancelTender')}</button>
          )}
        </div>
      </div>

      {life && (
        <div className="ad-lifebanner">
          <StatusPill status={life.status === 'cancelled' ? 'blocked' : 'delayed'}>
            {tr(`review.life_${life.status}`)} — {byName(life.by)} · <span className="mono">{life.on}</span>
          </StatusPill>
          <p className="method-reason" style={{ marginTop: 8 }}>{tr('review.reason')}: {life.reason}</p>
        </div>
      )}

      <div className="ad-kpis" style={{ marginTop: 16 }}>
        {kpis.map((k) => (
          <div key={k.l} className="ad-kpi">
            <div className="ad-kpi__head"><span className="ad-kpi__l">{k.l}</span></div>
            <div className="ad-kpi__row"><span className="ad-kpi__v">{k.v}</span></div>
          </div>
        ))}
      </div>

      {verdict && (
        <div className="ad-panel" style={{ marginTop: 14 }}>
          <div className="ad-panel__head"><div><div className="ad-panel__t">{tr('review.award')}</div><div className="ad-panel__s">{tr('review.awardHint')}</div></div></div>
          <div style={{ padding: '14px 20px' }}><VerdictStrip verdict={verdict} lang={lang} /></div>
        </div>
      )}

      <div className="ad-panel" style={{ marginTop: 14 }}>
        <div className="ad-panel__head"><div><div className="ad-panel__t">{tr('review.stages')}</div></div></div>
        <table className="op-tbl">
          <thead>
            <tr>
              <th>{tr('plan.stage')}</th>
              <th>{tr('plan.to')}</th>
              <th>{tr('plan.actual')}</th>
              <th className="op-end">{tr('review.dev')}</th>
            </tr>
          </thead>
          <tbody>
            {tender.stages.map((s) => {
              const dev = s.actualTo && s.plannedTo ? stageDeviationDays(s.plannedTo, s.actualTo) : null;
              return (
                <tr key={s.key}>
                  <td>{stageByKey(s.key)?.[lang] ?? s.key}</td>
                  <td><span className="op-code">{s.plannedTo ?? '—'}</span></td>
                  <td><span className="op-code">{s.actualTo ?? '—'}</span></td>
                  <td className={`op-end op-code${dev != null && dev > 0 ? ' late-num' : ''}`}>
                    {dev == null ? '—' : dev > 0 ? `+${dev}` : dev}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="ad-panel" style={{ marginTop: 14 }}>
        <div className="ad-panel__head"><div><div className="ad-panel__t">{tr('review.decision')}</div></div></div>
        <div style={{ padding: '16px 20px' }}>
          {tierLine}
          {life ? (
            <StatusPill status={life.status === 'cancelled' ? 'blocked' : 'delayed'}>
              {tr(`review.life_${life.status}`)} — {byName(life.by)} · <span className="mono">{life.on}</span>
            </StatusPill>
          ) : decided ? (
            <div className="vendor-ban">
              <StatusPill status={decided.status === 'ratified' ? 'done' : 'delayed'}>
                {tr(`review.${decided.status}`)} — {byName(decided.by)}
                {byOid(decided.by) && <> · <span className="op-code">{byOid(decided.by)}</span></>}
                {' · '}<span className="mono">{decided.on}</span>
              </StatusPill>
              {decided.notes && <p className="method-reason">{tr('review.notes')}: {decided.notes}</p>}
            </div>
          ) : !atRatify ? (
            <StatusPill status="planned">
              {tr('review.notReady')}
              {cur && <> — {stageByKey(cur.key)?.[lang]}</>}
            </StatusPill>
          ) : (
            <>
              <p className="hint" style={{ marginTop: 0 }}>{tr('review.decisionHint')}</p>
              {!mayDecide && (
                <div className="wz-note wz-note--warn" style={{ marginBottom: 10 }}>
                  <Icon name="lock" size={15} />
                  <span>{tierGateText}</span>
                </div>
              )}
              {blocked15_3 && (
                <div className="wz-note wz-note--warn" style={{ marginBottom: 10 }}>
                  <Icon name="alert" size={15} />
                  <span>{tr('review.block15_3')} <span className="op-code" style={{ fontSize: 10 }}>15.3</span></span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="op-btn-primary" onClick={openRatify} disabled={blocked15_3 || !mayDecide} title={!mayDecide ? tierGateText : blocked15_3 ? tr('review.block15_3') : undefined}><Icon name="check" size={14} />{tr('review.ratify')}</button>
                <button className="op-btn-ghost" onClick={openReturn} disabled={!mayDecide} title={!mayDecide ? tierGateText : undefined}>{tr('review.return')}</button>
              </div>
              {/* the gate is stated under the controls too, so a disabled button is never bare */}
              {!mayDecide && <div className="wz-gate" style={{ marginTop: 8 }}>{tr('review.tierGateNote')}</div>}
            </>
          )}
        </div>
      </div>

      {/* ---- ratify ceremony — phrased as the real-world event, with the audit preview ---- */}
      {decide === 'ratify' && (
        <Modal
          title={tr('review.ratifyTitle')}
          sub={`${tender.code} — ${tender.title[lang]}`}
          onClose={closeDecide}
          footer={
            <>
              <button className="op-btn-ghost" onClick={closeDecide}>{tr('review.dismiss')}</button>
              <span style={{ flex: 1 }} />
              {/* ratify is not destructive → primary, not danger */}
              <button className="op-btn-primary" onClick={commitRatify}>{tr('review.ratifyConfirm')}</button>
            </>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>{tr('review.ratifyQ', { title: tender.title[lang], code: tender.code })}</p>
          {ledger}
        </Modal>
      )}

      {/* ---- return-with-notes ceremony — reason-gated (notes) with the audit preview ---- */}
      {decide === 'return' && (
        <Modal
          title={tr('review.returnTitle')}
          sub={`${tender.code} — ${tender.title[lang]}`}
          onClose={closeDecide}
          footer={
            <>
              <button className="op-btn-ghost" onClick={closeDecide}>{tr('review.dismiss')}</button>
              <span style={{ flex: 1 }} />
              {/* return is corrective, not destructive → primary, not danger */}
              <button className="op-btn-primary" disabled={!notesOk} onClick={commitReturn}>{tr('review.returnConfirm')}</button>
            </>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>{tr('review.returnQ', { title: tender.title[lang], code: tender.code })}</p>
          <label className="wz-field__l" htmlFor="rv-notes">{tr('review.notes')}</label>
          <textarea
            id="rv-notes"
            className="wz-ta"
            rows={3}
            dir="auto"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('review.notesHint')}
            style={{ width: '100%', marginTop: 6 }}
          />
          <div className="wz-gate" style={{ marginTop: 6 }}>{notesOk ? tr('review.govNote') : tr('review.returnGate')}</div>
          {ledger}
        </Modal>
      )}

      {/* ---- governance modals — cancel / suspend / resume (documented, awaited) ---- */}
      {gov && (
        <Modal
          title={tr(`review.${gov}Tender`)}
          sub={`${tender.code} — ${tender.title[lang]}`}
          onClose={closeGov}
          footer={
            <>
              <button className="op-btn-ghost" onClick={closeGov}>{tr('review.dismiss')}</button>
              <span style={{ flex: 1 }} />
              <button
                className={gov === 'cancel' ? 'op-btn-danger' : 'op-btn-primary'}
                disabled={!govReasonOk}
                onClick={confirmGov}
              >
                {tr(`review.confirm${gov === 'cancel' ? 'Cancel' : gov === 'suspend' ? 'Suspend' : 'Resume'}`)}
              </button>
            </>
          }
        >
          <label className="wz-field__l">{tr('review.reason')}</label>
          <textarea
            className="wz-ta"
            rows={3}
            dir="auto"
            maxLength={2000}
            value={govReason}
            onChange={(e) => setGovReason(e.target.value)}
            placeholder={tr(`review.govReasonPh_${gov}`)}
            style={{ width: '100%', marginTop: 6 }}
          />
          <div className="wz-gate" style={{ marginTop: 6 }}>{govReasonOk ? tr('review.govNote') : tr('review.govReasonMin')}</div>
        </Modal>
      )}
    </div>
  );
}
