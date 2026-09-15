import { approvalTierFor, type ApprovalTier, type ApprovalTiers } from '@masaar/scpp-rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { orgName } from '../orgIdentity';
import {
  govReasonValid, ladderApprovable, resolveTiersFor, sameTiers, useStore,
  type OperatorOrg, type Tender,
} from '../store';
import { useAdminUi } from './AdminShell';
import { Modal } from './Modal';
import { LadderSourceTag, TIER_ORDER, TierPill, tierRange } from './TierPill';
import { useActor } from './UserActions';

/**
 * ONE tender whose approving body changes if this ladder is approved — the unit of the preview.
 * `from`/`to` are both derived on the spot; neither is read off the tender, because a tier is
 * never stored (see `tenderApprovalTier`).
 */
interface TierMove {
  tender: Tender;
  from: ApprovalTier;
  to: ApprovalTier;
}

const RANK: Record<ApprovalTier, number> = { OPERATOR: 0, JMC: 1, MDOC: 2 };

/**
 * Which of this company's LIVE, UNDECIDED requests would change hands.
 *
 * «Live and undecided» is the honest population: a cancelled request is out of the process and a
 * ratified or returned one has already been signed by whoever the ladder of that day named — a
 * ladder approved now does not reopen either, and counting them would promise an effect that
 * cannot happen. What is left is exactly the set whose decision is still ahead of it, which is the
 * set a supervisor is being asked about.
 *
 * Derived at every keystroke rather than memoised on the tenders alone: the whole point is that
 * the reader sees the consequence of the figure IN THE FIELD, before it is approved (the
 * `reportStamp` precedent — the sentence is readable before the file is written).
 */
export function tierMoves(
  tenders: Tender[],
  operatorId: string,
  current: ApprovalTiers,
  next: ApprovalTiers,
): TierMove[] {
  const moves: TierMove[] = [];
  for (const tender of tenders) {
    if (tender.operatorId !== operatorId) continue;
    if (tender.lifecycle?.status === 'cancelled') continue;
    if (tender.ratification) continue; // already decided — a new ladder does not reopen it
    const from = approvalTierFor(tender.estimatedValueUSD, current);
    const to = approvalTierFor(tender.estimatedValueUSD, next);
    if (from !== to) moves.push({ tender, from, to });
  }
  return moves;
}

/**
 * The supervisor's act (client decision 2026-08-25): approve a ladder for ONE operating company,
 * or withdraw the one it has and return it to the system default.
 *
 * Built to the access-action pattern its siblings already use (UserActions): a gate sentence that
 * names the ONE reason the confirm button is disabled, a mandatory 20-char justification, an
 * attributed dispatch, and — the part this act specifically owes — a live preview of what the
 * approval would move, because the ladder is read at decision time and every pending request of
 * this company is re-measured the instant it lands.
 */
export default function OperatorLadderModal({ op, onClose }: { op: OperatorOrg; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state, dispatch } = useStore();
  const { toast } = useAdminUi();
  const actor = useActor();

  const current = resolveTiersFor(state, op.id);
  const own = !!state.operatorTiers[op.id];

  // seeded from the ladder in force, so the dialog opens on the truth and an edit is a departure
  // from it rather than from an empty form the reader has to reconstruct
  const [opMax, setOpMax] = useState(String(current.operatorMaxUSD));
  const [jmcMax, setJmcMax] = useState(String(current.jmcMaxUSD));
  const [reason, setReason] = useState('');
  /** `true` while the reader is withdrawing rather than setting — one modal, two directions. */
  const [dropping, setDropping] = useState(false);

  const num = (v: string): number => (v.trim() === '' ? Number.NaN : Number(v));
  const next: ApprovalTiers = { operatorMaxUSD: num(opMax), jmcMaxUSD: num(jmcMax) };
  const finite = Number.isFinite(next.operatorMaxUSD) && Number.isFinite(next.jmcMaxUSD)
    && next.operatorMaxUSD >= 0 && next.jmcMaxUSD >= 0;

  /**
   * The gate, in the order the reducer checks it — so the sentence under the button and the
   * refusal the reducer would write can never name different problems.
   */
  const gate = dropping
    ? (!own ? t('opladder.errNoChange') : !govReasonValid(reason) ? t('access.reasonMin') : null)
    : !finite ? t('opladder.errNumber')
    : !ladderApprovable(next) ? t('opladder.errOrder')
    : sameTiers(state.operatorTiers[op.id], next) ? t('opladder.errNoChange')
    : !govReasonValid(reason) ? t('access.reasonMin')
    : null;

  /** The ladder the preview measures AGAINST: the default when withdrawing, the typed one when not. */
  const target = dropping ? state.approvalTiers : next;
  const moves = useMemo(
    () => (dropping || ladderApprovable(next) ? tierMoves(state.tenders, op.id, current, target) : []),
    // `current`/`target`/`next` are fresh objects each render; the primitive ceilings are the
    // real inputs, so they are what the memo keys on
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.tenders, op.id, dropping, current.operatorMaxUSD, current.jmcMaxUSD, target.operatorMaxUSD, target.jmcMaxUSD],
  );
  const up = moves.filter((m) => RANK[m.to] > RANK[m.from]).length;
  const down = moves.length - up;

  const submit = () => {
    if (gate || !actor) return;
    dispatch({
      type: 'SET_OPERATOR_TIERS',
      operatorId: op.id,
      tiers: dropping ? null : next,
      reason: reason.trim(),
      by: actor,
    });
    toast(t(dropping ? 'opladder.toastReset' : 'opladder.toastSet', { name: orgName(op, lang) }));
    onClose();
  };

  return (
    <Modal
      title={t('opladder.title')} sub={orgName(op, lang)} onClose={onClose}
      footer={<>
        <button className="op-btn-ghost" onClick={onClose}>{t('access.cancel')}</button>
        <span style={{ flex: 1 }} />
        <button className="op-btn-primary" disabled={!!gate} onClick={submit}>
          {t(dropping ? 'opladder.resetConfirm' : 'opladder.confirm')}
        </button>
      </>}
    >
      {/* The ladder in force, in the SAME three rows every other surface lists it in — the
          `ad-ladder` block, not a second rendering of the same three sentences. */}
      <div className="wz-field">
        <span className="wz-field__l">{t('opladder.currentHead')}</span>
        <div className="ad-ladder" style={{ marginBlockStart: 6 }}>
          {TIER_ORDER.map((tier) => (
            <div key={tier} className="ad-ladder__row">
              <TierPill tier={tier} tiers={current} />
              <span>{t(`tier.body.${tier}`)}</span>
              <span className="ad-ladder__band">{tierRange(tier, current)}</span>
            </div>
          ))}
        </div>
        <div className="ad-ladder__note">
          <LadderSourceTag own={own} />{' '}
          {t(own ? 'opladder.currentOwn' : 'opladder.currentDefault')}
        </div>
      </div>

      {!dropping && (
        <>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <div className="wz-field" style={{ flex: 1 }}>
              <label className="wz-field__l" htmlFor="opl-op">{t('opladder.opMax')}</label>
              <input
                id="opl-op" className="wz-in wz-in--mono" type="number" min={0} inputMode="numeric"
                value={opMax} onChange={(e) => setOpMax(e.target.value)}
              />
            </div>
            <div className="wz-field" style={{ flex: 1 }}>
              <label className="wz-field__l" htmlFor="opl-jmc">{t('opladder.jmcMax')}</label>
              <input
                id="opl-jmc" className="wz-in wz-in--mono" type="number" min={0} inputMode="numeric"
                value={jmcMax} onChange={(e) => setJmcMax(e.target.value)}
              />
            </div>
          </div>
          <div className="wz-gate" style={{ marginTop: 6 }}>{t('opladder.zeroNote')}</div>

          {/* The ladder as APPROVED would read it — rendered only once it is a ladder at all, so
              the reader is never shown three rows derived from a half-typed figure */}
          {ladderApprovable(next) && (
            <div className="wz-field" style={{ marginTop: 12 }}>
              <span className="wz-field__l">{t('opladder.nextHead')}</span>
              <div className="ad-ladder" style={{ marginBlockStart: 6 }}>
                {TIER_ORDER.map((tier) => (
                  <div key={tier} className="ad-ladder__row">
                    <TierPill tier={tier} tiers={next} />
                    <span>{t(`tier.body.${tier}`)}</span>
                    <span className="ad-ladder__band">{tierRange(tier, next)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {dropping && <div className="wz-note wz-note--warn" style={{ marginTop: 12 }}>{t('opladder.resetNote')}</div>}

      {/* س1 — the retroactive effect, made visible BEFORE the act rather than discovered after it */}
      {(dropping || ladderApprovable(next)) && (
        <div className="wz-note wz-note--info" style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 600 }}>{t('opladder.previewHead')}</div>
          {moves.length === 0 ? (
            <div style={{ marginBlockStart: 4 }}>{t('opladder.previewNone')}</div>
          ) : (
            <>
              <div style={{ marginBlockStart: 4 }}>
                {t('opladder.previewCount', { n: fmtCount(moves.length, lang) })}
                {up > 0 && <> · {t('opladder.previewUp', { n: fmtCount(up, lang) })}</>}
                {down > 0 && <> · {t('opladder.previewDown', { n: fmtCount(down, lang) })}</>}
              </div>
              <ul className="ad-ladder" style={{ marginBlockStart: 6, listStyle: 'none', padding: 0 }}>
                {moves.map((m) => (
                  <li key={m.tender.id} className="ad-ladder__row">
                    <span className="op-code">{m.tender.code}</span>
                    <span className="acc-mono">{fmtMoney(m.tender.estimatedValueUSD)}</span>
                    <span className="ad-ladder__band">
                      {t('opladder.previewMove', { from: t(`tier.name.${m.from}`), to: t(`tier.name.${m.to}`) })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="wz-gate" style={{ marginBlockStart: 6 }}>{t('opladder.previewLive')}</div>
        </div>
      )}

      <div className="wz-field" style={{ marginTop: 12 }}>
        <label className="wz-field__l" htmlFor="opl-reason">{t('access.reason')}</label>
        <textarea
          id="opl-reason" className="wz-ta" rows={3} dir="auto" value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder={t('access.reasonPh')}
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>
      <div className="wz-gate" style={{ marginTop: 6 }}>{gate ?? t('access.auditNote')}</div>

      {/* The withdrawal offer exists ONLY where there is something to withdraw — a company on the
          default has no override to drop, and a button for it would act on nothing */}
      {own && !dropping && (
        <button className="op-btn-ghost" style={{ marginTop: 12 }} onClick={() => setDropping(true)}>
          {t('opladder.reset')}
        </button>
      )}
      {dropping && (
        <button className="op-btn-ghost" style={{ marginTop: 12 }} onClick={() => setDropping(false)}>
          {t('access.cancel')}
        </button>
      )}
    </Modal>
  );
}
