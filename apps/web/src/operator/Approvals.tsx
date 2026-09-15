import { tierNeedsApproval } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { LadderSourceTag, TIER_ORDER, TierPill, tierRange } from '../admin/TierPill';
import {
  resolveTiersFor, sessionScopeCompanyId, sessionScopedTenders, tenderApprovalTier, useStore,
} from '../store';
import { fmtCount, fmtMoney } from './derive';

/**
 * «سلّم الموافقات» — the operating company's own read of the ladder it is measured against.
 *
 * This screen settles the POST-V2 §ج debt («if the client wants an operator to see its ladder, a
 * scoped version is built»), and the 2026-08-25 decision is what made it worth building: while one
 * ladder governed everyone, an operator's ladder was a system fact readable anywhere; now that a
 * company may hold ceilings of its own, «which ladder are WE measured by» is a question only this
 * portal can answer for its reader.
 *
 * READ-ONLY, and not by omission. There is no control here and no path to one: moving a ceiling is
 * the platform administrator's act, taken from the operating-companies registry with a documented
 * justification and an attributed actor. Nor is there a decision act on any row — ratification is
 * not this portal's seat, and a «صادق» offered where the guard would refuse it is the placebo
 * button the product refuses by name. The screen answers two questions and stops: on which ladder
 * are we measured, and where do our requests stand on it.
 */
export default function OperatorApprovals() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const { state } = useStore();

  /**
   * The scope, from the ONE place that decides it (`sessionScopeCompanyId`) — the same condition
   * `sessionScopedTenders` filters on, so the ladder shown and the tenders listed can never belong
   * to different companies. A platform session reaching this address gets the honest answer that
   * it is not scoped to a company, rather than the default ladder dressed as «yours».
   */
  const companyId = sessionScopeCompanyId();
  const tiers = resolveTiersFor(state, companyId);
  const own = !!(companyId && state.operatorTiers[companyId]);
  const mine = sessionScopedTenders(state);

  /** How many of OUR tenders sit in each band — counted through the single derivation, so a
   *  ceiling approved for us moves these counts exactly as it moves the decision. */
  const inBand = (tier: (typeof TIER_ORDER)[number]) =>
    mine.filter((x) => tenderApprovalTier(state, x) === tier).length;

  /** Our requests at a real gate (ط2/ط3), with where their decision stands. ط1 is excluded
   *  because it opens no gate at all — it is decided inside the company. */
  const atGates = mine
    .filter((x) => x.lifecycle?.status !== 'cancelled' && tierNeedsApproval(tenderApprovalTier(state, x)))
    .sort((a, b) => b.estimatedValueUSD - a.estimatedValueUSD);

  if (!companyId) {
    return (
      <div className="op-page">
        <div className="op-page__head">
          <div>
            <h1 className="op-page__title">{t('opapprovals.title')}</h1>
            <div className="op-page__sub">{t('opapprovals.sub')}</div>
          </div>
        </div>
        <div className="wz-note wz-note--warn">{t('opapprovals.noScope')}</div>
      </div>
    );
  }

  return (
    <div className="op-page">
      <div className="op-page__head">
        <div>
          <h1 className="op-page__title">{t('opapprovals.title')}</h1>
          <div className="op-page__sub">{t('opapprovals.sub')}</div>
        </div>
      </div>

      <section className="file-sidecard">
        <h2 className="file-sidecard__h">
          {t('opapprovals.ladderHead')} <LadderSourceTag own={own} full />
        </h2>
        {/* the three rows, the same block and the same order every other ladder listing uses —
            and the ceilings are THIS company's, resolved once above */}
        <div className="ad-ladder">
          {TIER_ORDER.map((tier) => (
            <div key={tier} className="ad-ladder__row">
              <TierPill tier={tier} tiers={tiers} />
              <span>{t(`tier.body.${tier}`)}</span>
              <span className="ad-ladder__band">{tierRange(tier, tiers)}</span>
              <span className="op-code">{fmtCount(inBand(tier), lang)}</span>
            </div>
          ))}
        </div>
        {/* the inclusive-boundary + fail-closed promise, read from its OWN key rather than
            restated: one sentence, one home, and it stays true wherever it is printed */}
        <p className="file-sidecard__note">{t('approvals.explainFailClosed')}</p>
      </section>

      <section className="file-sidecard" style={{ marginBlockStart: 12 }}>
        <h2 className="file-sidecard__h">{t('opapprovals.pendingHead')}</h2>
        {atGates.length === 0 ? (
          <p className="file-sidecard__note">{t('opapprovals.empty')}</p>
        ) : (
          <div className="op-tablecard">
            <table className="op-tbl">
              <thead>
                <tr>
                  <th>{t('approvals.colTier')}</th>
                  <th>{t('tenders.colTender')}</th>
                  <th className="op-end">{t('approvals.colValue')}</th>
                  <th>{t('approvals.colBody')}</th>
                  <th>{t('approvals.colDecision')}</th>
                </tr>
              </thead>
              <tbody>
                {mineRows(atGates)}
              </tbody>
            </table>
          </div>
        )}
        <p className="file-sidecard__note">{t('opapprovals.noGate')}</p>
      </section>

      <div className="op-empty op-empty--inline" style={{ marginBlockStart: 10 }}>{t('opapprovals.foot')}</div>
    </div>
  );

  /** The rows, kept beside their table — each one's tier and ladder resolved for THIS company. */
  function mineRows(rows: typeof atGates) {
    return rows.map((x) => {
      const tier = tenderApprovalTier(state, x);
      // the decision as the store holds it — never invented, and «pending» is the absence of a
      // ratification record rather than a status anybody wrote
      const dec = x.ratification?.status ?? 'pending';
      return (
        <tr key={x.id} className="op-tbl__row">
          <td><TierPill tier={tier} tiers={tiers} /></td>
          <td>
            <div className="op-tbl__name" dir="auto">{x.title[lang]}</div>
            <div className="op-tbl__code">{x.code}</div>
          </td>
          <td className="op-end"><span className="op-code">{fmtMoney(x.estimatedValueUSD)}</span></td>
          <td><span style={{ fontSize: 12.5 }}>{t(`tier.body.${tier}`)}</span></td>
          <td><span className={`ad-dec ad-dec--${dec}`}>{t(`approvals.dec.${dec}`)}</span></td>
        </tr>
      );
    });
  }
}
