import { isLateBidByDate, vendorEligible } from '@masaar/scpp-rules';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MinistryListsExplainer } from '../admin/MinistryLists';
import { Modal } from '../admin/Modal';
import { SearchBox } from '../registry/SearchBox';
import { bidClosingAt, calendarOf, currentStage, todayIso, useStore, type Tender, type VendorState } from '../store';
import { useToasts } from '../Toasts';
import { fmtCount, fmtDate } from './derive';
import { Icon } from './Icon';

/* ------------------------------------------------------------------ *
 * Quick-add dialog (م4) — the first application of the shared Modal as
 * an "add" surface. `ADD_BIDDER` only carries a bare `name` (store.tsx:379,
 * AddBidderDto.name), so a vendor pick simply pre-fills that name; the 10.4/
 * 14.3 eligibility gate the server would run on `vendorId` is enforced here
 * on the client instead, since the client never sends a vendorId.
 * ------------------------------------------------------------------ */

/* ---------------- pure governance helpers (tested) ---------------- */

/** Why the affordance is closed — adding bidders only makes sense before the
 *  commercial envelopes open (12.4.2), on an active, un-awarded tender. */
export type BidderGateReason = 'commercial' | 'closed' | 'inactive';

export const BIDDER_GATE_KEY: Record<BidderGateReason, string> = {
  commercial: 'filebidders.gateCommercial',
  closed: 'filebidders.gateClosed',
  inactive: 'filebidders.gateInactive',
};

/**
 * The window in which a bidder may still be registered. Ties to the 12.4.2
 * price lock the file already renders: once `evaluationStep >= 2` the
 * commercial envelopes are open and prices for qualified bidders unlock, so
 * admitting a new bidder then would let a party enter the price competition
 * after prices are known — a fairness breach. Suspended/cancelled or already
 * ratified tenders are closed outright.
 */
export function canAddBidders(t: Tender): { ok: boolean; reason?: BidderGateReason } {
  if (t.lifecycle) return { ok: false, reason: 'inactive' };
  if (t.ratification) return { ok: false, reason: 'closed' };
  if (!currentStage(t)) return { ok: false, reason: 'closed' };
  if (t.evaluationStep >= 2) return { ok: false, reason: 'commercial' };
  return { ok: true };
}

export interface VendorBlock {
  code: 'suspended' | 'blacklisted' | 'in-dispute' | 'banned' | 'archived';
  /** the SCPP article the block cites — `registry` for the one block that is not a sanction */
  clause: '10.4' | '14.3' | 'registry';
}
export interface VendorEligibility {
  selectable: boolean;
  blocks: VendorBlock[];
}

/**
 * Whether a registry vendor may be entered as a bidder — mirrors the server
 * gate in tenders.service.ts:addBidder: 10.4 eligibility (suspended /
 * blacklisted / in-dispute) plus an active 14.3 refusal-to-sign ban. Pure.
 *
 * `archived` (client decision ق7) is the fourth block and the only one that is NOT a sanction:
 * the entity was withdrawn from the active registry, so it is not offered for new participation.
 * It cites `registry` rather than an article precisely so the dialog cannot present an
 * administrative withdrawal as a legal disqualification — a restore lifts it with no clause in play.
 */
export function vendorBidEligibility(
  v: Pick<VendorState, 'suspended' | 'blacklisted' | 'inDispute' | 'banUntil' | 'archived'>,
  today: string,
): VendorEligibility {
  const elig = vendorEligible({ suspended: v.suspended, blacklisted: v.blacklisted, inDispute: v.inDispute });
  const blocks: VendorBlock[] = elig.reasons.map((code) => ({ code: code as VendorBlock['code'], clause: '10.4' }));
  if (v.banUntil && v.banUntil > today) blocks.push({ code: 'banned', clause: '14.3' });
  if (v.archived) blocks.push({ code: 'archived', clause: 'registry' });
  return { selectable: blocks.length === 0, blocks };
}

/** The subset of the registry a bid may be entered for (10.4 / 14.3 excluded). */
export function selectableVendors(vendors: readonly VendorState[], today: string): VendorState[] {
  return vendors.filter((v) => vendorBidEligibility(v, today).selectable);
}

/* ---------------- dialog ---------------- */

type Choice = { kind: 'vendor'; vendor: VendorState } | { kind: 'free'; name: string } | null;

export default function BidderAddDialog({ tender, onClose }: { tender: Tender; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const { state, dispatch } = useStore();
  const { toast } = useToasts();
  const today = todayIso();

  const [q, setQ] = useState('');
  const [choice, setChoice] = useState<Choice>(null);
  const [free, setFree] = useState('');
  const [submitted, setSubmitted] = useState(''); // recorded submission date (10.6.1)

  // the derived bid-closing DATE (§11.3.4-e) — only offered once the announcement is published
  const closing = bidClosingAt(tender.announcement, calendarOf(state));
  const isLate = !!submitted && !!closing && isLateBidByDate(submitted, closing);
  // once the window has CLOSED, a submission date is mandatory — a bare add can no longer silently
  // admit a possibly-late bid (the 10.6.1 gate must be automatic, not bypassable by omission).
  const dateRequired = !!closing && today > closing;
  const dateMissing = dateRequired && !submitted;

  // 12.4.2 matches bidders by name — an already-registered name must not be re-added.
  const existingNames = useMemo(() => new Set(tender.bidders.map((b) => b.name.trim())), [tender.bidders]);

  const vendors = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? state.vendors.filter((v) => v.name.toLowerCase().includes(needle)) : state.vendors;
  }, [state.vendors, q]);

  const resolvedName =
    choice?.kind === 'vendor' ? choice.vendor.name.trim() : choice?.kind === 'free' ? choice.name.trim() : '';
  const isDup = resolvedName !== '' && existingNames.has(resolvedName);
  const canSubmit = resolvedName.length >= 1 && resolvedName.length <= 160 && !isDup && !isLate && !dateMissing;

  const blockLabel = (b: VendorBlock, v: VendorState): string => {
    if (b.code === 'banned') {
      return t('bidderadd.blockBanned', {
        d: v.banUntil ? fmtDate(v.banUntil, lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
      });
    }
    if (b.code === 'suspended') return t('bidderadd.blockSuspended');
    if (b.code === 'blacklisted') return t('bidderadd.blockBlacklisted');
    if (b.code === 'archived') return t('bidderadd.blockArchived');
    return t('bidderadd.blockDispute');
  };

  const submit = () => {
    if (!canSubmit) return;
    const name = resolvedName;
    // قناة الصدق: success toast fires only after the store confirms (ok:true);
    // a server refusal is surfaced by the shell's registered fail sink.
    void dispatch({ type: 'ADD_BIDDER', tenderId: tender.id, name, ...(submitted ? { submittedAt: submitted } : {}) }).then((r) => {
      if (!r.ok) return;
      toast(t('bidderadd.added', { name }), {
        kind: 'success',
        desc: t('bidderadd.addedDesc', { code: tender.code, n: fmtCount(tender.bidders.length + 1, lang) }),
      });
      // quick-add stays in context for the next bidder of the slate
      setChoice(null);
      setFree('');
      setQ('');
      setSubmitted('');
    });
  };

  return (
    <Modal
      title={t('bidderadd.title')}
      sub={t('bidderadd.sub')}
      onClose={onClose}
      footer={
        <>
          <button className="op-btn-primary" onClick={submit} disabled={!canSubmit}>
            <Icon name="plus" size={15} />
            {t('bidderadd.submit')}
          </button>
          <button className="op-btn-ghost" onClick={onClose}>
            {t('bidderadd.done')}
          </button>
          <span className={`wz-gate${canSubmit ? ' wz-gate--ok' : ''} bidderadd-gate`}>
            {isDup ? t('bidderadd.gateDup') : isLate ? t('bidderadd.gateLate') : !resolvedName ? t('bidderadd.gateEmpty') : dateMissing ? t('bidderadd.gateDateReq') : t('bidderadd.gateReady', { name: resolvedName })}
          </span>
        </>
      }
    >
      <SearchBox
        value={q}
        onChange={setQ}
        placeholder={t('bidderadd.searchPh')}
        ariaLabel={t('bidderadd.searchPh')}
        className="bidderadd-search"
      />

      {/* ق5 — the picker shows BOTH ministry registers on its rows (the Article-25 five, and the
          suppliers list), so the disclosure that tells them apart travels with it. Collapsed:
          the registry is the subject, the definitions are one click away. */}
      <MinistryListsExplainer />

      <div className="bidderadd-list" aria-label={t('bidderadd.registryLabel')}>
        {vendors.length === 0 && <div className="bidderadd-empty">{t('bidderadd.noMatch')}</div>}
        {vendors.map((v) => {
          const elig = vendorBidEligibility(v, today);
          const already = existingNames.has(v.name.trim());
          const disabled = !elig.selectable || already;
          const on = choice?.kind === 'vendor' && choice.vendor.id === v.id;
          const note = already ? t('bidderadd.blockAlready') : elig.blocks.map((b) => blockLabel(b, v)).join(' · ');
          return (
            <button
              key={v.id}
              type="button"
              className={`bidderadd-row${on ? ' bidderadd-row--on' : ''}`}
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled ? note : undefined}
              onClick={() => {
                setChoice({ kind: 'vendor', vendor: v });
                setFree('');
              }}
            >
              <Icon name="building" size={15} />
              <span className="bidderadd-row__name" dir="auto">
                {v.name}
                {/* ق5 — the Article-25 five are marked ON THE NAME: whether this bidder counts
                    toward §9 participation is a property of the company, not of its capability */}
                {v.isStateCompany && (
                  <span className="ent-state" style={{ marginInlineStart: 8 }} title={t('vendors.stateDef')}>{t('vendors.stateTag')}</span>
                )}
              </span>
              {disabled ? (
                <span className="bidderadd-row__note">
                  <Icon name="alert" size={12} />
                  {note}
                </span>
              ) : on ? (
                <Icon name="check" size={15} strokeWidth={2} />
              ) : v.mooListed ? (
                <span className="bidderadd-row__moo" title={t('vendors.mooDef')}>{t('bidderadd.moo')}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="bidderadd-div">{t('bidderadd.freeDivider')}</div>

      <div className="bidderadd-free">
        <label className="bidderadd-free__l" htmlFor="bidderadd-free-in">
          {t('bidderadd.freeLabel')}
        </label>
        <input
          id="bidderadd-free-in"
          className="bidderadd-in"
          value={free}
          maxLength={160}
          placeholder={t('bidderadd.freePh')}
          dir="auto"
          onChange={(e) => {
            const val = e.target.value;
            setFree(val);
            setChoice(val.trim() ? { kind: 'free', name: val } : null);
          }}
        />
        {choice?.kind === 'free' && choice.name.trim() !== '' && (
          <div className="wz-note wz-note--warn">
            <Icon name="alert" size={15} />
            <span>{t('bidderadd.freeWarn')}</span>
          </div>
        )}
      </div>

      {closing && (
        <div className="bidderadd-free">
          <label className="bidderadd-free__l" htmlFor="bidderadd-sub-in">
            {dateRequired ? t('bidderadd.submittedLabelReq') : t('bidderadd.submittedLabel')}
          </label>
          <input
            id="bidderadd-sub-in"
            type="date"
            className="bidderadd-in"
            value={submitted}
            max="9999-12-31"
            required={dateRequired}
            aria-invalid={dateMissing || isLate}
            onChange={(e) => setSubmitted(e.target.value)}
          />
          <div className="wz-note">
            {t(dateRequired ? 'bidderadd.closedHint' : 'bidderadd.closesHint', { d: fmtDate(closing, lang, { day: 'numeric', month: 'short', year: 'numeric' }) })}
          </div>
          {isLate && (
            <div className="wz-note wz-note--warn">
              <Icon name="alert" size={15} />
              <span>{t('bidderadd.lateWarn')} <span className="op-code" style={{ fontSize: 10 }}>10.6.1</span></span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
