import { awardVerdict, isPriceVisible, lowestQualified } from '@masaar/scpp-rules';
import { StatusPill, VerdictStrip } from '@masaar/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bidClosingAt, calendarOf, evalStepName, singleBidStatus, todayIso, useStore, type Tender } from '../store';
import BidderAddDialog, { BIDDER_GATE_KEY, canAddBidders } from './BidderAddDialog';
import { fmtCount, fmtDate, fmtMoney } from './derive';
import { Icon } from './Icon';

/** Bidders tab — read-only standing; prices stay locked until 12.4.2 allows. */
export default function FileBidders({ tender }: { tender: Tender }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state } = useStore();

  const [addOpen, setAddOpen] = useState(false);
  const gate = canAddBidders(tender);
  const gateNote = gate.reason ? t(BIDDER_GATE_KEY[gate.reason]) : '';

  const step = evalStepName(tender.evaluationStep);
  const lowest = lowestQualified(tender.bidders);
  const verdict = lowest?.priceUSD != null ? awardVerdict(lowest.priceUSD, tender.estimatedValueUSD) : null;

  // derived bid closing (§11.3.4-e) and the §15.3 lone-bid check — computed, never stored (C2)
  const closing = bidClosingAt(tender.announcement, calendarOf(state));
  const closed = !!closing && todayIso() > closing;
  const sb = singleBidStatus(tender);

  return (
    <div>
      <div className="file-bidders-head">
        <div className="file-bidders-head__l">
          <div className="file-bidders-head__title">{t('filebidders.headTitle')}</div>
          <div className="file-bidders-head__sub">
            {t('filebidders.count', { n: fmtCount(tender.bidders.length, lang) })}
            {closing && (
              <> · {t(closed ? 'filebidders.closedOn' : 'filebidders.closesOn', { d: fmtDate(closing, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}</>
            )}
          </div>
        </div>
        <div className="file-bidders-head__act">
          <button
            className="op-btn-primary"
            onClick={() => setAddOpen(true)}
            disabled={!gate.ok}
            title={gate.ok ? undefined : gateNote}
          >
            <Icon name="plus" size={15} />
            {t('filebidders.addBidder')}
          </button>
          {!gate.ok && <span className="wz-gate">{gateNote}</span>}
        </div>
      </div>

      {verdict && (
        <div style={{ marginTop: 16 }}>
          <VerdictStrip verdict={verdict} lang={lang} />
        </div>
      )}

      {sb.single && !sb.ok && (
        <div className="wz-note wz-note--warn" style={{ marginTop: 12 }}>
          <Icon name="alert" size={15} />
          <span>{t('filebidders.singleBidWarn')} <span className="op-code" style={{ fontSize: 10 }}>15.3</span></span>
        </div>
      )}

      {tender.bidders.length === 0 ? (
        <div className="op-empty">{gate.ok ? t('filebidders.emptyCta') : gateNote}</div>
      ) : (
        <div className="file-card" style={{ marginTop: 12 }}>
          <table className="op-tbl">
            <thead>
              <tr>
                <th>{t('filebidders.colBidder')}</th>
                <th>{t('filebidders.colDocs')}</th>
                <th>{t('filebidders.colBond')}</th>
                <th>{t('filebidders.colTech')}</th>
                <th className="op-end">{t('filebidders.colPrice')}</th>
              </tr>
            </thead>
            <tbody>
              {tender.bidders.map((b) => {
                const isLowest = lowest?.id === b.id;
                const showPrice = b.priceUSD != null && isPriceVisible(step, b);
                const tech = b.technicalResult;
                return (
                  <tr key={b.id} className={isLowest ? 'file-bidrow--lowest' : undefined}>
                    <td>
                      <span className="op-tbl__name" dir="auto">{b.name}</span>
                      {isLowest && <span className="file-lowest">{t('filebidders.lowest')}</span>}
                      {b.submittedAt && (
                        <span className="file-bidders-head__sub" style={{ display: 'block', fontSize: 11 }}>
                          {t('filebidders.submittedOn', { d: fmtDate(b.submittedAt.slice(0, 10), lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}
                        </span>
                      )}
                    </td>
                    <td><StatusPill size="sm" status={b.docsOk ? 'done' : 'delayed'}>{b.docsOk ? t('filebidders.docsOk') : t('filebidders.docsNo')}</StatusPill></td>
                    <td><StatusPill size="sm" status={b.bondOk ? 'done' : 'delayed'}>{b.bondOk ? t('filebidders.bondOk') : t('filebidders.bondNo')}</StatusPill></td>
                    <td>
                      <StatusPill status={tech === 'pass' ? 'done' : tech === 'fail' ? 'delayed' : 'planned'}>
                        {tech === 'pass' ? t('filebidders.techPass') : tech === 'fail' ? t('filebidders.techFail') : t('filebidders.techPending')}
                      </StatusPill>
                    </td>
                    <td className="op-end">
                      {showPrice ? (
                        <span className="file-price">{fmtMoney(b.priceUSD!)}</span>
                      ) : (
                        <span className="file-locked" title="SCPP 12.4.2">
                          <Icon name="lock" size={13} />
                          {t('filebidders.locked')} <span className="op-code" style={{ fontSize: 10 }}>12.4.2</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && <BidderAddDialog tender={tender} onClose={() => setAddOpen(false)} />}
    </div>
  );
}
