import type { ApprovalTier, ApprovalTiers } from '@masaar/scpp-rules';
import { useTranslation } from 'react-i18next';
import { fmtCount, fmtMoney } from '../operator/derive';
import { operatorsWithOwnTiers, type State } from '../store';

/**
 * The approval-ladder pill (client decision ق1): which BODY clears a request of this value.
 *
 * Deliberately NOT a StatusPill — the same reasoning that keeps `.acc-role` out of the status
 * vocabulary. A tier is a standing authority band, not a lifecycle state: it does not progress,
 * it cannot be "late", and painting it with `--status-*` would spend a closed semantic colour on
 * information that is not a status. It therefore reads in the BRAND vocabulary the client named:
 * amber for the joint committee, navy for the parent company, muted paper for the operator's own
 * authority (which opens no gate at all).
 */

/**
 * The band sentence for a tier, as a translation key + its live figures — pure, so the ladder
 * shown in a tooltip, in the explainer and in the operator form is provably the same one the
 * engine judged with (no restated thresholds anywhere).
 */
export function tierBand(tier: ApprovalTier, tiers: ApprovalTiers): { key: string; params: Record<string, string> } {
  if (tier === 'OPERATOR') return { key: 'tier.band.OPERATOR', params: { max: fmtMoney(tiers.operatorMaxUSD) } };
  if (tier === 'JMC') return { key: 'tier.band.JMC', params: { min: fmtMoney(tiers.operatorMaxUSD), max: fmtMoney(tiers.jmcMaxUSD) } };
  return { key: 'tier.band.MDOC', params: { min: fmtMoney(tiers.jmcMaxUSD) } };
}

/**
 * The band as a compact machine expression («≤ $5,000,000», «> $5,000,000 → $10,000,000»),
 * for the dense read-only ladder in the operator form where the prose sentence would crowd the
 * dialog. Latin digits and $ come from fmtMoney; the caller renders it in a mono LTR island.
 */
export function tierRange(tier: ApprovalTier, tiers: ApprovalTiers): string {
  if (tier === 'OPERATOR') return `≤ ${fmtMoney(tiers.operatorMaxUSD)}`;
  if (tier === 'JMC') return `> ${fmtMoney(tiers.operatorMaxUSD)} → ${fmtMoney(tiers.jmcMaxUSD)}`;
  return `> ${fmtMoney(tiers.jmcMaxUSD)}`;
}

/** The ladder top to bottom — one order for every surface that lists it. */
export const TIER_ORDER: ApprovalTier[] = ['OPERATOR', 'JMC', 'MDOC'];

const MOD: Record<ApprovalTier, string> = { OPERATOR: 'operator', JMC: 'jmc', MDOC: 'mdoc' };

export function TierPill({ tier, tiers }: { tier: ApprovalTier; tiers: ApprovalTiers }) {
  const { t } = useTranslation();
  const band = tierBand(tier, tiers);
  return (
    <span className={`ad-tier ad-tier--${MOD[tier]}`} title={t(band.key, band.params)}>
      {t(`tier.pill.${tier}`)}
    </span>
  );
}

/**
 * The SOURCE tag for one company's ladder: is it the system default, or one approved for it?
 *
 * Deliberately in the ladder's own brand vocabulary, not `--status-*` — the same reasoning that
 * keeps `TierPill` out of the status palette. Where a ladder came from is a standing fact about an
 * authority, not a lifecycle state: it does not progress and it cannot be late.
 */
export function LadderSourceTag({ own, full }: { own: boolean; full?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`ad-ladder__src${own ? ' ad-ladder__src--own' : ''}`}>
      {t(full ? (own ? 'tier.srcOwnCo' : 'tier.srcDefaultCo') : own ? 'tier.srcOwn' : 'tier.srcDefault')}
    </span>
  );
}

/**
 * The one sentence every SYSTEM-DESCRIBING surface owes since 2026-08-25.
 *
 * The rule from ops/OPERATOR-TIERS-SPEC.md §7: a surface that describes ONE TENDER passes that
 * tender's operator's resolved ladder, and a surface that describes THE SYSTEM shows the default
 * — but must say that it is the default and how many companies stand outside it. Printing the
 * default unlabelled is what made these surfaces untrue the day the override landed, and this
 * component is the single place that fixes them all: the explainer, the triad, the room's donut,
 * the A4 brief and the vendor report read the SAME two sentences and the SAME count.
 *
 * The counter links to the operating-companies registry rather than tabulating twelve ladders
 * here: that registry is where each one is named, and where it can be changed.
 */
export function DefaultLadderNote({ state, className }: { state: State; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const n = operatorsWithOwnTiers(state).length;
  return (
    <p className={className}>
      {t('tier.defaultTagged')}{' '}
      {n === 0 ? (
        t('tier.ownCountNone')
      ) : (
        <>
          {t('tier.ownCount', { n: fmtCount(n, lang) })}{' '}
          <a className="acc-open" href="#/admin/operators">{t('tier.ownLink')}</a>
        </>
      )}
    </p>
  );
}

/**
 * The SHORT form of the note above, for a surface that prints ONE default-derived FIGURE rather
 * than the whole ladder — §7 bands 5 (the role card's «يوافق حتى») and 7 (the room's donut).
 *
 * `DefaultLadderNote` does not fit there: its two sentences explain what a ladder is, and beside a
 * single ceiling that is a paragraph answering a question the reader did not ask. What the figure
 * owes is one clause — «and it may differ at a company on a ladder of its own (N)» — and it owes
 * it ONLY when such a company exists. At N = 0 the default IS the whole truth, so the line is not
 * merely hidden but absent: a caveat with nothing to caveat teaches the reader to distrust a
 * number that is in fact exact everywhere.
 *
 * The count is `operatorsWithOwnTiers` — the same intersection of the override map with the live
 * registry that the long note, the registry KPI and the tests all read. There is no second count
 * anywhere, so two surfaces cannot disagree about how many companies stand outside the default.
 */
export function OverrideCaveat({ state, className }: { state: State; className?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const n = operatorsWithOwnTiers(state).length;
  if (n === 0) return null;
  return <p className={className}>{t('tier.mayDiffer', { n: fmtCount(n, lang) })}</p>;
}
