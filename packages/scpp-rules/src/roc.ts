import {
  IRAQ_CALENDAR,
  addCalendarDays,
  addWorkingDays,
  toIso,
  type DateInput,
  type WorkingCalendar,
} from '@masaar/working-days';

/**
 * ROC participation tiers (6.5 / 12.2):
 *   within FA                          → information only (6.5)
 *   > max($2M, 25% of FA)              → 1 ROC observer in technical evaluation, nominate ≤ 5 WD (12.2.3)
 *   above FA                           → ROC witnesses opening + validates results, nominate ≤ 14 d (12.2.2)
 * Missed nomination deadline → LC proceeds without them.
 * FA values come from each Service Contract (§7) — configurable per operator.
 *
 * NAMING — «ROC» here is the SCPP document's own term for the parent oil company that oversees
 * the Lead Contractor. This engine is a transcription of that document, so its identifiers stay
 * spelled the way the clauses they cite are (`rocParticipation`, `RocTier`, clause '12.2.2'):
 * renaming them would make the code stop matching the law it is quoting. For THIS deployment the
 * parent company is «شركة نفط الوسط» / MDOC, and that is the only name any user, screen, report
 * or role ever sees — the whole app layer above this package speaks MDOC (client decision ق2).
 */

export type RocTier = 'information-only' | 'observer' | 'witness-validate';

export const OBSERVER_FLOOR_USD = 2_000_000;
export const OBSERVER_FA_RATIO = 0.25;
export const OBSERVER_NOMINATION_WD = 5; // 12.2.3
export const WITNESS_NOMINATION_DAYS = 14; // 12.2.2 (calendar days)

export interface RocParticipation {
  tier: RocTier;
  clause: '6.5' | '12.2.3' | '12.2.2';
  /** ISO nomination deadline when a trigger date is provided */
  nominationDeadline?: string;
}

export function rocParticipation(
  tenderValueUSD: number,
  financialAuthorityUSD: number,
  triggeredOn?: DateInput,
  cal: WorkingCalendar = IRAQ_CALENDAR,
): RocParticipation {
  if (tenderValueUSD > financialAuthorityUSD) {
    return {
      tier: 'witness-validate',
      clause: '12.2.2',
      nominationDeadline: triggeredOn ? toIso(addCalendarDays(triggeredOn, WITNESS_NOMINATION_DAYS)) : undefined,
    };
  }
  const observerThreshold = Math.max(OBSERVER_FLOOR_USD, OBSERVER_FA_RATIO * financialAuthorityUSD);
  if (tenderValueUSD > observerThreshold) {
    return {
      tier: 'observer',
      clause: '12.2.3',
      nominationDeadline: triggeredOn ? toIso(addWorkingDays(triggeredOn, OBSERVER_NOMINATION_WD, cal)) : undefined,
    };
  }
  return { tier: 'information-only', clause: '6.5' };
}
